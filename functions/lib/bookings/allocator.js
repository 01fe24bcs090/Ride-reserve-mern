import { Timestamp } from "firebase-admin/firestore";
import { HttpsError } from "firebase-functions/v2/https";
import { defineInt } from "firebase-functions/params";
import { db } from "../lib/firebase.js";
const BASE_FARE = defineInt("BASE_FARE", { default: 30 });
const ACTIVE_STATUSES = ["pending", "confirmed", "in-progress"];
function parseHmToMinutes(value) {
    const [hPart, mPart] = value.split(":");
    const h = Number(hPart);
    const m = Number(mPart);
    if (hPart === undefined || mPart === undefined || Number.isNaN(h) || Number.isNaN(m)) {
        throw new HttpsError("invalid-argument", `Invalid HH:MM value: ${value}`);
    }
    return h * 60 + m;
}
function scheduledTimestampForToday(hhmm) {
    // India is always UTC+5:30 (no DST)
    const now = new Date();
    const indiaTime = new Date(now.getTime() + 5.5 * 60 * 60 * 1000);
    const year = indiaTime.getUTCFullYear();
    const month = String(indiaTime.getUTCMonth() + 1).padStart(2, "0");
    const day = String(indiaTime.getUTCDate()).padStart(2, "0");
    const iso = `${year}-${month}-${day}T${hhmm}:00+05:30`;
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) {
        throw new HttpsError("invalid-argument", `Invalid schedule time: ${hhmm}`);
    }
    return Timestamp.fromDate(date);
}
async function evaluatePeakFare(scheduledHm) {
    const target = parseHmToMinutes(scheduledHm);
    const peakSnapshot = await db.collection("peakHours").get();
    let multiplier = 1;
    for (const peakDoc of peakSnapshot.docs) {
        const peak = peakDoc.data();
        if (!peak.startTime || !peak.endTime || !peak.multiplier) {
            continue;
        }
        const start = parseHmToMinutes(peak.startTime);
        const end = parseHmToMinutes(peak.endTime);
        const inWindow = target >= start && target <= end;
        if (inWindow && peak.multiplier > multiplier) {
            multiplier = Number(peak.multiplier);
        }
    }
    const baseFare = BASE_FARE.value();
    return {
        isPeakHour: multiplier > 1,
        multiplier,
        fare: Math.round(baseFare * multiplier),
    };
}
function flattenSeatNumbers(record) {
    if (Array.isArray(record.seatNumbers)) {
        return record.seatNumbers.filter((seat) => Number.isInteger(seat));
    }
    if (Number.isInteger(record.seatNumber)) {
        return [record.seatNumber];
    }
    return [];
}
function allocateNextSeats(totalSeats, occupied, requestedSeats) {
    const assigned = [];
    for (let seat = 1; seat <= totalSeats; seat += 1) {
        if (!occupied.has(seat)) {
            assigned.push(seat);
            if (assigned.length === requestedSeats) {
                break;
            }
        }
    }
    return assigned;
}
async function getAvailableSeatCount(bovId, totalSeats, scheduledTime) {
    const snapshot = await db
        .collection("bookings")
        .where("bovId", "==", bovId)
        .where("rideStatus", "in", ACTIVE_STATUSES)
        .where("scheduledTime", "==", scheduledTime)
        .get();
    const occupied = new Set();
    snapshot.docs.forEach((doc) => {
        flattenSeatNumbers(doc.data()).forEach((seat) => occupied.add(seat));
    });
    return totalSeats - occupied.size;
}
export async function allocateBooking(input) {
    if (input.seats < 1 || input.seats > 4) {
        throw new HttpsError("invalid-argument", "Seats must be between 1 and 4");
    }
    const trainRef = db.collection("trains").doc(input.trainNumber.trim());
    const trainSnapshot = await trainRef.get();
    if (!trainSnapshot.exists) {
        throw new HttpsError("not-found", "Train not found");
    }
    const train = trainSnapshot.data();
    if (!train.isActive) {
        throw new HttpsError("failed-precondition", "This train is currently inactive");
    }
    const scheduledHm = input.journeyType === "arrival"
        ? train.scheduledArrival ?? train.scheduledDeparture
        : train.scheduledDeparture ?? train.scheduledArrival;
    if (!scheduledHm) {
        throw new HttpsError("failed-precondition", "Train schedule data is incomplete");
    }
    const scheduledTime = scheduledTimestampForToday(scheduledHm);
    const fareInfo = await evaluatePeakFare(scheduledHm);
    const fromPlatform = String(train.platformNumber);
    const bovSnapshot = await db
        .collection("bovs")
        .where("status", "==", "active")
        .where("currentPlatform", "==", fromPlatform)
        .where("assignedDriverId", "!=", null)
        .get();
    if (bovSnapshot.empty) {
        throw new HttpsError("resource-exhausted", "No active BOV available at this platform");
    }
    let selected = null;
    for (const bovDoc of bovSnapshot.docs) {
        const bov = bovDoc.data();
        const availableSeats = await getAvailableSeatCount(bovDoc.id, bov.totalSeats, scheduledTime);
        if (availableSeats >= input.seats) {
            if (!selected || availableSeats > selected.availableSeats) {
                selected = {
                    ...bov,
                    bovId: bovDoc.id,
                    availableSeats,
                };
            }
        }
    }
    if (!selected) {
        throw new HttpsError("resource-exhausted", "No BOV with enough seats is currently available");
    }
    const bookingRef = db.collection("bookings").doc();
    const selectedBovRef = db.collection("bovs").doc(selected.bovId);
    let finalSeatNumbers = [];
    await db.runTransaction(async (tx) => {
        const bovDoc = await tx.get(selectedBovRef);
        if (!bovDoc.exists) {
            throw new HttpsError("aborted", "Selected BOV no longer exists");
        }
        const bov = bovDoc.data();
        if (bov.status !== "active" || bov.currentPlatform !== fromPlatform || !bov.assignedDriverId) {
            throw new HttpsError("aborted", "Selected BOV is no longer eligible");
        }
        const concurrentBookingsQuery = db
            .collection("bookings")
            .where("bovId", "==", selected.bovId)
            .where("rideStatus", "in", ACTIVE_STATUSES)
            .where("scheduledTime", "==", scheduledTime);
        const concurrentBookings = await tx.get(concurrentBookingsQuery);
        const occupiedSeats = new Set();
        concurrentBookings.docs.forEach((doc) => {
            flattenSeatNumbers(doc.data()).forEach((seat) => occupiedSeats.add(seat));
        });
        const assignedSeats = allocateNextSeats(bov.totalSeats, occupiedSeats, input.seats);
        if (assignedSeats.length !== input.seats) {
            throw new HttpsError("aborted", "Seat availability changed, please try again");
        }
        finalSeatNumbers = assignedSeats;
        tx.set(bookingRef, {
            bookingId: bookingRef.id,
            passengerId: input.passengerId,
            passengerName: input.passengerName,
            trainNumber: train.trainNumber,
            lookupType: input.lookupType,
            pnr: input.pnr ?? null,
            journeyType: input.journeyType,
            isPriorityPassenger: input.isPriorityPassenger,
            luggageType: input.luggageType,
            fromPlatform,
            toPlatform: input.toPlatform,
            pickupPoint: input.pickupPoint ?? null,
            passengerCount: input.passengerCount,
            seats: input.seats,
            seatNumbers: assignedSeats,
            bovId: selected.bovId,
            bovVehicleNumber: selected.vehicleNumber,
            rideStatus: "confirmed",
            scheduledTime,
            isPeakHour: fareInfo.isPeakHour,
            fare: fareInfo.fare,
            createdAt: Timestamp.now(),
        });
    });
    return {
        bookingId: bookingRef.id,
        bovId: selected.bovId,
        vehicleNumber: selected.vehicleNumber,
        seatNumbers: finalSeatNumbers,
        fare: fareInfo.fare,
        isPeakHour: fareInfo.isPeakHour,
        scheduledTime: scheduledTime.toDate().toISOString(),
        fromPlatform,
    };
}
export async function estimateFare(trainNumber, journeyType) {
    const trainRef = db.collection("trains").doc(trainNumber.trim());
    const trainSnapshot = await trainRef.get();
    if (!trainSnapshot.exists) {
        throw new HttpsError("not-found", "Train not found");
    }
    const train = trainSnapshot.data();
    if (!train.isActive) {
        throw new HttpsError("failed-precondition", "This train is currently inactive");
    }
    const scheduledHm = journeyType === "arrival"
        ? train.scheduledArrival ?? train.scheduledDeparture
        : train.scheduledDeparture ?? train.scheduledArrival;
    if (!scheduledHm) {
        throw new HttpsError("failed-precondition", "Train schedule data is incomplete");
    }
    const fareInfo = await evaluatePeakFare(scheduledHm);
    return {
        baseFare: BASE_FARE.value(),
        fare: fareInfo.fare,
        multiplier: fareInfo.multiplier,
        isPeakHour: fareInfo.isPeakHour,
        fromPlatform: train.platformNumber,
    };
}
