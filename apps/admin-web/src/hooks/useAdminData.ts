import { useState, useEffect } from "react";
import api from "../api/client";
import { BovDoc as Bov, UserDoc as Driver, TrainDoc as Train, PeakHourDoc as PeakHour, PlatformDoc as Platform, BookingDoc as Booking } from "@ride-reserve/types";

export function useAdminData(triggerRefetch: number) {
  const [bovs, setBovs] = useState<Bov[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [trains, setTrains] = useState<Train[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [peakHours, setPeakHours] = useState<PeakHour[]>([]);
  const [platforms, setPlatforms] = useState<Platform[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    
    const fetchData = async () => {
      try {
        const [
          { data: bovsData },
          { data: driversData },
          { data: trainsData },
          { data: bookingsData },
          { data: peakHoursData }
        ] = await Promise.all([
          api.get('/bovs'),
          api.get('/users/drivers'),
          api.get('/trains'),
          api.get('/bookings'),
          api.get('/peakhours')
        ]);
        
        if (isMounted) {
          setBovs(bovsData);
          setDrivers(driversData);
          setTrains(trainsData);
          setBookings(bookingsData);
          setPeakHours(peakHoursData);
          setPlatforms([]); // Hardcoded in mockData or add endpoint if needed
          setLoading(false);
        }
      } catch (err) {
        if (isMounted) {
          console.error("Failed to fetch admin data", err);
          setLoading(false);
        }
      }
    };

    fetchData();
    const interval = setInterval(fetchData, 10000);

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [triggerRefetch]);

  return { bovs, drivers, trains, bookings, peakHours, platforms, loading };
}
