import { useState, useEffect } from "react";
import { collection, onSnapshot, query, orderBy, where, limit } from "firebase/firestore";
import { db } from "../lib/firebase";
export function useAdminData() {
    const [bovs, setBovs] = useState([]);
    const [drivers, setDrivers] = useState([]);
    const [trains, setTrains] = useState([]);
    const [bookings, setBookings] = useState([]);
    const [peakHours, setPeakHours] = useState([]);
    const [platforms, setPlatforms] = useState([]);
    const [loading, setLoading] = useState(true);
    useEffect(() => {
        if (!db)
            return;
        const unsubBovs = onSnapshot(collection(db, "bovs"), (snap) => {
            setBovs(snap.docs.map(d => ({ ...d.data() })));
        });
        const unsubDrivers = onSnapshot(query(collection(db, "users"), where("role", "==", "driver")), (snap) => {
            setDrivers(snap.docs.map(d => ({ ...d.data() })));
        });
        const unsubTrains = onSnapshot(collection(db, "trains"), (snap) => {
            setTrains(snap.docs.map(d => ({ ...d.data() })));
        });
        const unsubBookings = onSnapshot(query(collection(db, "bookings"), orderBy("createdAt", "desc"), limit(200)), (snap) => {
            setBookings(snap.docs.map(d => ({ ...d.data(), bookingId: d.id })));
        });
        const unsubPeak = onSnapshot(collection(db, "peakHours"), (snap) => {
            setPeakHours(snap.docs.map(d => ({ ...d.data(), id: d.id })));
        });
        const unsubPlatforms = onSnapshot(collection(db, "platforms"), (snap) => {
            setPlatforms(snap.docs.map(d => ({ ...d.data() })));
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
