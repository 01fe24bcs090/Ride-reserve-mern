import { useState, useEffect } from "react";
import { 
  subscribeToPassengerBookings, 
  createBooking, 
  lookupTrain, 
  getFareEstimate,
  BookingHistoryItem
} from "../lib/api";
import { BookingCreateInput } from "@ride-reserve/types";

export function useBookings(passengerUid: string | undefined) {
  const [bookingHistory, setBookingHistory] = useState<BookingHistoryItem[]>([]);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!passengerUid) {
      setBookingHistory([]);
      return;
    }

    const unsubscribe = subscribeToPassengerBookings(
      passengerUid,
      (items) => setBookingHistory(items),
      (error) => setStatus(error.message || "Unable to load history.")
    );

    return unsubscribe;
  }, [passengerUid]);

  const confirmBooking = async (input: BookingCreateInput) => {
    setBusy(true);
    setStatus("Creating booking...");
    try {
      const result = await createBooking(input);
      setStatus("Booking confirmed and allocated.");
      return result;
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Booking failed.";
      setStatus(msg);
      throw error;
    } finally {
      setBusy(false);
    }
  };

  return {
    bookingHistory,
    status,
    setStatus,
    busy,
    confirmBooking,
    lookupTrain,
    getFareEstimate
  };
}
