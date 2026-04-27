import { 
  collection, 
  doc, 
  getDoc, 
  getDocs, 
  query, 
  where, 
  runTransaction, 
  Timestamp,
  serverTimestamp
} from "firebase/firestore";
import { db } from "./firebase";

const BASE_FARE = 30;
const ACTIVE_STATUSES = ["pending", "confirmed", "in-progress"];

export interface BookingAllocationInput {
  passengerId: string;
  passengerName: string;
  trainNumber: string;
  toPlatform: string;
  seats: number;
  journeyType: "arrival" | "departure";
  lookupType: "pnr" | "trainNumber";
  pnr?: string | null;
  pickupPoint?: string | null;
  luggageType: "none" | "light" | "heavy";
  isPriorityPassenger: boolean;
  passengerCount: number;
}

interface TrainRecord {
  trainNumber: string;
  trainName: string;
  isActive: boolean;
  platformNumber: string;
  scheduledArrival: string | null;
  scheduledDeparture: string | null;
}

interface BovRecord {
  bovId: string;
  vehicleNumber: string;
  totalSeats: number;
  assignedDriverId: string | null;
  status: "active" | "inactive" | "maintenance";
  currentPlatform: string;
}

function parseHmToMinutes(value: string): number {
  if (!value) return 0;
  const [hPart, mPart] = value.split(":");
  const h = Number(hPart);
  const m = Number(mPart);
  if (hPart === undefined || mPart === undefined || Number.isNaN(h) || Number.isNaN(m)) {
    throw new Error(`Invalid time format: ${value}. Expected HH:MM.`);
  }
  return h * 60 + m;
}

