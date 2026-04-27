import { HttpsError, onCall } from "firebase-functions/v2/https";
import { logger } from "firebase-functions";
import { allocateBooking, estimateFare } from "./allocator.js";
import { db } from "../lib/firebase.js";
export const onBookingCreate = onCall(async (request) => {
    if (!request.auth) {
        throw new HttpsError("unauthenticated", "Authentication is required");
    }
    const userId = request.auth.uid;
    const userSnapshot = await db.collection("users").doc(userId).get();
    if (!userSnapshot.exists) {
        throw new HttpsError("failed-precondition", "User profile not found");
    }
    const user = userSnapshot.data();
    if (user.role !== "passenger") {
        throw new HttpsError("permission-denied", "Only passengers can create bookings");
    }
    const data = request.data;
    const trainNumber = String(data.trainNumber ?? "").trim();
    const toPlatform = String(data.toPlatform ?? "").trim();
    const seats = Number(data.seats ?? 1);
    const lookupType = data.lookupType === "pnr" ? "pnr" : "trainNumber";
    const journeyType = data.journeyType === "departure" ? "departure" : "arrival";
    const luggageType = ["none", "light", "heavy"].includes(String(data.luggageType))
        ? data.luggageType
        : "none";
    if (!trainNumber) {
        throw new HttpsError("invalid-argument", "trainNumber is required");
    }
    if (!toPlatform) {
        throw new HttpsError("invalid-argument", "toPlatform is required");
    }
    const allocation = await allocateBooking({
        passengerId: userId,
        passengerName: user.name ?? "Passenger",
        trainNumber,
        toPlatform,
        seats,
        journeyType,
        lookupType,
        pnr: data.pnr ? String(data.pnr) : null,
        pickupPoint: data.pickupPoint ? String(data.pickupPoint) : null,
        luggageType,
        isPriorityPassenger: Boolean(data.isPriorityPassenger),
        passengerCount: Number(data.passengerCount ?? seats),
    });
    logger.info("Booking allocated", { bookingId: allocation.bookingId, userId });
    return allocation;
});
export const getFareEstimate = onCall(async (request) => {
    if (!request.auth) {
        throw new HttpsError("unauthenticated", "Authentication is required");
    }
    const data = request.data;
    const trainNumber = String(data.trainNumber ?? "").trim();
    const journeyType = data.journeyType === "departure" ? "departure" : "arrival";
    if (!trainNumber) {
        throw new HttpsError("invalid-argument", "trainNumber is required");
    }
    return estimateFare(trainNumber, journeyType);
});
