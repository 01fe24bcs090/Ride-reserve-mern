import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState, useEffect } from "react";
import { doc, updateDoc, getDoc, runTransaction, setDoc } from "firebase/firestore";
import { signInWithEmailAndPassword, onAuthStateChanged, signOut, createUserWithEmailAndPassword } from "firebase/auth";
import { db, auth } from "./lib/firebase";
import { useDriverRides } from "./hooks/useDriverRides";
export default function App() {
    const [user, setUser] = useState(null);
    const [authResolved, setAuthResolved] = useState(false);
    const [authEmail, setAuthEmail] = useState("");
    const [authPassword, setAuthPassword] = useState("");
    const [authName, setAuthName] = useState("");
    const [authBusy, setAuthBusy] = useState(false);
    const [isSignup, setIsSignup] = useState(false);
    const [status, setStatus] = useState("");
    const { rides, loading: ridesLoading, error: ridesError } = useDriverRides(user?.uid);
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
        const unsub = onAuthStateChanged(auth, async (u) => {
            if (u && db) {
                try {
                    const userDoc = await getDoc(doc(db, "users", u.uid));
                    const userData = userDoc.data();
                    if (userData?.role === "driver") {
                        setUser(u);
                    }
                    else {
                        await signOut(auth);
                        setStatus("Access denied. Drivers only.");
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
        return unsub;
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
    async function handleSignup(e) {
        e.preventDefault();
        if (!auth || !db)
            return;
        setAuthBusy(true);
        setStatus("Creating account...");
        try {
            const cred = await createUserWithEmailAndPassword(auth, authEmail, authPassword);
            await setDoc(doc(db, "users", cred.user.uid), {
                uid: cred.user.uid,
                name: authName,
                email: authEmail,
                role: "driver",
                active: true,
                assignedBovId: null,
                createdAt: new Date().toISOString()
            });
            setStatus("Signup successful.");
        }
        catch (e) {
            setStatus("Signup failed: " + (e instanceof Error ? e.message : String(e)));
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
    async function acceptRide(docId) {
        if (!db || !user)
            return;
        setStatus(`Accepting ride...`);
        try {
            await runTransaction(db, async (transaction) => {
                const rideRef = doc(db, "bookings", docId);
                const rideSnap = await transaction.get(rideRef);
                if (!rideSnap.exists())
                    throw new Error("Ride not found.");
                const data = rideSnap.data();
                if (data.rideStatus !== "pending")
                    throw new Error("Ride already taken.");
                const driverDoc = await transaction.get(doc(db, "users", user.uid));
                const bovId = driverDoc.data()?.assignedBovId;
                if (!bovId)
                    throw new Error("You must be assigned to a BOV to accept rides.");
                const bovDoc = await transaction.get(doc(db, "bovs", bovId));
                const bovData = bovDoc.data();
                transaction.update(rideRef, {
                    rideStatus: "confirmed",
                    acceptedBy: user.uid,
                    bovId: bovId,
                    bovVehicleNumber: bovData?.vehicleNumber || "Unknown",
                });
            });
            setStatus("Ride accepted!");
        }
        catch (e) {
            setStatus("Error: " + (e instanceof Error ? e.message : e));
        }
    }
    async function updateStatus(docId, newStatus) {
        if (!db)
            return;
        try {
            await updateDoc(doc(db, "bookings", docId), { rideStatus: newStatus });
            setStatus(`Status updated to ${newStatus}.`);
        }
        catch (e) {
            setStatus("Error: " + e);
        }
    }
    if (!authResolved)
        return _jsx("div", { className: "page", children: "Initializing Driver Portal..." });
    if (!user) {
        return (_jsx("div", { className: "page page-auth", children: _jsx("section", { className: "auth-shell", style: { gridTemplateColumns: '1fr', maxWidth: '460px', margin: '0 auto' }, children: _jsxs("form", { className: "auth-card", onSubmit: isSignup ? handleSignup : handleLogin, children: [_jsx("h2", { children: isSignup ? "Driver Signup" : "Driver Login" }), _jsx("p", { children: isSignup ? "Create your driver account." : "Access your assigned rides." }), isSignup && (_jsxs("label", { children: ["Name", _jsx("input", { type: "text", value: authName, onChange: e => setAuthName(e.target.value), required: true })] })), _jsxs("label", { children: ["Email", _jsx("input", { type: "email", value: authEmail, onChange: e => setAuthEmail(e.target.value), required: true })] }), _jsxs("label", { children: ["Password", _jsx("input", { type: "password", value: authPassword, onChange: e => setAuthPassword(e.target.value), required: true })] }), _jsx("button", { className: "cta auth-submit", type: "submit", disabled: authBusy, children: authBusy ? "Processing..." : (isSignup ? "Sign Up" : "Login") }), _jsx("p", { className: "auth-footer-note", children: _jsx("button", { type: "button", className: "link-btn", onClick: () => setIsSignup(!isSignup), children: isSignup ? "Already have an account? Login" : "Need an account? Sign up" }) }), status && _jsx("p", { className: "status", children: status })] }) }) }));
    }
    const statusClass = (s) => {
        if (s === "confirmed")
            return "status-chip confirmed";
        if (s === "in-progress")
            return "status-chip progress";
        if (s === "completed")
            return "status-chip complete";
        return "status-chip";
    };
    return (_jsxs("div", { className: "page", children: [_jsxs("header", { className: "hero", children: [_jsx("p", { className: "eyebrow", children: "SmartBOV" }), _jsx("h1", { children: "Driver Dashboard" }), _jsxs("div", { className: "hero-inline", children: [_jsx("span", { className: "hero-tag", children: user.email }), _jsx("span", { className: "hero-tag", children: "Marketplace Active" })] }), _jsx("div", { style: { marginTop: '1rem' }, children: _jsx("button", { className: "secondary", onClick: handleLogout, children: "Sign Out" }) })] }), _jsxs("div", { className: "cards", children: [_jsxs("article", { className: "metric", children: [_jsx("h2", { children: rides.filter(r => r.acceptedBy === user.uid).length }), _jsx("p", { children: "My Active Rides" })] }), _jsxs("article", { className: "metric", children: [_jsx("h2", { children: rides.filter(r => r.rideStatus === "pending").length }), _jsx("p", { children: "Available in Market" })] })] }), _jsxs("section", { className: "table-card", children: [_jsx("h2", { children: "Ride Queue" }), ridesError && _jsxs("p", { className: "status error", style: { color: '#ff4d4f' }, children: ["Error loading rides: ", ridesError] }), ridesLoading ? _jsx("p", { children: "Loading rides..." }) : (_jsxs("table", { children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { children: "ID" }), _jsx("th", { children: "Passenger" }), _jsx("th", { children: "Route" }), _jsx("th", { children: "Seats" }), _jsx("th", { children: "Status" }), _jsx("th", { children: "Actions" })] }) }), _jsx("tbody", { children: rides.map(r => (_jsxs("tr", { children: [_jsx("td", { children: r.bookingId }), _jsx("td", { children: r.passengerName }), _jsxs("td", { children: [r.fromPlatform, " \u2192 ", r.toPlatform] }), _jsx("td", { children: r.seats }), _jsx("td", { children: _jsx("span", { className: statusClass(r.rideStatus), children: r.rideStatus }) }), _jsx("td", { className: "actions", children: r.rideStatus === "pending" ? (_jsx("button", { className: "action-start", onClick: () => acceptRide(r.docId), children: "Accept" })) : r.rideStatus === "confirmed" ? (_jsx("button", { className: "action-start", onClick: () => updateStatus(r.docId, "in-progress"), children: "Start" })) : r.rideStatus === "in-progress" ? (_jsx("button", { className: "action-complete", onClick: () => updateStatus(r.docId, "completed"), children: "Complete" })) : null })] }, r.docId))) })] }))] }), status && _jsx("p", { className: "status", children: status })] }));
}
