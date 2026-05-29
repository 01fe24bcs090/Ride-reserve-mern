import type { BookingDoc, BookingCreateInput } from "@ride-reserve/types";
import api from "../api/client";
import { mockTrainByNumber } from "./mockData";
import { estimateFareClientSide } from "./allocation";

export type JourneyType = "arrival" | "departure";
// Removed duplicate BookingPayload in favor of BookingCreateInput

export interface BookingHistoryItem extends BookingDoc {}

export async function lookupTrain(trainNumber: string) {
  try {
    // Try to fetch from API first
    const { data } = await api.get('/trains');
    const train = data.find((t: any) => t.trainNumber === trainNumber);
    
    if (train) {
      if (!train.isActive) {
        throw new Error("This train is currently not available for BOV booking.");
      }
      return train;
    }
    // Force fallback to mock database if remote API doesn't have this train
    throw new Error("Train not found in remote database.");
  } catch (error) {
    console.log("Falling back to local mock data for trains");
  }

  // Fallback to local
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

export async function createBooking(payload: BookingCreateInput) {
  const { data } = await api.post('/bookings', payload);
  return { bookingId: data.bookingId };
}

// Subscribing to bookings now uses a simple fetch, real-time will be handled via Socket.io context 
// For backward compatibility of the hook signature:
export function subscribeToPassengerBookings(
  passengerId: string,
  onData: (items: BookingHistoryItem[]) => void,
  onError: (error: Error) => void,
) {
  let isSubscribed = true;

  const fetchBookings = async () => {
    try {
      const { data } = await api.get('/bookings/me');
      if (isSubscribed) {
        onData(data);
      }
    } catch (error) {
      if (isSubscribed) {
        onError(error instanceof Error ? error : new Error('Failed to fetch bookings'));
      }
    }
  };

  fetchBookings();
  // Polling fallback if socket.io is not hooked up to this specific callback
  const interval = setInterval(fetchBookings, 10000);

  return () => {
    isSubscribed = false;
    clearInterval(interval);
  };
}
