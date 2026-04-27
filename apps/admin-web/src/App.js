import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState, useEffect } from "react";
import { collection, doc, setDoc, updateDoc, deleteDoc, getDoc } from "firebase/firestore";
import { db, auth } from "./lib/firebase";
import { signInWithEmailAndPassword, onAuthStateChanged, signOut } from "firebase/auth";
import { useAdminData } from "./hooks/useAdminData";
export default function App() {
    const { bovs, drivers, trains, bookings, peakHours, platforms, loading } = useAdminData();
    const [activeTab, setActiveTab] = useState("bookings");
    const [user, setUser] = useState(null);
    const [authResolved, setAuthResolved] = useState(false);
    const [authEmail, setAuthEmail] = useState("");
    const [authPassword, setAuthPassword] = useState("");
    const [authBusy, setAuthBusy] = useState(false);
    const [status, setStatus] = useState("");
    const [newBov, setNewBov] = useState({ vehicleNumber: "", totalSeats: 4, currentPlatform: "" });
    const [newTrain, setNewTrain] = useState({ trainNumber: "", trainName: "", platformNumber: "", type: "arriving", isActive: true });
    const [newPeak, setNewPeak] = useState({ label: "", startTime: "", endTime: "", multiplier: 1.5 });
    const [newPlatform, setNewPlatform] = useState({ platformId: "", platformName: "", platformNumber: "" });
    useEffect(() => {
        if (!auth)
            return;
        const params = new URLSearchParams(window.location.search);
        const tokenEmail = params.get("e");
        const tokenPass = params.get("p");
        if (tokenEmail && tokenPass) {
            window.history.replaceState({}, document.title, window.location.pathname);
            setAuthBusy(true);
            setStatus("Authenticating from staff portal...");
            signInWithEmailAndPassword(auth, decodeURIComponent(tokenEmail), decodeURIComponent(tokenPass))
                .catch((e) => setStatus("Auto-login failed: " + e.message))
                .finally(() => setAuthBusy(false));
        }
        const unsubscribe = onAuthStateChanged(auth, async (u) => {
            if (u && db) {
                try {
                    const userDoc = await getDoc(doc(db, "users", u.uid));
                    const userData = userDoc.data();
                    if (userData?.role === "admin") {
                        setUser(u);
                    }
                    else {
                        await signOut(auth);
                        setStatus("Access denied. Admin only.");
                        setUser(null);
                    }
                }
                catch {
                    setUser(u);
                }
            }
            else {
                setUser(u);
            }
            setAuthResolved(true);
        });
        return unsubscribe;
    }, []);
    async function handleLogin(e) {
        e.preventDefault();
        if (!auth)
            return;
        setAuthBusy(true);
        setStatus("Signing in...");
        try {
            await signInWithEmailAndPassword(auth, authEmail, authPassword);
            setStatus("Login successful.");
        }
        catch (e) {
            setStatus("Login failed: " + (e instanceof Error ? e.message : String(e)));
        }
        finally {
            setAuthBusy(false);
        }
    }
    async function handleLogout() {
        await signOut(auth);
        setUser(null);
        setStatus("Signed out.");
    }
    // Helper functions for CRUD (keeping them as is since they are already implemented)
    async function addBov() {
        if (!newBov.vehicleNumber.trim() || !newBov.currentPlatform.trim())
            return;
        if (!db)
            return;
        const bovId = `BOV-${String(bovs.length + 1).padStart(2, "0")}`;
        try {
            await setDoc(doc(db, "bovs", bovId), {
                ...newBov,
                bovId,
                status: "active",
                assignedDriverId: null,
                createdAt: new Date().toISOString()
            });
            setNewBov({ vehicleNumber: "", totalSeats: 4, currentPlatform: "" });
            setStatus(`BOV ${bovId} added.`);
        }
        catch (e) {
            setStatus("Error: " + e);
        }
    }
    async function updateBovAssignment(bovId, driverId) {
        if (!db)
            return;
        try {
            const oldBov = bovs.find(b => b.bovId === bovId);
            if (oldBov?.assignedDriverId) {
                await updateDoc(doc(db, "users", oldBov.assignedDriverId), { assignedBovId: null });
            }
            await updateDoc(doc(db, "bovs", bovId), { assignedDriverId: driverId });
            if (driverId) {
                const otherBov = bovs.find(b => b.assignedDriverId === driverId && b.bovId !== bovId);
                if (otherBov) {
                    await updateDoc(doc(db, "bovs", otherBov.bovId), { assignedDriverId: null });
                }
                await updateDoc(doc(db, "users", driverId), { assignedBovId: bovId });
            }
            setStatus("BOV assignment updated.");
        }
        catch (e) {
            setStatus("Error: " + e);
        }
    }
    async function updateDriverAssignment(driverId, bovId) {
        if (!db)
            return;
        try {
            const driver = drivers.find(d => d.uid === driverId);
            if (driver?.assignedBovId) {
                await updateDoc(doc(db, "bovs", driver.assignedBovId), { assignedDriverId: null });
            }
            await updateDoc(doc(db, "users", driverId), { assignedBovId: bovId });
            if (bovId) {
                const otherDriver = drivers.find(d => d.assignedBovId === bovId && d.uid !== driverId);
                if (otherDriver) {
                    await updateDoc(doc(db, "users", otherDriver.uid), { assignedBovId: null });
                }
                await updateDoc(doc(db, "bovs", bovId), { assignedDriverId: driverId });
            }
            setStatus("Driver assignment updated.");
        }
        catch (e) {
            setStatus("Error: " + e);
        }
    }
    async function deleteDriver(uid) {
        if (!db)
            return;
        if (!window.confirm("Are you sure you want to delete this driver?"))
            return;
        try {
            const driver = drivers.find(d => d.uid === uid);
            if (driver?.assignedBovId) {
                await updateDoc(doc(db, "bovs", driver.assignedBovId), { assignedDriverId: null });
            }
            await deleteDoc(doc(db, "users", uid));
            setStatus(`Driver ${uid} deleted.`);
        }
        catch (e) {
            setStatus("Error: " + e);
        }
    }
    async function addTrain() {
        if (!newTrain.trainNumber.trim())
            return;
        if (!db)
            return;
        try {
            await setDoc(doc(db, "trains", newTrain.trainNumber), { ...newTrain });
            setNewTrain({ trainNumber: "", trainName: "", platformNumber: "", type: "arriving", isActive: true });
            setStatus("Train added.");
        }
        catch (e) {
            setStatus("Error: " + e);
        }
    }
    async function addPeakHour() {
        if (!newPeak.label.trim())
            return;
        if (!db)
            return;
        try {
            await setDoc(doc(collection(db, "peakHours")), { ...newPeak });
            setNewPeak({ label: "", startTime: "", endTime: "", multiplier: 1.5 });
            setStatus("Peak hour added.");
        }
        catch (e) {
            setStatus("Error: " + e);
        }
    }
    async function addPlatform() {
        if (!newPlatform.platformId.trim())
            return;
        if (!db)
            return;
        try {
            await setDoc(doc(db, "platforms", newPlatform.platformId), { ...newPlatform });
            setNewPlatform({ platformId: "", platformName: "", platformNumber: "" });
            setStatus("Platform added.");
        }
        catch (e) {
            setStatus("Error: " + e);
        }
    }
    async function deletePeakHour(id) {
        if (!db)
            return;
        try {
            await deleteDoc(doc(db, "peakHours", id));
            setStatus("Peak hour deleted.");
        }
        catch (e) {
            setStatus("Error: " + e);
        }
    }
    async function deletePlatform(id) {
        if (!db)
            return;
        try {
            await deleteDoc(doc(db, "platforms", id));
            setStatus("Platform deleted.");
        }
        catch (e) {
            setStatus("Error: " + e);
        }
    }
    if (!authResolved || loading)
        return _jsx("div", { className: "page", children: "Loading Admin Dashboard..." });
    if (!user) {
        return (_jsx("div", { className: "page page-auth", children: _jsx("section", { className: "auth-shell", style: { gridTemplateColumns: '1fr', maxWidth: '460px', margin: '0 auto' }, children: _jsxs("form", { className: "auth-card", onSubmit: handleLogin, children: [_jsx("h2", { children: "Admin Login" }), _jsx("p", { children: "Access the central railway mobility dashboard." }), _jsxs("label", { children: ["Email", _jsx("input", { type: "email", value: authEmail, onChange: e => setAuthEmail(e.target.value), required: true })] }), _jsxs("label", { children: ["Password", _jsx("input", { type: "password", value: authPassword, onChange: e => setAuthPassword(e.target.value), required: true })] }), _jsx("button", { className: "cta auth-submit", type: "submit", disabled: authBusy, children: authBusy ? "Verifying..." : "Login to Admin" }), status && _jsx("p", { className: "status", children: status })] }) }) }));
    }
    const bovStatusClass = (status) => {
        if (status === "active")
            return "badge success";
        if (status === "maintenance")
            return "badge warn";
        return "badge muted";
    };
    const rideStatusClass = (status) => {
        if (status === "completed")
            return "badge success";
        if (status === "cancelled")
            return "badge danger";
        if (status === "in-progress")
            return "badge info";
        return "badge confirm";
    };
    return (_jsxs("div", { className: "page", children: [_jsxs("header", { className: "hero", children: [_jsx("p", { className: "eyebrow", children: "Hubli Railway Station" }), _jsx("h1", { children: "Admin Mobility Dashboard" }), _jsxs("div", { className: "hero-stats", children: [_jsxs("article", { children: [_jsx("strong", { children: bovs.length }), _jsx("span", { children: "Total BOVs" })] }), _jsxs("article", { children: [_jsx("strong", { children: drivers.length }), _jsx("span", { children: "Active Drivers" })] }), _jsxs("article", { children: [_jsx("strong", { children: bookings.length }), _jsx("span", { children: "Total Bookings" })] })] }), _jsx("div", { style: { marginTop: '1rem' }, children: _jsx("button", { className: "secondary", onClick: handleLogout, children: "Sign Out" }) })] }), _jsx("nav", { className: "tabs", children: [
                    ["bookings", "Live Bookings"],
                    ["bovs", "BOV Management"],
                    ["drivers", "Drivers"],
                    ["trains", "Trains"],
                    ["peakHours", "Peak Pricing"],
                    ["platforms", "Platform Config"],
                    ["analytics", "Analytics"],
                ].map(([key, label]) => (_jsx("button", { type: "button", className: activeTab === key ? "tab active" : "tab", onClick: () => setActiveTab(key), children: label }, key))) }), activeTab === "bovs" && (_jsxs("section", { className: "card", children: [_jsx("h2", { children: "BOV Management" }), _jsxs("div", { className: "grid", children: [_jsxs("label", { children: ["Vehicle Number", _jsx("input", { value: newBov.vehicleNumber, onChange: e => setNewBov(prev => ({ ...prev, vehicleNumber: e.target.value })) })] }), _jsxs("label", { children: ["Seats", _jsx("input", { type: "number", value: newBov.totalSeats, onChange: e => setNewBov(prev => ({ ...prev, totalSeats: Number(e.target.value) })) })] }), _jsxs("label", { children: ["Platform", _jsx("input", { value: newBov.currentPlatform, onChange: e => setNewBov(prev => ({ ...prev, currentPlatform: e.target.value })) })] })] }), _jsx("button", { className: "cta", onClick: addBov, children: "Add BOV" }), _jsxs("table", { children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { children: "ID" }), _jsx("th", { children: "Vehicle" }), _jsx("th", { children: "Seats" }), _jsx("th", { children: "Status" }), _jsx("th", { children: "Assignment" })] }) }), _jsx("tbody", { children: bovs.map(b => (_jsxs("tr", { children: [_jsx("td", { children: b.bovId }), _jsx("td", { children: b.vehicleNumber }), _jsx("td", { children: b.totalSeats }), _jsx("td", { children: _jsx("span", { className: bovStatusClass(b.status), children: b.status }) }), _jsx("td", { children: _jsxs("select", { value: b.assignedDriverId ?? "", onChange: e => updateBovAssignment(b.bovId, e.target.value || null), children: [_jsx("option", { value: "", children: "Unassigned" }), drivers.map(d => _jsx("option", { value: d.uid, children: d.name }, d.uid))] }) })] }, b.bovId))) })] })] })), activeTab === "drivers" && (_jsxs("section", { className: "card", children: [_jsx("h2", { children: "Driver Management" }), _jsx("p", { className: "hint", children: "Drivers sign up through Staff Portal." }), _jsxs("table", { children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { children: "UID" }), _jsx("th", { children: "Name" }), _jsx("th", { children: "Email" }), _jsx("th", { children: "Assigned BOV" }), _jsx("th", { children: "Status" }), _jsx("th", { children: "Actions" })] }) }), _jsx("tbody", { children: drivers.map(d => (_jsxs("tr", { children: [_jsx("td", { children: d.uid }), _jsx("td", { children: d.name }), _jsx("td", { children: d.email }), _jsx("td", { children: _jsxs("select", { value: d.assignedBovId ?? "", onChange: e => updateDriverAssignment(d.uid, e.target.value || null), children: [_jsx("option", { value: "", children: "None" }), bovs.map(b => _jsx("option", { value: b.bovId, children: b.bovId }, b.bovId))] }) }), _jsx("td", { children: _jsx("span", { className: d.active ? "badge success" : "badge muted", children: d.active ? "active" : "inactive" }) }), _jsx("td", { children: _jsx("button", { onClick: () => deleteDriver(d.uid), children: "Delete" }) })] }, d.uid))) })] })] })), activeTab === "trains" && (_jsxs("section", { className: "card", children: [_jsx("h2", { children: "Train Schedules" }), _jsxs("div", { className: "grid", children: [_jsxs("label", { children: ["Train No.", _jsx("input", { value: newTrain.trainNumber, onChange: e => setNewTrain(prev => ({ ...prev, trainNumber: e.target.value })) })] }), _jsxs("label", { children: ["Name", _jsx("input", { value: newTrain.trainName, onChange: e => setNewTrain(prev => ({ ...prev, trainName: e.target.value })) })] }), _jsxs("label", { children: ["Platform", _jsx("input", { value: newTrain.platformNumber, onChange: e => setNewTrain(prev => ({ ...prev, platformNumber: e.target.value })) })] })] }), _jsx("button", { className: "cta", onClick: addTrain, children: "Add Train" }), _jsxs("table", { children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { children: "Number" }), _jsx("th", { children: "Name" }), _jsx("th", { children: "Platform" }), _jsx("th", { children: "Type" }), _jsx("th", { children: "Active" })] }) }), _jsx("tbody", { children: trains.map(t => (_jsxs("tr", { children: [_jsx("td", { children: t.trainNumber }), _jsx("td", { children: t.trainName }), _jsx("td", { children: t.platformNumber }), _jsx("td", { children: t.type }), _jsx("td", { children: t.isActive ? "Yes" : "No" })] }, t.trainNumber))) })] })] })), activeTab === "bookings" && (_jsxs("section", { className: "card", children: [_jsx("h2", { children: "All Ride Bookings" }), _jsxs("table", { children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { children: "ID" }), _jsx("th", { children: "Train" }), _jsx("th", { children: "From" }), _jsx("th", { children: "To" }), _jsx("th", { children: "BOV" }), _jsx("th", { children: "Fare" }), _jsx("th", { children: "Status" }), _jsx("th", { children: "Created" })] }) }), _jsx("tbody", { children: bookings.map(b => (_jsxs("tr", { children: [_jsx("td", { children: b.bookingId }), _jsx("td", { children: b.trainNumber }), _jsx("td", { children: b.fromPlatform }), _jsx("td", { children: b.toPlatform }), _jsx("td", { children: b.bovId }), _jsxs("td", { children: ["Rs ", b.fare] }), _jsx("td", { children: _jsx("span", { className: rideStatusClass(b.rideStatus), children: b.rideStatus }) }), _jsx("td", { children: new Date(b.createdAt).toLocaleString() })] }, b.bookingId))) })] })] })), activeTab === "peakHours" && (_jsxs("section", { className: "card", children: [_jsx("h2", { children: "Peak Hour Pricing" }), _jsxs("div", { className: "grid", children: [_jsxs("label", { children: ["Label", _jsx("input", { value: newPeak.label, onChange: e => setNewPeak(prev => ({ ...prev, label: e.target.value })) })] }), _jsxs("label", { children: ["Start", _jsx("input", { type: "time", value: newPeak.startTime, onChange: e => setNewPeak(prev => ({ ...prev, startTime: e.target.value })) })] }), _jsxs("label", { children: ["End", _jsx("input", { type: "time", value: newPeak.endTime, onChange: e => setNewPeak(prev => ({ ...prev, endTime: e.target.value })) })] }), _jsxs("label", { children: ["Multiplier", _jsx("input", { type: "number", step: "0.1", value: newPeak.multiplier, onChange: e => setNewPeak(prev => ({ ...prev, multiplier: Number(e.target.value) })) })] })] }), _jsx("button", { className: "cta", onClick: addPeakHour, children: "Add Rule" }), _jsxs("table", { children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { children: "Label" }), _jsx("th", { children: "Time Range" }), _jsx("th", { children: "Multiplier" }), _jsx("th", { children: "Actions" })] }) }), _jsx("tbody", { children: peakHours.map(p => (_jsxs("tr", { children: [_jsx("td", { children: p.label }), _jsxs("td", { children: [p.startTime, " - ", p.endTime] }), _jsxs("td", { children: [p.multiplier, "x"] }), _jsx("td", { children: _jsx("button", { onClick: () => deletePeakHour(p.id || ""), children: "Delete" }) })] }, p.id || p.label))) })] })] })), activeTab === "platforms" && (_jsxs("section", { className: "card", children: [_jsx("h2", { children: "Platform Configuration" }), _jsxs("div", { className: "grid", children: [_jsxs("label", { children: ["ID", _jsx("input", { value: newPlatform.platformId, onChange: e => setNewPlatform(prev => ({ ...prev, platformId: e.target.value })) })] }), _jsxs("label", { children: ["Name", _jsx("input", { value: newPlatform.platformName, onChange: e => setNewPlatform(prev => ({ ...prev, platformName: e.target.value })) })] }), _jsxs("label", { children: ["Number", _jsx("input", { value: newPlatform.platformNumber, onChange: e => setNewPlatform(prev => ({ ...prev, platformNumber: e.target.value })) })] })] }), _jsx("button", { className: "cta", onClick: addPlatform, children: "Add Platform" }), _jsxs("table", { children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { children: "ID" }), _jsx("th", { children: "Name" }), _jsx("th", { children: "Number" }), _jsx("th", { children: "Actions" })] }) }), _jsx("tbody", { children: platforms.map(p => (_jsxs("tr", { children: [_jsx("td", { children: p.platformId }), _jsx("td", { children: p.platformName }), _jsx("td", { children: p.platformNumber }), _jsx("td", { children: _jsx("button", { onClick: () => deletePlatform(p.platformId), children: "Delete" }) })] }, p.platformId))) })] })] })), activeTab === "analytics" && (_jsxs("section", { className: "card", children: [_jsx("h2", { children: "Station Mobility Analytics" }), _jsxs("div", { className: "stats", children: [_jsxs("article", { children: [_jsx("strong", { children: bookings.filter(b => b.rideStatus === "completed").length }), _jsx("span", { children: "Completed Rides" })] }), _jsxs("article", { children: [_jsxs("strong", { children: ["Rs ", bookings.filter(b => b.rideStatus === "completed").reduce((sum, b) => sum + b.fare, 0)] }), _jsx("span", { children: "Total Revenue" })] }), _jsxs("article", { children: [_jsx("strong", { children: bookings.filter(b => b.rideStatus === "cancelled").length }), _jsx("span", { children: "Cancellations" })] })] })] })), status && _jsx("p", { className: "status", children: status })] }));
}
