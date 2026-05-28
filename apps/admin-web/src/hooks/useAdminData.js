import { useState, useEffect } from "react";
import api from "../api/client";
export function useAdminData(triggerRefetch) {
    const [bovs, setBovs] = useState([]);
    const [drivers, setDrivers] = useState([]);
    const [trains, setTrains] = useState([]);
    const [bookings, setBookings] = useState([]);
    const [peakHours, setPeakHours] = useState([]);
    const [platforms, setPlatforms] = useState([]);
    const [loading, setLoading] = useState(true);
    useEffect(() => {
        let isMounted = true;
        const fetchData = async () => {
            try {
                const [{ data: bovsData }, { data: driversData }, { data: trainsData }, { data: bookingsData }, { data: peakHoursData }] = await Promise.all([
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
            }
            catch (err) {
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
