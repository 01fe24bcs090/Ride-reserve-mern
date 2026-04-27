import { useState, useEffect, useMemo } from "react";
import { collection, onSnapshot, query, orderBy, where, limit } from "firebase/firestore";
import { db } from "../lib/firebase";
import { BovDoc as Bov, UserDoc as Driver, TrainDoc as Train, PeakHourDoc as PeakHour, PlatformDoc as Platform, BookingDoc as Booking } from "@ride-reserve/types";

export function useAdminData() {
  const [bovs, setBovs] = useState<Bov[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [trains, setTrains] = useState<Train[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [peakHours, setPeakHours] = useState<PeakHour[]>([]);
  const [platforms, setPlatforms] = useState<Platform[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!db) return;

    const unsubBovs = onSnapshot(collection(db, "bovs"), (snap) => {
      setBovs(snap.docs.map(d => ({ ...d.data() } as Bov)));
    });

    const unsubDrivers = onSnapshot(query(collection(db, "users"), where("role", "==", "driver")), (snap) => {
      setDrivers(snap.docs.map(d => ({ ...d.data() } as Driver)));
    });

    const unsubTrains = onSnapshot(collection(db, "trains"), (snap) => {
      setTrains(snap.docs.map(d => ({ ...d.data() } as Train)));
    });

    const unsubBookings = onSnapshot(query(collection(db, "bookings"), orderBy("createdAt", "desc"), limit(200)), (snap) => {
      setBookings(snap.docs.map(d => ({ ...d.data(), bookingId: d.id } as Booking)));
    });

    const unsubPeak = onSnapshot(collection(db, "peakHours"), (snap) => {
      setPeakHours(snap.docs.map(d => ({ ...d.data(), id: d.id } as PeakHour)));
    });

    const unsubPlatforms = onSnapshot(collection(db, "platforms"), (snap) => {
      setPlatforms(snap.docs.map(d => ({ ...d.data() } as Platform)));
    });

    setLoading(false);

    return () => {
      unsubBovs();
      unsubDrivers();
      unsubTrains();
      unsubBookings();
      unsubPeak();
      unsubPlatforms();
    };
  }, []);

  return { bovs, drivers, trains, bookings, peakHours, platforms, loading };
}
