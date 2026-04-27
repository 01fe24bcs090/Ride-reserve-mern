import { useState, useEffect } from "react";
import { collection, onSnapshot, query, where, orderBy } from "firebase/firestore";
import { db } from "../lib/firebase";
import { BookingDoc as Ride } from "@ride-reserve/types";

export function useDriverRides(driverUid: string | undefined) {
  const [rides, setRides] = useState<Ride[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!db || !driverUid) {
      setRides([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    // Subscribe to all pending rides (Marketplace)
    const q = query(
      collection(db, "bookings"),
      where("rideStatus", "in", ["pending", "confirmed", "in-progress"]),
      orderBy("createdAt", "desc")
    );

    const unsubscribe = onSnapshot(q, (snap) => {
      const data = snap.docs.map(d => ({ ...d.data(), docId: d.id } as Ride & { docId: string }));
      // Show pending rides + rides assigned to this driver
      setRides(data.filter(r => r.rideStatus === "pending" || r.acceptedBy === driverUid));
      setLoading(false);
      setError(null);
    }, (err) => {
      console.error("Firestore error in useDriverRides:", err);
      setError(err.message);
      setLoading(false);
    });

    return unsubscribe;
  }, [driverUid]);

  return { rides, loading, error };
}