function scheduledTimestampForToday(hhmm: string): Timestamp {
  const now = new Date();
  const indiaTime = new Date(now.getTime() + 5.5 * 60 * 60 * 1000);

  const year = indiaTime.getUTCFullYear();
  const month = String(indiaTime.getUTCMonth() + 1).padStart(2, "0");
  const day = String(indiaTime.getUTCDate()).padStart(2, "0");

  const iso = `${year}-${month}-${day}T${hhmm}:00+05:30`;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid schedule time: ${hhmm}`);
  }

  return Timestamp.fromDate(date);
}

export async function evaluatePeakFare(scheduledHm: string): Promise<{
  isPeakHour: boolean;
  fare: number;
  multiplier: number;
}> {
  if (!db) throw new Error("Database not initialized");
  
  const target = parseHmToMinutes(scheduledHm);
  const peakSnapshot = await getDocs(collection(db!, "peakHours"));
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

  return {
    isPeakHour: multiplier > 1,
    multiplier,
    fare: Math.round(BASE_FARE * multiplier),
  };
}

function flattenSeatNumbers(record: Record<string, unknown>): number[] {
  if (Array.isArray(record.seatNumbers)) {
    return record.seatNumbers.filter((seat) => Number.isInteger(seat)) as number[];
  }
  if (Number.isInteger(record.seatNumber)) {
    return [record.seatNumber as number];
  }
  return [];
}

function allocateNextSeats(totalSeats: number, occupied: Set<number>, requestedSeats: number): number[] {
  const assigned: number[] = [];
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

async function getAvailableSeatCount(
  bovId: string,
  totalSeats: number,
  scheduledTime: Timestamp,
): Promise<number> {
  if (!db) return 0;
  
  const bookingsQuery = query(
    collection(db!, "bookings"),
    where("bovId", "==", bovId),
    where("rideStatus", "in", ACTIVE_STATUSES),
    where("scheduledTime", "==", scheduledTime)
  );
  
  const snapshot = await getDocs(bookingsQuery);
  const occupied = new Set<number>();
  snapshot.docs.forEach((doc) => {
    flattenSeatNumbers(doc.data()).forEach((seat) => occupied.add(seat));
  });
  return totalSeats - occupied.size;
}

export async function allocateBookingClientSide(input: BookingAllocationInput) {
  if (!db) throw new Error("Database not initialized");
  
  if (input.seats < 1 || input.seats > 5) {
    throw new Error("Number of seats must be between 1 and 5.");
  }

  const trainRef = doc(db!, "trains", input.trainNumber.trim());
  const trainSnapshot = await getDoc(trainRef);
  if (!trainSnapshot.exists()) {
    throw new Error("Train not found");
  }

  const train = trainSnapshot.data() as TrainRecord;
  if (!train.isActive) {
    throw new Error("This train is currently inactive");
  }

  const scheduledHm =
    input.journeyType === "arrival"
      ? train.scheduledArrival || train.scheduledDeparture
      : train.scheduledDeparture || train.scheduledArrival;
  
  if (!scheduledHm || !scheduledHm.includes(":")) {
    throw new Error(`Train ${input.trainNumber} does not have valid schedule data for ${input.journeyType}.`);
  }

  const scheduledTime = scheduledTimestampForToday(scheduledHm);
  const fareInfo = await evaluatePeakFare(scheduledHm);

  const fromPlatform = String(train.platformNumber);
  const bovsQuery = query(
    collection(db!, "bovs"),
    where("status", "==", "active"),
    where("currentPlatform", "==", fromPlatform)
  );
  
  const bovSnapshot = await getDocs(bovsQuery);
  const allBovsAtPlatform = bovSnapshot.docs.map(d => ({ ...d.data(), bovId: d.id } as BovRecord));
  const activeBovs = allBovsAtPlatform.filter(b => b.assignedDriverId !== null);

  if (allBovsAtPlatform.length === 0) {
    throw new Error(`No active BOVs are currently registered at Platform ${fromPlatform}.`);
  }

  if (activeBovs.length === 0) {
    throw new Error(`BOVs are present at Platform ${fromPlatform}, but none have an assigned driver.`);
  }

  let selected: (BovRecord & { availableSeats: number }) | null = null;
  for (const bov of activeBovs) {
    const availableSeats = await getAvailableSeatCount(bov.bovId, bov.totalSeats, scheduledTime);
    if (availableSeats >= input.seats) {
      if (!selected || availableSeats > selected.availableSeats) {
        selected = {
          ...bov,
          availableSeats,
        };
      }
    }
  }

  if (!selected) {
    throw new Error("No BOV with enough seats is currently available at your scheduled time.");
  }

  const bookingId = `RR-${Math.random().toString(36).substr(2, 6).toUpperCase()}`;
  const bookingRef = doc(db!, "bookings", bookingId);

  await runTransaction(db, async (transaction) => {
    transaction.set(bookingRef, {
      bookingId: bookingId,
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
      seatNumbers: [], // No seats yet
      bovId: "",       // No BOV assigned yet
      bovVehicleNumber: "",
      rideStatus: "pending",
      scheduledTime,
      isPeakHour: fareInfo.isPeakHour,
      fare: fareInfo.fare * input.seats,
      createdAt: new Date().toISOString(),
      serverCreatedAt: serverTimestamp()
    });
  });

  return {
    bookingId: bookingId,
    bovId: "",
    vehicleNumber: "",
    seatNumbers: [],
    fare: fareInfo.fare * input.seats,
    isPeakHour: fareInfo.isPeakHour,
    scheduledTime: scheduledTime.toDate().toISOString(),
    fromPlatform,
  };
}

export async function estimateFareClientSide(trainNumber: string, journeyType: "arrival" | "departure") {
  if (!db) throw new Error("Database not initialized");
  
  const trainRef = doc(db!, "trains", trainNumber.trim());
  const trainSnapshot = await getDoc(trainRef);
  if (!trainSnapshot.exists()) {
    throw new Error("Train not found");
  }
  const train = trainSnapshot.data() as TrainRecord;
  if (!train.isActive) {
    throw new Error("This train is currently inactive");
  }

  const scheduledHm =
    journeyType === "arrival"
      ? train.scheduledArrival ?? train.scheduledDeparture
      : train.scheduledDeparture ?? train.scheduledArrival;
  if (!scheduledHm) {
    throw new Error("Train schedule data is incomplete");
  }

  const fareInfo = await evaluatePeakFare(scheduledHm);
  return {
    baseFare: BASE_FARE,
    fare: fareInfo.fare,
    multiplier: fareInfo.multiplier,
    isPeakHour: fareInfo.isPeakHour,
    fromPlatform: train.platformNumber,
  };
}
