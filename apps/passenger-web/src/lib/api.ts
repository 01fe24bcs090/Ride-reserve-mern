import type { BookingDoc } from "@ride-reserve/types";
import {
  collection,
  onSnapshot,
  query,
  where,
  doc,
  getDoc,
} from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, functions, auth, firebaseReady } from "./firebase";
import { mockTrainByNumber } from "./mockData";
import { allocateBookingClientSide, estimateFareClientSide } from "./allocation";

export type JourneyType = "arrival" | "departure";
export type LuggageType = "none" | "light" | "heavy";

export interface BookingPayload {
  trainNumber: string;
  toPlatform: string;
  seats: number;
  passengerCount: number;
  journeyType: JourneyType;
  pickupPoint?: string;
  luggageType: LuggageType;
  isPriorityPassenger: boolean;
}

export interface BookingHistoryItem extends BookingDoc {}

function toIsoString(value: unknown) {
  if (
    value &&
    typeof value === "object" &&
    "toDate" in value &&
    typeof (value as { toDate?: unknown }).toDate === "function"
  ) {
    return (value as { toDate: () => Date }).toDate().toISOString();
  }

  if (typeof value === "string") {
    return value;
  }

  return new Date().toISOString();
}

function normalizeBookingDoc(id: string, data: Record<string, unknown>): BookingHistoryItem {
  return {
    bookingId: typeof data.bookingId === "string" ? data.bookingId : id,
    passengerId: typeof data.passengerId === "string" ? data.passengerId : "",
    passengerName: typeof data.passengerName === "string" ? data.passengerName : "Passenger",
    trainNumber: typeof data.trainNumber === "string" ? data.trainNumber : "",
    journeyType: data.journeyType === "departure" ? "departure" : "arrival",
    isPriorityPassenger: Boolean(data.isPriorityPassenger),
    luggageType:
      data.luggageType === "light" || data.luggageType === "heavy" ? data.luggageType : "none",
    fromPlatform: typeof data.fromPlatform === "string" ? data.fromPlatform : "",
    toPlatform: typeof data.toPlatform === "string" ? data.toPlatform : "",
    pickupPoint: typeof data.pickupPoint === "string" ? data.pickupPoint : null,
    passengerCount:
      typeof data.passengerCount === "number"
        ? data.passengerCount
        : typeof data.seats === "number"
          ? data.seats
          : 0,
    seats: typeof data.seats === "number" ? data.seats : 0,
    seatNumbers: Array.isArray(data.seatNumbers)
      ? data.seatNumbers.filter((seat): seat is number => Number.isInteger(seat))
      : [],
    bovId: typeof data.bovId === "string" ? data.bovId : "",
    bovVehicleNumber:
      typeof data.bovVehicleNumber === "string" ? data.bovVehicleNumber : "",
    rideStatus:
      data.rideStatus === "pending" ||
      data.rideStatus === "in-progress" ||
      data.rideStatus === "completed" ||
      data.rideStatus === "cancelled"
        ? data.rideStatus
        : "confirmed",
    scheduledTime: toIsoString(data.scheduledTime),
    isPeakHour: Boolean(data.isPeakHour),
    fare: typeof data.fare === "number" ? data.fare : 0,
    acceptedBy: typeof data.acceptedBy === "string" ? data.acceptedBy : null,
    createdAt: toIsoString(data.createdAt),
  };
}

export async function lookupTrain(trainNumber: string) {
  if (firebaseReady && db) {
    const trainRef = doc(db, "trains", trainNumber);
    const trainSnap = await getDoc(trainRef);
    
    if (!trainSnap.exists()) {
      throw new Error("Train not found in database. Please verify the number.");
    }
    
    const trainData = trainSnap.data();
    if (!trainData.isActive) {
      throw new Error("This train is currently not available for BOV booking.");
    }
    return trainData;
  }

  const local = mockTrainByNumber[trainNumber];
  if (!local) {
    throw new Error("Train not found. Please verify the number or contact station staff.");
  }
  if (!local.isActive) {
    throw new Error("This train is currently not available for BOV booking.");
  }
  return local as unknown as Record<string, unknown>;
}

export async function getFareEstimate(trainNumber: string, journeyType: JourneyType) {
  return await estimateFareClientSide(trainNumber, journeyType);
}

export async function createBooking(payload: BookingPayload) {
  if (!auth?.currentUser) {
    throw new Error("Authentication is required to create a booking.");
  }

  return await allocateBookingClientSide({
    ...payload,
    passengerId: auth.currentUser.uid,
    passengerName: auth.currentUser.displayName || "Passenger",
    lookupType: "trainNumber",
  });
}

export function subscribeToPassengerBookings(
  passengerId: string,
  onData: (items: BookingHistoryItem[]) => void,
  onError: (error: Error) => void,
) {
  if (firebaseReady && db) {
    const bookingsQuery = query(
      collection(db, "bookings"),
      where("passengerId", "==", passengerId),
    );

    return onSnapshot(
      bookingsQuery,
      (snapshot) => {
        const items = snapshot.docs
          .map((docSnapshot) =>
            normalizeBookingDoc(
              docSnapshot.id,
              docSnapshot.data() as Record<string, unknown>,
            ),
          )
          .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
        onData(items);
      },
      (error) => {
        onError(error);
      },
    );
  }

  onData([]);
  return () => {};
}
