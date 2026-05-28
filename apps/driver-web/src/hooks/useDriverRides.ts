import { useState, useEffect } from "react";
import api from "../api/client";
import { BookingDoc as Ride } from "@ride-reserve/types";

export function useDriverRides(driverUid: string | undefined) {
  const [rides, setRides] = useState<Ride[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!driverUid) {
      setRides([]);
      setLoading(false);
      return;
    }

    let isMounted = true;
    
    const fetchRides = async () => {
      try {
        const { data } = await api.get('/bookings'); // We should get all pending bookings
        if (isMounted) {
          // In a real app we might filter by platform/assigned driver etc.
          // For now just match the logic
          const relevantRides = data.filter((r: Ride) => r.rideStatus === "pending" || r.acceptedBy === driverUid);
          setRides(relevantRides);
          setLoading(false);
          setError(null);
        }
      } catch (err: any) {
        if (isMounted) {
          console.error("API error in useDriverRides:", err);
          setError(err.message || "Failed to load rides");
          setLoading(false);
        }
      }
    };

    fetchRides();
    const interval = setInterval(fetchRides, 5000); // Polling for now

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [driverUid]);

  return { rides, loading, error };
}
