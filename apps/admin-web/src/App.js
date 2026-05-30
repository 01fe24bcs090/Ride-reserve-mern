import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useState, useEffect } from "react";
import api from "./api/client";
import { useAdminData } from "./hooks/useAdminData";
import { io } from "socket.io-client";
const socketUrl = import.meta.env.VITE_API_URL ? import.meta.env.VITE_API_URL.replace("/api", "") : "http://localhost:5000";
export default function App() {
    const [showProfileMenu, setShowProfileMenu] = useState(false);
    const getAdminInitials = (name) => {
        if (!name)
            return "A";
        const parts = name.trim().split(/\s+/);
        const first = parts[0];
        const last = parts[parts.length - 1];
        if (first && last && parts.length >= 2) {
            return (first.charAt(0) + last.charAt(0)).toUpperCase();
        }
        return first ? first.slice(0, 2).toUpperCase() : "A";
    };
    const [triggerRefetch, setTriggerRefetch] = useState(0);
    const { bovs, drivers, trains, bookings, peakHours, loading } = useAdminData(triggerRefetch);
    const [activeTab, setActiveTab] = useState("bookings");
    const [user, setUser] = useState(null);
    const [authResolved, setAuthResolved] = useState(false);
    const [authEmail, setAuthEmail] = useState("");
    const [authPassword, setAuthPassword] = useState("");
    const [authName, setAuthName] = useState("");
    const [authBusy, setAuthBusy] = useState(false);
    const [activeSos, setActiveSos] = useState(null);
    const [status, setStatus] = useState("");
    const [isSignup, setIsSignup] = useState(false);
    // OTP States
    const [showOtpScreen, setShowOtpScreen] = useState(false);
    const [verifyingEmail, setVerifyingEmail] = useState("");
    const [otpValue, setOtpValue] = useState("");
    const [otpStatus, setOtpStatus] = useState("");
    const [countdown, setCountdown] = useState(0);
    const [newBov, setNewBov] = useState({ vehicleNumber: "", totalSeats: 4, currentPlatform: "" });
    const [newTrain, setNewTrain] = useState({ trainNumber: "", trainName: "", platformNumber: "", type: "arriving", isActive: true });
    const [newPeak, setNewPeak] = useState({ label: "", startTime: "", endTime: "", multiplier: 1.5 });
    const forceRefetch = () => setTriggerRefetch(Date.now());
    // Close profile menu when clicking outside
    useEffect(() => {
        if (!showProfileMenu)
            return;
        const handler = (e) => {
            const target = e.target;
            if (!target.closest('#admin-profile-menu-container')) {
                setShowProfileMenu(false);
            }
        };
        document.addEventListener('click', handler);
        return () => document.removeEventListener('click', handler);
    }, [showProfileMenu]);
    useEffect(() => {
        if (countdown <= 0)
            return;
        const timer = setTimeout(() => {
            setCountdown(prev => prev - 1);
        }, 1000);
        return () => clearTimeout(timer);
    }, [countdown]);
    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const tokenEmail = params.get("e");
        const tokenPass = params.get("p");
        const initAuth = async () => {
            if (tokenEmail && tokenPass) {
                window.history.replaceState({}, document.title, window.location.pathname);
                setAuthBusy(true);
                setStatus("Authenticating from staff portal...");
                try {
                    const { data } = await api.post('/auth/login', {
                        email: decodeURIComponent(tokenEmail),
                        password: decodeURIComponent(tokenPass)
                    });
                    localStorage.setItem('token', data.token);
                    if (data.user.role === "admin") {
                        setUser(data.user);
                    }
                    else {
                        localStorage.removeItem('token');
                        setStatus("Access denied. Admin only.");
                    }
                }
                catch (e) {
                    setStatus("Auto-login failed: " + (e.response?.data?.error || e.message));
                }
                finally {
                    setAuthBusy(false);
                    setAuthResolved(true);
                }
                return;
            }
            const token = localStorage.getItem('token');
            if (token) {
                try {
                    const { data } = await api.get('/auth/me');
                    if (data.role === "admin") {
                        setUser(data);
                    }
                    else {
                        localStorage.removeItem('token');
                        setStatus("Access denied. Admin only.");
                    }
                }
                catch (e) {
                    localStorage.removeItem('token');
                }
            }
            setAuthResolved(true);
        };
        initAuth();
    }, []);
    useEffect(() => {
        if (!user)
            return;
        const socket = io(socketUrl);
        socket.emit("join_room", "admin");
        socket.on("admin_emergency_sos", (data) => {
            console.log(" Admin received SOS:", data);
            setActiveSos(data);
            forceRefetch();
        });
        return () => {
            socket.disconnect();
        };
    }, [user]);
    useEffect(() => {
        if (!activeSos)
            return;
        let audioCtx = null;
        let osc1 = null;
        let osc2 = null;
        let gainNode = null;
        let intervalId = null;
        try {
            const AudioCtxClass = window.AudioContext || window.webkitAudioContext;
            audioCtx = new AudioCtxClass();
            gainNode = audioCtx.createGain();
            gainNode.gain.setValueAtTime(0, audioCtx.currentTime);
            gainNode.connect(audioCtx.destination);
            osc1 = audioCtx.createOscillator();
            osc1.type = "sawtooth";
            osc1.frequency.setValueAtTime(440, audioCtx.currentTime);
            osc1.connect(gainNode);
            osc2 = audioCtx.createOscillator();
            osc2.type = "sine";
            osc2.frequency.setValueAtTime(444, audioCtx.currentTime);
            osc2.connect(gainNode);
            osc1.start();
            osc2.start();
            let high = true;
            intervalId = setInterval(() => {
                if (!audioCtx || !gainNode || !osc1 || !osc2)
                    return;
                const now = audioCtx.currentTime;
                if (high) {
                    osc1.frequency.exponentialRampToValueAtTime(880, now + 0.3);
                    osc2.frequency.exponentialRampToValueAtTime(888, now + 0.3);
                    gainNode.gain.linearRampToValueAtTime(0.15, now + 0.1);
                }
                else {
                    osc1.frequency.exponentialRampToValueAtTime(440, now + 0.3);
                    osc2.frequency.exponentialRampToValueAtTime(444, now + 0.3);
                    gainNode.gain.linearRampToValueAtTime(0.02, now + 0.1);
                }
                high = !high;
            }, 400);
        }
        catch (err) {
            console.warn("Web Audio API not supported or blocked:", err);
        }
        return () => {
            if (intervalId)
                clearInterval(intervalId);
            try {
                if (osc1)
                    osc1.stop();
                if (osc2)
                    osc2.stop();
                if (audioCtx)
                    audioCtx.close();
            }
            catch (e) { }
        };
    }, [activeSos]);
    async function handleLogin(e) {
        e.preventDefault();
        setAuthBusy(true);
        setStatus("Signing in...");
        try {
            const { data } = await api.post('/auth/login', { email: authEmail, password: authPassword });
            if (data.user.role === "admin") {
                localStorage.setItem('token', data.token);
                setUser(data.user);
                setStatus("Login successful.");
            }
            else {
                setStatus("Access denied. Admin only.");
            }
        }
        catch (e) {
            const errResponse = e.response?.data;
            if (errResponse && errResponse.error === "email_not_verified") {
                setVerifyingEmail(errResponse.email || authEmail);
                setShowOtpScreen(true);
                setOtpStatus("Your email is not verified. A new 6-digit code has been sent!");
            }
            else {
                setStatus("Login failed: " + (errResponse?.error || e.message));
            }
        }
        finally {
            setAuthBusy(false);
        }
    }
    async function handleSignup(e) {
        e.preventDefault();
        setAuthBusy(true);
        setStatus("Creating account...");
        try {
            const { data } = await api.post('/auth/register', {
                name: authName,
                email: authEmail,
                password: authPassword,
                role: "admin"
            });
            if (data.message === "otp_sent") {
                setVerifyingEmail(authEmail);
                setShowOtpScreen(true);
                setOtpStatus("A 6-digit verification code has been sent to your email!");
            }
            else {
                localStorage.setItem('token', data.token);
                setUser(data.user);
                setStatus("Signup successful.");
            }
        }
        catch (e) {
            setStatus("Signup failed: " + (e.response?.data?.error || e.message));
        }
        finally {
            setAuthBusy(false);
        }
    }
    async function handleVerifyOtp(e) {
        e.preventDefault();
        if (otpValue.length !== 6) {
            setOtpStatus("Please enter a valid 6-digit code.");
            return;
        }
        setAuthBusy(true);
        setOtpStatus("");
        try {
            const { data } = await api.post("/auth/verify-otp", {
                email: verifyingEmail,
                otp: otpValue
            });
            if (data.user.role === "admin") {
                localStorage.setItem("token", data.token);
                setUser(data.user);
                setStatus("Email verified successfully.");
                setShowOtpScreen(false);
            }
            else {
                setOtpStatus("Access denied. Admin only.");
            }
        }
        catch (err) {
            const errMsg = err.response?.data?.error || err.message || "Invalid or expired code.";
            setOtpStatus(errMsg);
        }
        finally {
            setAuthBusy(false);
        }
    }
    async function handleResendOtp() {
        setOtpStatus("");
        setAuthBusy(true);
        try {
            await api.post("/auth/resend-otp", { email: verifyingEmail });
            setOtpStatus("A new 6-digit verification code has been sent!");
            setCountdown(60);
        }
        catch (err) {
            const errMsg = err.response?.data?.error || err.message || "Failed to resend code.";
            setOtpStatus(errMsg);
        }
        finally {
            setAuthBusy(false);
        }
    }
    async function handleLogout() {
        localStorage.removeItem('token');
        setUser(null);
        setStatus("Signed out.");
        setShowOtpScreen(false);
        setOtpValue("");
        setOtpStatus("");
    }
    async function addBov() {
        if (!newBov.vehicleNumber.trim() || !newBov.currentPlatform.trim())
            return;
        const bovId = `BOV-${String(bovs.length + 1).padStart(2, "0")}`;
        try {
            await api.post('/bovs', {
                ...newBov,
                bovId,
                status: "active",
                assignedDriverId: null,
            });
            setNewBov({ vehicleNumber: "", totalSeats: 4, currentPlatform: "" });
            setStatus(`BOV ${bovId} added.`);
            forceRefetch();
        }
        catch (e) {
            setStatus("Error: " + (e.response?.data?.error || e.message));
        }
    }
    async function updateBovAssignment(bovId, driverId) {
        try {
            const oldBov = bovs.find((b) => b.bovId === bovId);
            if (oldBov?.assignedDriverId) {
                await api.patch(`/users/${oldBov.assignedDriverId}`, { assignedBovId: null });
            }
            await api.patch(`/bovs/${bovId}`, { assignedDriverId: driverId });
            if (driverId) {
                const otherBov = bovs.find((b) => b.assignedDriverId === driverId && b.bovId !== bovId);
                if (otherBov) {
                    await api.patch(`/bovs/${otherBov.bovId}`, { assignedDriverId: null });
                }
                await api.patch(`/users/${driverId}`, { assignedBovId: bovId });
            }
            setStatus("BOV assignment updated.");
            forceRefetch();
        }
        catch (e) {
            setStatus("Error: " + (e.response?.data?.error || e.message));
        }
    }
    async function updateDriverAssignment(driverId, bovId) {
        try {
            const driver = drivers.find((d) => d.uid === driverId);
            if (driver?.assignedBovId) {
                await api.patch(`/bovs/${driver.assignedBovId}`, { assignedDriverId: null });
            }
            await api.patch(`/users/${driverId}`, { assignedBovId: bovId });
            if (bovId) {
                const otherDriver = drivers.find((d) => d.assignedBovId === bovId && d.uid !== driverId);
                if (otherDriver) {
                    await api.patch(`/users/${otherDriver.uid}`, { assignedBovId: null });
                }
                await api.patch(`/bovs/${bovId}`, { assignedDriverId: driverId });
            }
            setStatus("Driver assignment updated.");
            forceRefetch();
        }
        catch (e) {
            setStatus("Error: " + (e.response?.data?.error || e.message));
        }
    }
    async function deleteDriver(uid) {
        if (!window.confirm("Are you sure you want to delete this driver?"))
            return;
        try {
            await api.delete(`/users/${uid}`);
            setStatus("Driver deleted successfully.");
            forceRefetch();
        }
        catch (e) {
            setStatus("Error deleting driver: " + (e.response?.data?.error || e.message));
        }
    }
    async function addTrain() {
        if (!newTrain.trainNumber.trim())
            return;
        try {
            await api.post('/trains', { ...newTrain });
            setNewTrain({ trainNumber: "", trainName: "", platformNumber: "", type: "arriving", isActive: true });
            setStatus("Train added.");
            forceRefetch();
        }
        catch (e) {
            setStatus("Error: " + (e.response?.data?.error || e.message));
        }
    }
    async function delayTrain(trainNumber, delayMinutes) {
        if (delayMinutes <= 0)
            return;
        setStatus(`Delaying train ${trainNumber} by ${delayMinutes} mins...`);
        try {
            const { data } = await api.patch(`/trains/${trainNumber}/delay`, { delayMinutes });
            setStatus(`Train delayed successfully! Rescheduled ${data.rescheduledCount} active booking(s).`);
            forceRefetch();
        }
        catch (e) {
            setStatus("Error delaying train: " + (e.response?.data?.error || e.message));
        }
    }
    async function addPeakHour() {
        if (!newPeak.label.trim())
            return;
        try {
            await api.post('/peakhours', { ...newPeak });
            setNewPeak({ label: "", startTime: "", endTime: "", multiplier: 1.5 });
            setStatus("Peak hour added.");
            forceRefetch();
        }
        catch (e) {
            setStatus("Error: " + (e.response?.data?.error || e.message));
        }
    }
    async function deletePeakHour(id) {
        if (!window.confirm("Are you sure you want to delete this peak hour rule?"))
            return;
        try {
            await api.delete(`/peakhours/${id}`);
            setStatus("Peak hour rule deleted.");
            forceRefetch();
        }
        catch (e) {
            setStatus("Error deleting peak hour: " + (e.response?.data?.error || e.message));
        }
    }
    if (!authResolved || (user && loading))
        return _jsx("div", { className: "page", children: "Loading Admin Dashboard..." });
    if (!user) {
        return (_jsx("div", { className: "bg-background font-body-lg text-on-surface antialiased", style: {
                position: 'fixed',
                top: 0,
                left: 0,
                width: '100vw',
                height: '100vh',
                zIndex: 9999,
                overflowY: 'auto',
                background: '#0f172a',
                margin: 0,
                padding: 0
            }, children: _jsx("main", { style: { minHeight: '100%', display: 'flex', flexDirection: 'column' }, children: _jsxs("section", { style: { position: 'relative', flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px 0' }, children: [_jsx("div", { style: { position: 'absolute', inset: 0, zIndex: 0 }, children: _jsx("img", { alt: "Hubballi Junction Station", style: { width: '100%', height: '100%', objectFit: 'cover' }, src: "/bg_train_new.jpg" }) }), _jsx("div", { style: { position: 'relative', zIndex: 10, width: '90%', maxWidth: '460px', padding: '16px', display: 'flex', justifyContent: 'center', alignItems: 'center' }, children: _jsx("div", { style: {
                                    background: '#ffffff',
                                    border: '1px solid #e2e8f0',
                                    borderRadius: '24px',
                                    boxShadow: '0 20px 50px rgba(15, 23, 42, 0.15)',
                                    padding: '40px 36px',
                                    width: '100%',
                                    color: '#0f172a',
                                    fontFamily: "'Plus Jakarta Sans', sans-serif"
                                }, children: showOtpScreen ? (_jsxs(_Fragment, { children: [_jsx("span", { style: { fontSize: '0.72rem', fontWeight: 'bold', letterSpacing: '2px', textTransform: 'uppercase', color: '#1e3a8a', display: 'block', marginBottom: '6px', textAlign: 'center' }, children: "SECURITY CHECK" }), _jsx("h2", { style: { fontSize: '1.9rem', fontWeight: '800', color: '#0f172a', margin: '0 0 6px 0', letterSpacing: '-0.5px', textAlign: 'center' }, children: "Verify Email" }), _jsxs("p", { style: { fontSize: '0.85rem', color: '#475569', margin: '0 0 24px 0', lineHeight: '1.4', textAlign: 'center' }, children: ["We sent a 6-digit verification code to ", _jsx("strong", { style: { color: '#0f172a' }, children: verifyingEmail }), ". Please enter it below:"] }), _jsxs("form", { onSubmit: handleVerifyOtp, style: { display: 'flex', flexDirection: 'column', gap: '20px' }, children: [_jsxs("div", { style: { display: 'flex', flexDirection: 'column', gap: '6px' }, children: [_jsx("label", { style: { fontSize: '0.85rem', fontWeight: '600', color: '#334155', textAlign: 'center', marginBottom: '4px' }, children: "Enter 6-Digit OTP" }), _jsx("input", { type: "text", maxLength: 6, placeholder: "000000", value: otpValue, onChange: (e) => setOtpValue(e.target.value.replace(/[^0-9]/g, '')), required: true, style: {
                                                                width: '100%',
                                                                background: '#ffffff',
                                                                border: '2px solid #cbd5e1',
                                                                borderRadius: '12px',
                                                                padding: '14px 16px',
                                                                color: '#0f172a',
                                                                fontSize: '2rem',
                                                                fontWeight: 'bold',
                                                                letterSpacing: '12px',
                                                                textAlign: 'center',
                                                                outline: 'none',
                                                                transition: 'all 0.2s',
                                                                boxSizing: 'border-box'
                                                            } })] }), _jsx("button", { type: "submit", disabled: authBusy, style: {
                                                        width: '100%',
                                                        padding: '14px 0',
                                                        borderRadius: '12px',
                                                        border: 'none',
                                                        background: 'linear-gradient(135deg, #1e3a8a, #2563eb)',
                                                        color: '#ffffff',
                                                        fontWeight: 'bold',
                                                        fontSize: '1rem',
                                                        cursor: 'pointer',
                                                        boxShadow: '0 8px 24px -4px rgba(30, 58, 138, 0.4)',
                                                        transition: 'all 0.2s'
                                                    }, onMouseOver: (e) => { e.currentTarget.style.transform = 'translateY(-1px)'; }, onMouseOut: (e) => { e.currentTarget.style.transform = 'none'; }, children: authBusy ? 'Verifying Code...' : 'Verify & Continue' }), otpStatus && (_jsx("p", { style: {
                                                        textAlign: 'center',
                                                        color: otpStatus.includes('sent') ? '#16a34a' : '#dc2626',
                                                        fontWeight: 'bold',
                                                        margin: '0',
                                                        fontSize: '0.88rem',
                                                        lineHeight: '1.4'
                                                    }, children: otpStatus }))] }), _jsxs("div", { style: { textAlign: 'center', marginTop: '24px', paddingTop: '16px', borderTop: '1px solid #e2e8f0' }, children: [_jsxs("p", { style: { color: '#64748b', fontSize: '0.85rem', margin: '0 0 16px 0' }, children: ["Didn't receive a code?", ' ', countdown > 0 ? (_jsxs("span", { style: { fontWeight: 'bold', color: '#1e3a8a' }, children: ["Resend in ", countdown, "s"] })) : (_jsx("button", { type: "button", onClick: handleResendOtp, style: {
                                                                background: 'none',
                                                                border: 'none',
                                                                color: '#1e3a8a',
                                                                fontWeight: 'bold',
                                                                textDecoration: 'underline',
                                                                cursor: 'pointer',
                                                                padding: 0
                                                            }, children: "Resend Code" }))] }), _jsx("button", { type: "button", onClick: () => {
                                                        setShowOtpScreen(false);
                                                        setOtpValue("");
                                                        setOtpStatus("");
                                                    }, style: {
                                                        background: 'none',
                                                        border: 'none',
                                                        color: '#64748b',
                                                        fontSize: '0.88rem',
                                                        fontWeight: '600',
                                                        cursor: 'pointer',
                                                        textDecoration: 'underline'
                                                    }, children: "Back to Login" })] })] })) : (_jsxs(_Fragment, { children: [_jsx("div", { style: { height: '56px', margin: '0 auto 16px auto' } }), _jsx("h1", { style: { fontSize: '2.1rem', fontWeight: '800', color: '#0f172a', margin: '0 0 4px 0', letterSpacing: '-0.75px', textAlign: 'center', fontFamily: "'Plus Jakarta Sans', sans-serif" }, children: "Hubballi BOV Transit" }), _jsx("p", { style: { fontSize: '0.95rem', fontWeight: '700', color: '#ff7700', margin: '0 0 10px 0', textAlign: 'center', letterSpacing: '0.5px' }, children: "Welcome to SSS Hubballi Junction." }), _jsx("p", { style: { fontSize: '0.88rem', color: '#475569', margin: '0 0 24px 0', lineHeight: '1.5', textAlign: 'center' }, children: "Secure staff access for Administrators managing station BOV operations." }), _jsxs("div", { style: {
                                                display: 'flex',
                                                background: '#f1f5f9',
                                                border: '1px solid #cbd5e1',
                                                borderRadius: '99px',
                                                padding: '3px',
                                                marginBottom: '24px'
                                            }, children: [_jsx("button", { type: "button", onClick: () => { setIsSignup(false); setStatus(""); }, style: {
                                                        flex: 1,
                                                        padding: '10px 0',
                                                        borderRadius: '99px',
                                                        border: 'none',
                                                        background: !isSignup ? '#ffffff' : 'transparent',
                                                        color: !isSignup ? '#0f172a' : '#64748b',
                                                        fontWeight: 'bold',
                                                        fontSize: '0.88rem',
                                                        cursor: 'pointer',
                                                        boxShadow: !isSignup ? '0 2px 6px rgba(15, 23, 42, 0.08)' : 'none',
                                                        transition: 'all 0.2s'
                                                    }, children: "Login" }), _jsx("button", { type: "button", onClick: () => { setIsSignup(true); setStatus(""); }, style: {
                                                        flex: 1,
                                                        padding: '10px 0',
                                                        borderRadius: '99px',
                                                        border: 'none',
                                                        background: isSignup ? '#ffffff' : 'transparent',
                                                        color: isSignup ? '#0f172a' : '#64748b',
                                                        fontWeight: 'bold',
                                                        fontSize: '0.88rem',
                                                        cursor: 'pointer',
                                                        boxShadow: isSignup ? '0 2px 6px rgba(15, 23, 42, 0.08)' : 'none',
                                                        transition: 'all 0.2s'
                                                    }, children: "Sign up" })] }), _jsxs("form", { onSubmit: isSignup ? handleSignup : handleLogin, style: { display: 'flex', flexDirection: 'column', gap: '16px' }, children: [isSignup && (_jsxs("div", { style: { display: 'flex', flexDirection: 'column', gap: '6px' }, children: [_jsx("label", { style: { fontSize: '0.85rem', fontWeight: '600', color: '#334155' }, children: "Full Name" }), _jsx("input", { type: "text", value: authName, onChange: (e) => setAuthName(e.target.value), placeholder: "Enter your Full Name", required: true, style: {
                                                                width: '100%',
                                                                background: '#ffffff',
                                                                border: '1px solid #cbd5e1',
                                                                borderRadius: '12px',
                                                                padding: '12px 16px',
                                                                color: '#0f172a',
                                                                fontSize: '0.95rem',
                                                                outline: 'none',
                                                                transition: 'all 0.2s',
                                                                boxSizing: 'border-box'
                                                            } })] })), _jsxs("div", { style: { display: 'flex', flexDirection: 'column', gap: '6px' }, children: [_jsx("label", { style: { fontSize: '0.85rem', fontWeight: '600', color: '#334155' }, children: "Admin Email" }), _jsx("input", { type: "email", value: authEmail, onChange: (e) => setAuthEmail(e.target.value), placeholder: "admin@ridereserve.com", required: true, style: {
                                                                width: '100%',
                                                                background: '#ffffff',
                                                                border: '1px solid #cbd5e1',
                                                                borderRadius: '12px',
                                                                padding: '12px 16px',
                                                                color: '#0f172a',
                                                                fontSize: '0.95rem',
                                                                outline: 'none',
                                                                transition: 'all 0.2s',
                                                                boxSizing: 'border-box'
                                                            } })] }), _jsxs("div", { style: { display: 'flex', flexDirection: 'column', gap: '6px' }, children: [_jsx("label", { style: { fontSize: '0.85rem', fontWeight: '600', color: '#334155' }, children: "Password" }), _jsx("input", { type: "password", value: authPassword, onChange: (e) => setAuthPassword(e.target.value), placeholder: "******", required: true, style: {
                                                                width: '100%',
                                                                background: '#ffffff',
                                                                border: '1px solid #cbd5e1',
                                                                borderRadius: '12px',
                                                                padding: '12px 16px',
                                                                color: '#0f172a',
                                                                fontSize: '0.95rem',
                                                                outline: 'none',
                                                                transition: 'all 0.2s',
                                                                boxSizing: 'border-box'
                                                            } })] }), _jsx("button", { type: "submit", disabled: authBusy, style: {
                                                        width: '100%',
                                                        padding: '14px 0',
                                                        borderRadius: '12px',
                                                        border: 'none',
                                                        background: 'linear-gradient(135deg, #1e3a8a, #2563eb)',
                                                        color: '#ffffff',
                                                        fontWeight: 'bold',
                                                        fontSize: '1rem',
                                                        cursor: 'pointer',
                                                        boxShadow: '0 8px 24px -4px rgba(30, 58, 138, 0.4)',
                                                        transition: 'all 0.2s',
                                                        marginTop: '8px'
                                                    }, onMouseOver: (e) => { e.currentTarget.style.transform = 'translateY(-1px)'; }, onMouseOut: (e) => { e.currentTarget.style.transform = 'none'; }, children: authBusy
                                                        ? (isSignup ? 'Creating account...' : 'Authenticating...')
                                                        : (isSignup ? 'Create Admin Account' : 'Login to Admin Dashboard') }), status && (_jsx("p", { style: {
                                                        textAlign: 'center',
                                                        color: status.includes('successful') || status.includes('created') ? '#16a34a' : '#dc2626',
                                                        fontWeight: 'bold',
                                                        margin: '8px 0 0 0',
                                                        fontSize: '0.85rem'
                                                    }, children: status }))] }), _jsxs("div", { style: {
                                                display: 'flex',
                                                gap: '12px',
                                                background: '#f8fafc',
                                                border: '1px solid #e2e8f0',
                                                borderRadius: '12px',
                                                padding: '12px 14px',
                                                marginTop: '20px',
                                                fontSize: '0.82rem',
                                                color: '#475569',
                                                lineHeight: '1.4'
                                            }, children: [_jsxs("svg", { width: "16", height: "16", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2.5", strokeLinecap: "round", strokeLinejoin: "round", style: { flexShrink: 0, color: '#64748b', marginTop: '2px' }, children: [_jsx("circle", { cx: "12", cy: "12", r: "10" }), _jsx("line", { x1: "12", y1: "16", x2: "12", y2: "12" }), _jsx("line", { x1: "12", y1: "8", x2: "12.01", y2: "8" })] }), _jsx("span", { children: "Admin accounts manage BOVs, trains, bookings, peak hours, and analytics." })] }), _jsx("div", { style: { textAlign: 'center', marginTop: '24px', paddingTop: '16px', borderTop: '1px solid #e2e8f0' }, children: _jsx("a", { href: "https://ride-reserve-mern-passenger-web.vercel.app/", style: {
                                                    color: '#64748b',
                                                    fontSize: '0.88rem',
                                                    fontWeight: '600',
                                                    textDecoration: 'underline',
                                                    padding: 0
                                                }, children: "Back to Passenger Booking" }) })] })) }) })] }) }) }));
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
    const adminInitials = getAdminInitials(user?.name);
    return (_jsxs("div", { className: "page", style: { maxWidth: '1220px', margin: '0 auto', padding: '24px 18px 60px', fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" }, children: [_jsxs("header", { style: {
                    position: 'relative',
                    backgroundImage: 'linear-gradient(rgba(10, 18, 36, 0.78), rgba(10, 18, 36, 0.78)), url(/bg_train_new.jpg)',
                    backgroundSize: 'cover',
                    backgroundPosition: 'center',
                    borderRadius: '16px',
                    padding: '32px 28px',
                    color: '#ffffff',
                    boxShadow: '0 12px 32px rgba(10, 18, 36, 0.2)',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    gap: '20px'
                }, children: [_jsx("div", { style: { position: 'absolute', width: '280px', height: '280px', right: '-80px', top: '-120px', borderRadius: '50%', background: 'radial-gradient(circle, rgba(255,255,255,0.12), rgba(255,255,255,0))', pointerEvents: 'none' } }), _jsxs("div", { style: { zIndex: 10 }, children: [_jsx("p", { style: { margin: 0, textTransform: 'uppercase', letterSpacing: '2px', fontSize: '0.72rem', fontWeight: '800', color: '#60a5fa' }, children: "Hubballi BOV Transit" }), _jsx("h1", { style: { margin: '4px 0 2px 0', fontSize: '1.85rem', fontWeight: '800', letterSpacing: '-0.5px' }, children: "Admin Control Center" }), _jsx("p", { style: { margin: 0, fontSize: '0.85rem', color: '#94a3b8', fontWeight: '500' }, children: "SSS Hubballi Junction \u2022 Station Operations" }), _jsx("div", { style: { display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '18px' }, children: [
                                    { label: 'BOVs', value: bovs.length },
                                    { label: 'Drivers', value: drivers.length },
                                    { label: 'Bookings', value: bookings.length },
                                    { label: 'Completed', value: bookings.filter((b) => b.rideStatus === 'completed').length }
                                ].map(stat => (_jsxs("div", { style: {
                                        background: 'rgba(255,255,255,0.12)',
                                        border: '1px solid rgba(255,255,255,0.2)',
                                        borderRadius: '10px',
                                        padding: '8px 14px',
                                        backdropFilter: 'blur(8px)',
                                        display: 'flex',
                                        flexDirection: 'column'
                                    }, children: [_jsx("span", { style: { fontSize: '1.1rem', fontWeight: '800', lineHeight: 1 }, children: stat.value }), _jsx("span", { style: { fontSize: '0.72rem', color: 'rgba(255,255,255,0.7)', marginTop: '2px' }, children: stat.label })] }, stat.label))) })] }), _jsxs("div", { id: "admin-profile-menu-container", style: { position: 'relative', display: 'flex', alignItems: 'center', zIndex: 100 }, children: [_jsx("button", { onClick: (e) => { e.stopPropagation(); setShowProfileMenu(prev => !prev); }, style: {
                                    width: '46px',
                                    height: '46px',
                                    borderRadius: '50%',
                                    background: 'linear-gradient(135deg, rgba(255,255,255,0.15), rgba(255,255,255,0.08))',
                                    color: '#ffffff',
                                    border: '1.5px solid rgba(255,255,255,0.3)',
                                    fontSize: '0.95rem',
                                    fontWeight: '800',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    backdropFilter: 'blur(8px)',
                                    transition: 'all 0.2s cubic-bezier(0.4,0,0.2,1)',
                                    outline: 'none',
                                    userSelect: 'none'
                                }, onMouseOver: (e) => { e.currentTarget.style.transform = 'scale(1.06)'; e.currentTarget.style.background = 'rgba(255,255,255,0.25)'; }, onMouseOut: (e) => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.background = 'rgba(255,255,255,0.15)'; }, children: adminInitials }), showProfileMenu && (_jsxs("div", { style: {
                                    position: 'absolute',
                                    top: '100%',
                                    right: 0,
                                    marginTop: '12px',
                                    width: '270px',
                                    background: '#ffffff',
                                    borderRadius: '16px',
                                    border: '1px solid rgba(0,0,0,0.08)',
                                    boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1), 0 10px 10px -5px rgba(0,0,0,0.04)',
                                    padding: '20px',
                                    zIndex: 1000,
                                    display: 'flex',
                                    flexDirection: 'column',
                                    gap: '14px',
                                    color: '#0f172a',
                                    fontFamily: "'Inter', sans-serif"
                                }, children: [_jsxs("div", { style: { display: 'flex', alignItems: 'center', gap: '12px' }, children: [_jsx("div", { style: {
                                                    width: '46px', height: '46px', borderRadius: '50%',
                                                    background: 'linear-gradient(135deg, rgba(30,58,138,0.1), rgba(37,99,235,0.15))',
                                                    color: '#1e3a8a', display: 'flex', alignItems: 'center',
                                                    justifyContent: 'center', fontSize: '1rem', fontWeight: '800',
                                                    border: '1px solid rgba(30,58,138,0.12)'
                                                }, children: adminInitials }), _jsxs("div", { style: { display: 'flex', flexDirection: 'column', minWidth: 0 }, children: [_jsx("span", { style: { fontSize: '0.95rem', fontWeight: '700', color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }, children: user?.name || 'Admin' }), _jsx("span", { style: { fontSize: '0.75rem', color: '#64748b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }, children: user?.email || '' })] })] }), _jsxs("div", { style: { display: 'flex', alignItems: 'center', gap: '6px', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '8px', padding: '6px 10px', color: '#1d4ed8', fontSize: '0.78rem', fontWeight: '600' }, children: [_jsx("svg", { width: "14", height: "14", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "3", strokeLinecap: "round", strokeLinejoin: "round", children: _jsx("polyline", { points: "20 6 9 17 4 12" }) }), "Station Administrator"] }), _jsx("div", { style: { height: '1px', background: '#e2e8f0' } }), _jsx("div", { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }, children: [
                                            { label: 'Total BOVs', value: bovs.length, color: '#1d4ed8', bg: '#eff6ff' },
                                            { label: 'Active Rides', value: bookings.filter((b) => b.rideStatus === 'in-progress').length, color: '#16a34a', bg: '#f0fdf4' }
                                        ].map(s => (_jsxs("div", { style: { background: s.bg, borderRadius: '8px', padding: '10px', textAlign: 'center' }, children: [_jsx("div", { style: { fontSize: '1.2rem', fontWeight: '800', color: s.color }, children: s.value }), _jsx("div", { style: { fontSize: '0.7rem', color: '#64748b', marginTop: '2px' }, children: s.label })] }, s.label))) }), _jsx("div", { style: { height: '1px', background: '#e2e8f0' } }), _jsx("button", { onClick: () => { setShowProfileMenu(false); handleLogout(); }, style: {
                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            width: '100%', padding: '11px', borderRadius: '10px',
                                            border: '1px solid rgba(239,68,68,0.2)',
                                            background: 'rgba(239,68,68,0.06)', color: '#dc2626',
                                            fontSize: '0.88rem', fontWeight: '700', cursor: 'pointer',
                                            transition: 'all 0.2s ease', fontFamily: "'Inter', sans-serif"
                                        }, onMouseOver: (e) => { e.currentTarget.style.background = 'rgba(239,68,68,0.12)'; }, onMouseOut: (e) => { e.currentTarget.style.background = 'rgba(239,68,68,0.06)'; }, children: "Sign Out" })] }))] })] }), _jsx("div", { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px', marginTop: '20px' }, children: [
                    { label: 'Total BOVs', value: bovs.length, sub: `${bovs.filter((b) => b.status === 'active').length} active`, accent: '#2563eb', showRupee: false },
                    { label: 'Active Drivers', value: drivers.length, sub: 'registered staff', accent: '#16a34a', showRupee: false },
                    { label: 'Total Bookings', value: bookings.length, sub: `${bookings.filter((b) => b.rideStatus === 'pending').length} pending`, accent: '#d97706', showRupee: false },
                    { label: 'Revenue Today', value: `Rs ${bookings.filter((b) => b.rideStatus === 'completed').reduce((s, b) => s + b.fare, 0)}`, sub: 'completed rides', accent: '#7c3aed', showRupee: true }
                ].map(card => (_jsxs("article", { style: {
                        background: '#ffffff',
                        borderRadius: '14px',
                        padding: '20px 22px',
                        border: '1px solid #e2e8f0',
                        borderLeft: `4px solid ${card.accent}`,
                        boxShadow: '0 4px 14px rgba(15,23,42,0.04)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        transition: 'transform 0.2s ease, box-shadow 0.2s ease',
                        cursor: 'default'
                    }, onMouseOver: (e) => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 8px 24px rgba(15,23,42,0.08)'; }, onMouseOut: (e) => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = '0 4px 14px rgba(15,23,42,0.04)'; }, children: [_jsxs("div", { children: [_jsx("p", { style: { margin: 0, fontSize: '0.75rem', color: '#64748b', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.5px' }, children: card.label }), _jsx("h2", { style: { margin: '4px 0 2px', fontSize: '1.8rem', color: '#0f172a', fontWeight: '800' }, children: card.value }), _jsx("p", { style: { margin: 0, fontSize: '0.75rem', color: '#94a3b8' }, children: card.sub })] }), card.showRupee && (_jsx("div", { style: { background: '#f5f3ff', borderRadius: '10px', width: '42px', height: '42px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: '1.3rem', fontWeight: '800', color: '#7c3aed' }, children: "\u20B9" }))] }, card.label))) }), _jsx("nav", { style: { marginTop: '24px', display: 'flex', flexWrap: 'wrap', gap: '8px' }, children: [
                    ["bookings", "Live Bookings"],
                    ["bovs", "BOV Management"],
                    ["drivers", "Drivers"],
                    ["trains", "Trains"],
                    ["peakHours", "Peak Pricing"],
                    ["analytics", "Analytics"],
                ].map(([key, label]) => (_jsx("button", { type: "button", onClick: () => setActiveTab(key), style: {
                        border: activeTab === key ? 'none' : '1px solid #d1dce9',
                        background: activeTab === key
                            ? 'linear-gradient(135deg, #1e3a8a, #2563eb)'
                            : '#f0f5fc',
                        color: activeTab === key ? '#ffffff' : '#2d4f7d',
                        borderRadius: '999px',
                        padding: '9px 18px',
                        cursor: 'pointer',
                        fontWeight: '700',
                        fontSize: '0.85rem',
                        transition: 'all 0.18s ease',
                        boxShadow: activeTab === key ? '0 4px 12px rgba(30,58,138,0.25)' : 'none'
                    }, onMouseOver: (e) => { if (activeTab !== key)
                        e.currentTarget.style.transform = 'translateY(-1px)'; }, onMouseOut: (e) => { e.currentTarget.style.transform = 'none'; }, children: label }, key))) }), activeTab === "bovs" && (_jsxs("section", { style: { marginTop: '16px', background: 'linear-gradient(180deg, #fff, #fbfdff)', borderRadius: '14px', border: '1px solid #d6e0ec', boxShadow: '0 10px 24px rgba(30,58,96,0.07)', padding: '22px', overflowX: 'auto', animation: 'fade-up 0.42s ease both' }, children: [_jsx("h2", { style: { color: '#1e3a8a', marginTop: 0, marginBottom: '16px', fontSize: '1.05rem', fontWeight: '800' }, children: "BOV Management" }), _jsx("div", { style: { display: 'grid', gap: '10px', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', marginBottom: '14px' }, children: [
                            { label: 'Vehicle Number', value: newBov.vehicleNumber, onChange: (v) => setNewBov(p => ({ ...p, vehicleNumber: v })), type: 'text' },
                            { label: 'Seats', value: String(newBov.totalSeats), onChange: (v) => setNewBov(p => ({ ...p, totalSeats: Number(v) })), type: 'number' },
                            { label: 'Platform', value: newBov.currentPlatform, onChange: (v) => setNewBov(p => ({ ...p, currentPlatform: v })), type: 'text' }
                        ].map(f => (_jsxs("label", { style: { display: 'flex', flexDirection: 'column', gap: '5px', fontSize: '0.85rem', fontWeight: '600', color: '#334155' }, children: [f.label, _jsx("input", { type: f.type, value: f.value, onChange: e => f.onChange(e.target.value), style: { border: '1px solid #c0cee1', borderRadius: '10px', padding: '9px 10px', transition: 'border-color 0.15s ease', outline: 'none' } })] }, f.label))) }), _jsx("button", { onClick: addBov, style: { border: 'none', borderRadius: '10px', background: 'linear-gradient(135deg, #f97316, #ea580c)', color: '#fff', padding: '10px 18px', fontWeight: '700', cursor: 'pointer', boxShadow: '0 6px 14px rgba(234,88,12,0.28)', marginBottom: '16px', fontSize: '0.9rem', transition: 'all 0.18s ease' }, onMouseOver: (e) => { e.currentTarget.style.transform = 'translateY(-1px)'; }, onMouseOut: (e) => { e.currentTarget.style.transform = 'none'; }, children: "+ Add BOV" }), _jsxs("table", { style: { width: '100%', borderCollapse: 'collapse' }, children: [_jsx("thead", { children: _jsx("tr", { children: ['ID', 'Vehicle', 'Seats', 'Status', 'Assignment'].map(h => (_jsx("th", { style: { textAlign: 'left', padding: '9px 8px', borderBottom: '1px solid #eaf0f8', fontSize: '0.76rem', color: '#2b476d', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: '700' }, children: h }, h))) }) }), _jsx("tbody", { children: bovs.map((b) => (_jsxs("tr", { style: { transition: 'background 0.15s' }, onMouseOver: (e) => { e.currentTarget.style.background = '#f8fafc'; }, onMouseOut: (e) => { e.currentTarget.style.background = 'transparent'; }, children: [_jsx("td", { style: { padding: '9px 8px', borderBottom: '1px solid #eaf0f8', fontSize: '0.88rem', fontWeight: '700' }, children: b.bovId }), _jsx("td", { style: { padding: '9px 8px', borderBottom: '1px solid #eaf0f8', fontSize: '0.88rem' }, children: b.vehicleNumber }), _jsx("td", { style: { padding: '9px 8px', borderBottom: '1px solid #eaf0f8', fontSize: '0.88rem' }, children: b.totalSeats }), _jsx("td", { style: { padding: '9px 8px', borderBottom: '1px solid #eaf0f8' }, children: _jsx("span", { style: { display: 'inline-flex', alignItems: 'center', borderRadius: '999px', padding: '3px 10px', fontWeight: '700', fontSize: '0.74rem', textTransform: 'capitalize', background: b.status === 'active' ? '#e9f8ec' : b.status === 'maintenance' ? '#fff2df' : '#eceff5', color: b.status === 'active' ? '#1f6f3f' : b.status === 'maintenance' ? '#9a5600' : '#5d6777' }, children: b.status }) }), _jsx("td", { style: { padding: '9px 8px', borderBottom: '1px solid #eaf0f8' }, children: _jsxs("select", { value: b.assignedDriverId ?? "", onChange: e => updateBovAssignment(b.bovId, e.target.value || null), style: { border: '1px solid #c0cee1', borderRadius: '8px', padding: '6px 8px', fontSize: '0.85rem', background: '#fff', outline: 'none' }, children: [_jsx("option", { value: "", children: "Unassigned" }), drivers.map((d) => _jsx("option", { value: d.uid, children: d.name }, d.uid))] }) })] }, b.bovId))) })] })] })), activeTab === "drivers" && (_jsxs("section", { style: { marginTop: '16px', background: 'linear-gradient(180deg, #fff, #fbfdff)', borderRadius: '14px', border: '1px solid #d6e0ec', boxShadow: '0 10px 24px rgba(30,58,96,0.07)', padding: '22px', overflowX: 'auto', animation: 'fade-up 0.42s ease both' }, children: [_jsx("h2", { style: { color: '#1e3a8a', marginTop: 0, marginBottom: '4px', fontSize: '1.05rem', fontWeight: '800' }, children: "Driver Management" }), _jsx("p", { style: { color: '#64748b', margin: '0 0 16px', fontSize: '0.85rem' }, children: "Drivers sign up through Staff Portal." }), _jsxs("table", { style: { width: '100%', borderCollapse: 'collapse' }, children: [_jsx("thead", { children: _jsx("tr", { children: ['UID', 'Name', 'Email', 'Assigned BOV', 'Status', 'Actions'].map(h => (_jsx("th", { style: { textAlign: 'left', padding: '9px 8px', borderBottom: '1px solid #eaf0f8', fontSize: '0.76rem', color: '#2b476d', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: '700' }, children: h }, h))) }) }), _jsx("tbody", { children: drivers.map((d) => (_jsxs("tr", { onMouseOver: (e) => { e.currentTarget.style.background = '#f8fafc'; }, onMouseOut: (e) => { e.currentTarget.style.background = 'transparent'; }, children: [_jsx("td", { style: { padding: '9px 8px', borderBottom: '1px solid #eaf0f8', fontSize: '0.8rem', color: '#64748b', maxWidth: '140px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }, children: d.uid }), _jsx("td", { style: { padding: '9px 8px', borderBottom: '1px solid #eaf0f8', fontWeight: '600', fontSize: '0.88rem' }, children: d.name }), _jsx("td", { style: { padding: '9px 8px', borderBottom: '1px solid #eaf0f8', fontSize: '0.88rem', color: '#475569' }, children: d.email }), _jsx("td", { style: { padding: '9px 8px', borderBottom: '1px solid #eaf0f8' }, children: _jsxs("select", { value: d.assignedBovId ?? "", onChange: e => updateDriverAssignment(d.uid, e.target.value || null), style: { border: '1px solid #c0cee1', borderRadius: '8px', padding: '6px 8px', fontSize: '0.85rem', background: '#fff', outline: 'none' }, children: [_jsx("option", { value: "", children: "None" }), bovs.map((b) => _jsx("option", { value: b.bovId, children: b.bovId }, b.bovId))] }) }), _jsx("td", { style: { padding: '9px 8px', borderBottom: '1px solid #eaf0f8' }, children: _jsx("span", { style: { display: 'inline-flex', alignItems: 'center', borderRadius: '999px', padding: '3px 10px', fontWeight: '700', fontSize: '0.74rem', background: d.active ? '#e9f8ec' : '#eceff5', color: d.active ? '#1f6f3f' : '#5d6777' }, children: d.active ? 'Active' : 'Inactive' }) }), _jsx("td", { style: { padding: '9px 8px', borderBottom: '1px solid #eaf0f8' }, children: _jsx("button", { onClick: () => deleteDriver(d.uid), style: { border: 'none', background: 'linear-gradient(135deg, #ef4444, #dc2626)', color: '#fff', borderRadius: '8px', padding: '6px 12px', cursor: 'pointer', fontWeight: '700', fontSize: '0.8rem', transition: 'transform 0.14s ease' }, onMouseOver: (e) => { e.currentTarget.style.transform = 'translateY(-1px)'; }, onMouseOut: (e) => { e.currentTarget.style.transform = 'none'; }, children: "Delete" }) })] }, d.uid))) })] })] })), activeTab === "trains" && (_jsxs("section", { style: { marginTop: '16px', background: 'linear-gradient(180deg, #fff, #fbfdff)', borderRadius: '14px', border: '1px solid #d6e0ec', boxShadow: '0 10px 24px rgba(30,58,96,0.07)', padding: '22px', overflowX: 'auto', animation: 'fade-up 0.42s ease both' }, children: [_jsx("h2", { style: { color: '#1e3a8a', marginTop: 0, marginBottom: '16px', fontSize: '1.05rem', fontWeight: '800' }, children: "Train Schedules" }), _jsx("div", { style: { display: 'grid', gap: '10px', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', marginBottom: '14px' }, children: [
                            { label: 'Train No.', value: newTrain.trainNumber, onChange: (v) => setNewTrain(p => ({ ...p, trainNumber: v })) },
                            { label: 'Name', value: newTrain.trainName, onChange: (v) => setNewTrain(p => ({ ...p, trainName: v })) },
                            { label: 'Platform', value: newTrain.platformNumber, onChange: (v) => setNewTrain(p => ({ ...p, platformNumber: v })) }
                        ].map(f => (_jsxs("label", { style: { display: 'flex', flexDirection: 'column', gap: '5px', fontSize: '0.85rem', fontWeight: '600', color: '#334155' }, children: [f.label, _jsx("input", { value: f.value, onChange: e => f.onChange(e.target.value), style: { border: '1px solid #c0cee1', borderRadius: '10px', padding: '9px 10px', outline: 'none' } })] }, f.label))) }), _jsx("button", { onClick: addTrain, style: { border: 'none', borderRadius: '10px', background: 'linear-gradient(135deg, #f97316, #ea580c)', color: '#fff', padding: '10px 18px', fontWeight: '700', cursor: 'pointer', boxShadow: '0 6px 14px rgba(234,88,12,0.28)', marginBottom: '16px', fontSize: '0.9rem', transition: 'all 0.18s ease' }, onMouseOver: (e) => { e.currentTarget.style.transform = 'translateY(-1px)'; }, onMouseOut: (e) => { e.currentTarget.style.transform = 'none'; }, children: "+ Add Train" }), _jsxs("table", { style: { width: '100%', borderCollapse: 'collapse' }, children: [_jsx("thead", { children: _jsx("tr", { children: ['Number', 'Name', 'Platform', 'Type', 'Active', 'Actions / Delay Sync'].map(h => (_jsx("th", { style: { textAlign: 'left', padding: '9px 8px', borderBottom: '1px solid #eaf0f8', fontSize: '0.76rem', color: '#2b476d', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: '700' }, children: h }, h))) }) }), _jsx("tbody", { children: trains.map((t) => (_jsxs("tr", { onMouseOver: (e) => { e.currentTarget.style.background = '#f8fafc'; }, onMouseOut: (e) => { e.currentTarget.style.background = 'transparent'; }, children: [_jsx("td", { style: { padding: '9px 8px', borderBottom: '1px solid #eaf0f8', fontWeight: '700', fontSize: '0.88rem' }, children: t.trainNumber }), _jsx("td", { style: { padding: '9px 8px', borderBottom: '1px solid #eaf0f8', fontSize: '0.88rem' }, children: t.trainName }), _jsx("td", { style: { padding: '9px 8px', borderBottom: '1px solid #eaf0f8', fontSize: '0.88rem' }, children: t.platformNumber }), _jsx("td", { style: { padding: '9px 8px', borderBottom: '1px solid #eaf0f8', fontSize: '0.88rem', textTransform: 'capitalize' }, children: t.type }), _jsx("td", { style: { padding: '9px 8px', borderBottom: '1px solid #eaf0f8' }, children: _jsx("span", { style: { fontSize: '0.8rem', fontWeight: '700', color: t.isActive ? '#16a34a' : '#dc2626' }, children: t.isActive ? 'Yes' : 'No' }) }), _jsx("td", { style: { padding: '9px 8px', borderBottom: '1px solid #eaf0f8' }, children: _jsxs("div", { style: { display: 'flex', gap: '8px', alignItems: 'center' }, children: [_jsxs("select", { id: `delay-select-${t.trainNumber}`, defaultValue: "30", style: { border: '1px solid #c0cee1', borderRadius: '8px', padding: '6px 8px', fontSize: '0.82rem', background: '#fff', outline: 'none' }, children: [_jsx("option", { value: "15", children: "Delay 15m" }), _jsx("option", { value: "30", children: "Delay 30m" }), _jsx("option", { value: "45", children: "Delay 45m" }), _jsx("option", { value: "60", children: "Delay 60m" })] }), _jsx("button", { onClick: () => { const sel = document.getElementById(`delay-select-${t.trainNumber}`); delayTrain(t.trainNumber, Number(sel?.value || 30)); }, style: { background: 'linear-gradient(135deg, #1e3a8a, #2563eb)', color: '#fff', border: 'none', padding: '6px 12px', borderRadius: '8px', cursor: 'pointer', fontWeight: '700', fontSize: '0.82rem', transition: 'all 0.15s ease', boxShadow: '0 2px 8px rgba(30,58,138,0.2)' }, onMouseOver: (e) => { e.currentTarget.style.transform = 'translateY(-1px)'; }, onMouseOut: (e) => { e.currentTarget.style.transform = 'none'; }, children: "Apply Delay" })] }) })] }, t.trainNumber))) })] })] })), activeTab === "bookings" && (_jsxs("section", { style: { marginTop: '16px', background: 'linear-gradient(180deg, #fff, #fbfdff)', borderRadius: '14px', border: '1px solid #d6e0ec', boxShadow: '0 10px 24px rgba(30,58,96,0.07)', padding: '22px', overflowX: 'auto', animation: 'fade-up 0.42s ease both' }, children: [_jsx("h2", { style: { color: '#1e3a8a', marginTop: 0, marginBottom: '16px', fontSize: '1.05rem', fontWeight: '800' }, children: "All Ride Bookings" }), _jsxs("table", { style: { width: '100%', borderCollapse: 'collapse' }, children: [_jsx("thead", { children: _jsx("tr", { children: ['ID', 'Train', 'From', 'To', 'BOV', 'Fare', 'Status', 'Created'].map(h => (_jsx("th", { style: { textAlign: 'left', padding: '9px 8px', borderBottom: '1px solid #eaf0f8', fontSize: '0.76rem', color: '#2b476d', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: '700' }, children: h }, h))) }) }), _jsx("tbody", { children: bookings.map((b) => (_jsxs("tr", { onMouseOver: (e) => { e.currentTarget.style.background = '#f8fafc'; }, onMouseOut: (e) => { e.currentTarget.style.background = 'transparent'; }, children: [_jsx("td", { style: { padding: '9px 8px', borderBottom: '1px solid #eaf0f8' }, children: _jsxs("div", { style: { display: 'flex', flexDirection: 'column', gap: '4px' }, children: [_jsx("span", { style: { fontWeight: '700', fontSize: '0.85rem' }, children: b.bookingId }), b.isSharedRide && (_jsx("span", { style: { background: 'linear-gradient(135deg, #0288d1, #03a9f4)', color: 'white', fontSize: '0.68rem', padding: '2px 7px', borderRadius: '4px', display: 'inline-flex', alignItems: 'center', alignSelf: 'flex-start', boxShadow: '0 2px 6px rgba(2,136,209,0.3)', fontWeight: '700' }, children: "SHARED" }))] }) }), _jsx("td", { style: { padding: '9px 8px', borderBottom: '1px solid #eaf0f8', fontSize: '0.88rem' }, children: b.trainNumber }), _jsx("td", { style: { padding: '9px 8px', borderBottom: '1px solid #eaf0f8', fontSize: '0.88rem' }, children: b.fromPlatform }), _jsx("td", { style: { padding: '9px 8px', borderBottom: '1px solid #eaf0f8', fontSize: '0.88rem' }, children: b.toPlatform }), _jsx("td", { style: { padding: '9px 8px', borderBottom: '1px solid #eaf0f8', fontSize: '0.88rem', color: '#475569' }, children: b.bovId }), _jsxs("td", { style: { padding: '9px 8px', borderBottom: '1px solid #eaf0f8', fontSize: '0.88rem', fontWeight: '600' }, children: ["Rs ", b.fare] }), _jsx("td", { style: { padding: '9px 8px', borderBottom: '1px solid #eaf0f8' }, children: _jsx("span", { style: { display: 'inline-flex', alignItems: 'center', borderRadius: '999px', padding: '3px 10px', fontWeight: '700', fontSize: '0.74rem', textTransform: 'capitalize', background: b.rideStatus === 'completed' ? '#e9f8ec' : b.rideStatus === 'cancelled' ? '#ffe8e8' : b.rideStatus === 'in-progress' ? '#e9f1ff' : '#edf6ff', color: b.rideStatus === 'completed' ? '#1f6f3f' : b.rideStatus === 'cancelled' ? '#9a3535' : b.rideStatus === 'in-progress' ? '#265aa4' : '#2b6aac' }, children: b.rideStatus }) }), _jsx("td", { style: { padding: '9px 8px', borderBottom: '1px solid #eaf0f8', fontSize: '0.8rem', color: '#64748b' }, children: new Date(b.createdAt).toLocaleString() })] }, b.bookingId))) })] })] })), activeTab === "peakHours" && (_jsxs("section", { style: { marginTop: '16px', background: 'linear-gradient(180deg, #fff, #fbfdff)', borderRadius: '14px', border: '1px solid #d6e0ec', boxShadow: '0 10px 24px rgba(30,58,96,0.07)', padding: '22px', overflowX: 'auto', animation: 'fade-up 0.42s ease both' }, children: [_jsx("h2", { style: { color: '#1e3a8a', marginTop: 0, marginBottom: '16px', fontSize: '1.05rem', fontWeight: '800' }, children: "Peak Hour Pricing" }), _jsxs("div", { style: { display: 'grid', gap: '10px', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', marginBottom: '14px' }, children: [_jsxs("label", { style: { display: 'flex', flexDirection: 'column', gap: '5px', fontSize: '0.85rem', fontWeight: '600', color: '#334155' }, children: ["Label", _jsx("input", { value: newPeak.label, onChange: e => setNewPeak(p => ({ ...p, label: e.target.value })), style: { border: '1px solid #c0cee1', borderRadius: '10px', padding: '9px 10px', outline: 'none' } })] }), _jsxs("label", { style: { display: 'flex', flexDirection: 'column', gap: '5px', fontSize: '0.85rem', fontWeight: '600', color: '#334155' }, children: ["Start", _jsx("input", { type: "time", value: newPeak.startTime, onChange: e => setNewPeak(p => ({ ...p, startTime: e.target.value })), style: { border: '1px solid #c0cee1', borderRadius: '10px', padding: '9px 10px', outline: 'none' } })] }), _jsxs("label", { style: { display: 'flex', flexDirection: 'column', gap: '5px', fontSize: '0.85rem', fontWeight: '600', color: '#334155' }, children: ["End", _jsx("input", { type: "time", value: newPeak.endTime, onChange: e => setNewPeak(p => ({ ...p, endTime: e.target.value })), style: { border: '1px solid #c0cee1', borderRadius: '10px', padding: '9px 10px', outline: 'none' } })] }), _jsxs("label", { style: { display: 'flex', flexDirection: 'column', gap: '5px', fontSize: '0.85rem', fontWeight: '600', color: '#334155' }, children: ["Multiplier", _jsx("input", { type: "number", step: "0.1", value: newPeak.multiplier, onChange: e => setNewPeak(p => ({ ...p, multiplier: Number(e.target.value) })), style: { border: '1px solid #c0cee1', borderRadius: '10px', padding: '9px 10px', outline: 'none' } })] })] }), _jsx("button", { onClick: addPeakHour, style: { border: 'none', borderRadius: '10px', background: 'linear-gradient(135deg, #f97316, #ea580c)', color: '#fff', padding: '10px 18px', fontWeight: '700', cursor: 'pointer', boxShadow: '0 6px 14px rgba(234,88,12,0.28)', marginBottom: '16px', fontSize: '0.9rem', transition: 'all 0.18s ease' }, onMouseOver: (e) => { e.currentTarget.style.transform = 'translateY(-1px)'; }, onMouseOut: (e) => { e.currentTarget.style.transform = 'none'; }, children: "+ Add Rule" }), _jsxs("table", { style: { width: '100%', borderCollapse: 'collapse' }, children: [_jsx("thead", { children: _jsx("tr", { children: ['Label', 'Time Range', 'Multiplier', 'Actions'].map(h => (_jsx("th", { style: { textAlign: 'left', padding: '9px 8px', borderBottom: '1px solid #eaf0f8', fontSize: '0.76rem', color: '#2b476d', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: '700' }, children: h }, h))) }) }), _jsx("tbody", { children: peakHours.map((p) => (_jsxs("tr", { onMouseOver: (e) => { e.currentTarget.style.background = '#f8fafc'; }, onMouseOut: (e) => { e.currentTarget.style.background = 'transparent'; }, children: [_jsx("td", { style: { padding: '9px 8px', borderBottom: '1px solid #eaf0f8', fontWeight: '600', fontSize: '0.88rem' }, children: p.label }), _jsxs("td", { style: { padding: '9px 8px', borderBottom: '1px solid #eaf0f8', fontSize: '0.88rem', color: '#475569' }, children: [p.startTime, " \u2013 ", p.endTime] }), _jsx("td", { style: { padding: '9px 8px', borderBottom: '1px solid #eaf0f8' }, children: _jsxs("span", { style: { background: '#eff6ff', color: '#1e3a8a', borderRadius: '6px', padding: '3px 8px', fontWeight: '700', fontSize: '0.82rem' }, children: [p.multiplier, "x"] }) }), _jsx("td", { style: { padding: '9px 8px', borderBottom: '1px solid #eaf0f8' }, children: _jsx("button", { onClick: () => deletePeakHour(p._id || p.id || ""), style: { border: 'none', background: 'linear-gradient(135deg, #ef4444, #dc2626)', color: '#fff', borderRadius: '8px', padding: '6px 12px', cursor: 'pointer', fontWeight: '700', fontSize: '0.8rem', transition: 'transform 0.14s ease' }, onMouseOver: (e) => { e.currentTarget.style.transform = 'translateY(-1px)'; }, onMouseOut: (e) => { e.currentTarget.style.transform = 'none'; }, children: "Delete" }) })] }, p._id || p.id || p.label))) })] })] })), activeTab === "analytics" && (_jsxs("section", { style: { marginTop: '16px', background: 'linear-gradient(180deg, #fff, #fbfdff)', borderRadius: '14px', border: '1px solid #d6e0ec', boxShadow: '0 10px 24px rgba(30,58,96,0.07)', padding: '22px', animation: 'fade-up 0.42s ease both' }, children: [_jsx("h2", { style: { color: '#1e3a8a', marginTop: 0, marginBottom: '16px', fontSize: '1.05rem', fontWeight: '800' }, children: "Station Mobility Analytics" }), _jsx("div", { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '12px' }, children: [
                            { label: 'Completed Rides', value: bookings.filter((b) => b.rideStatus === 'completed').length, color: '#1f6f3f', bg: '#e9f8ec' },
                            { label: 'Total Revenue', value: `Rs ${bookings.filter((b) => b.rideStatus === 'completed').reduce((s, b) => s + b.fare, 0)}`, color: '#7c3aed', bg: '#f5f3ff' },
                            { label: 'Shared Rides', value: bookings.filter((b) => b.isSharedRide).length, color: '#0369a1', bg: '#e0f2fe' },
                            { label: 'Cancellations', value: bookings.filter((b) => b.rideStatus === 'cancelled').length, color: '#9a3535', bg: '#ffe8e8' }
                        ].map(s => (_jsxs("article", { style: { padding: '16px', border: '1px solid #d6e2f0', borderRadius: '12px', display: 'flex', flexDirection: 'column', gap: '4px', background: s.bg }, children: [_jsx("strong", { style: { color: s.color, fontSize: '1.4rem', fontWeight: '800' }, children: s.value }), _jsx("span", { style: { color: '#5a6f8c', fontSize: '0.82rem', fontWeight: '600' }, children: s.label })] }, s.label))) }), _jsxs("div", { style: { marginTop: '2.5rem' }, children: [_jsx("h3", { style: { fontSize: '0.95rem', fontWeight: '800', color: '#1e3a8a', margin: '0 0 6px' }, children: "Platform Demand Heatmap" }), _jsx("p", { style: { color: '#5a6f8c', fontSize: '0.85rem', margin: '0 0 16px' }, children: "Deeper crimson = higher booking volume." }), _jsx("div", { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '14px' }, children: ["Platform 1", "Platform 2", "Platform 3", "Platform 4", "Platform 5"].map((platName) => {
                                    const count = bookings.filter((b) => b.fromPlatform === platName || b.toPlatform === platName).length;
                                    const maxCount = Math.max(1, ...["Platform 1", "Platform 2", "Platform 3", "Platform 4", "Platform 5"].map(p => bookings.filter((b) => b.fromPlatform === p || b.toPlatform === p).length));
                                    const intensity = 0.1 + (count / maxCount) * 0.8;
                                    return (_jsxs("article", { style: { background: `rgba(211,47,47,${intensity})`, border: '1px solid rgba(211,47,47,0.3)', boxShadow: intensity > 0.5 ? '0 6px 20px rgba(211,47,47,0.3)' : 'none', transition: 'all 0.3s ease', transform: intensity > 0.6 ? 'scale(1.03)' : 'scale(1)', borderRadius: '10px', padding: '16px', textAlign: 'center' }, children: [_jsx("strong", { style: { fontSize: '1.8rem', display: 'block', color: intensity > 0.4 ? '#fff' : '#1e3a8a' }, children: count }), _jsx("span", { style: { color: intensity > 0.4 ? 'rgba(255,255,255,0.8)' : '#5a6f8c', fontSize: '0.82rem', fontWeight: '700' }, children: platName })] }, platName));
                                }) })] }), _jsxs("div", { style: { marginTop: '2.5rem' }, children: [_jsx("h3", { style: { fontSize: '0.95rem', fontWeight: '800', color: '#1e3a8a', margin: '0 0 6px' }, children: "Peak Demand by Train" }), _jsx("p", { style: { color: '#5a6f8c', fontSize: '0.85rem', margin: '0 0 14px' }, children: "Relative booking loads by train number." }), _jsx("div", { style: { background: '#0d1e36', padding: '24px', borderRadius: '12px', border: '1px solid #1a3a6b' }, children: _jsx("div", { style: { display: 'flex', alignItems: 'flex-end', height: '180px', gap: '24px', justifyContent: 'space-around', paddingBottom: '8px', borderBottom: '2px solid #1a3a6b' }, children: ["12725", "17301", "12079", "20653"].map((trainNo) => {
                                        const count = bookings.filter((b) => b.trainNumber === trainNo).length;
                                        const maxCount = Math.max(1, ...["12725", "17301", "12079", "20653"].map(t => bookings.filter((b) => b.trainNumber === t).length));
                                        const barHeight = `${Math.max(15, (count / maxCount) * 150)}px`;
                                        const barColor = count / maxCount > 0.7 ? 'linear-gradient(180deg, #ff7b00, #ff4500)' : 'linear-gradient(180deg, #2d6cb5, #1a3a6b)';
                                        return (_jsxs("div", { style: { display: 'flex', flexDirection: 'column', alignItems: 'center', width: '45px' }, children: [_jsx("span", { style: { color: '#fff', fontSize: '0.85rem', fontWeight: 'bold', marginBottom: '6px' }, children: count }), _jsx("div", { style: { height: barHeight, width: '100%', background: barColor, borderRadius: '6px 6px 0 0', boxShadow: '0 4px 12px rgba(0,0,0,0.3)', transition: 'height 0.8s cubic-bezier(0.4,0,0.2,1)' } }), _jsxs("span", { style: { color: '#a5b8d0', fontSize: '0.75rem', marginTop: '8px', fontWeight: 'bold' }, children: ["T-", trainNo] })] }, trainNo));
                                    }) }) })] })] })), status && (_jsx("div", { style: { marginTop: '16px', padding: '12px 16px', borderRadius: '10px', border: '1px solid #b8d7a6', background: '#f2fae9', color: '#2a5d1a', fontSize: '0.88rem', fontWeight: '600' }, children: status })), activeSos && (_jsxs("div", { style: { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(15,2,2,0.9)', backdropFilter: 'blur(16px)', zIndex: 99999, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontFamily: "'Inter', 'Segoe UI', sans-serif", animation: 'sosFadeIn 0.3s ease-out' }, children: [_jsx("style", { children: `
            @keyframes sosFadeIn { from { opacity: 0; } to { opacity: 1; } }
            @keyframes sosPulse { 0% { box-shadow: 0 0 0 0 rgba(211,47,47,0.7), 0 0 0 0 rgba(211,47,47,0.4); } 70% { box-shadow: 0 0 0 20px rgba(211,47,47,0), 0 0 0 40px rgba(211,47,47,0); } 100% { box-shadow: 0 0 0 0 rgba(211,47,47,0), 0 0 0 0 rgba(211,47,47,0); } }
            @keyframes borderGlow { 0% { border-color: #d32f2f; } 50% { border-color: #ff5252; } 100% { border-color: #d32f2f; } }
            @keyframes fade-up { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
          ` }), _jsxs("div", { style: { background: 'rgba(30,8,8,0.85)', border: '2px solid #d32f2f', borderRadius: '24px', padding: '40px', maxWidth: '550px', width: '90%', textAlign: 'center', boxShadow: '0 20px 50px rgba(0,0,0,0.5)', animation: 'sosPulse 2s infinite, borderGlow 2s infinite' }, children: [_jsx("div", { style: { background: 'linear-gradient(135deg, #d32f2f, #b71c1c)', width: '80px', height: '80px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 24px', boxShadow: '0 4px 20px rgba(211,47,47,0.5)' }, children: _jsxs("svg", { width: "40", height: "40", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2.5", strokeLinecap: "round", strokeLinejoin: "round", style: { color: '#fff' }, children: [_jsx("path", { d: "M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" }), _jsx("line", { x1: "12", y1: "9", x2: "12", y2: "13" }), _jsx("line", { x1: "12", y1: "17", x2: "12.01", y2: "17" })] }) }), _jsx("span", { style: { background: 'rgba(211,47,47,0.15)', color: '#ff5252', fontSize: '0.8rem', fontWeight: 'bold', letterSpacing: '2px', padding: '6px 16px', borderRadius: '20px', textTransform: 'uppercase', display: 'inline-block', marginBottom: '16px', border: '1px solid rgba(211,47,47,0.3)' }, children: "Active SOS Panic Event" }), _jsx("h2", { style: { fontSize: '2rem', margin: '0 0 12px', fontWeight: 'bold', color: '#fff' }, children: "Emergency Alarm" }), _jsx("p", { style: { color: '#a5b8d0', margin: '0 0 30px', fontSize: '0.95rem', lineHeight: '1.5' }, children: "An emergency SOS panic signal has been dispatched from the station platform floor. Please coordinate immediate dispatch." }), _jsxs("div", { style: { background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '16px', padding: '20px', textAlign: 'left', marginBottom: '32px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px 12px' }, children: [_jsxs("div", { children: [_jsx("span", { style: { display: 'block', fontSize: '0.75rem', color: '#8fa8c8', textTransform: 'uppercase', letterSpacing: '0.5px' }, children: "Distressed Node" }), _jsx("strong", { style: { fontSize: '1rem', color: '#ff5252' }, children: activeSos.role?.toUpperCase() || 'PASSENGER' })] }), _jsxs("div", { children: [_jsx("span", { style: { display: 'block', fontSize: '0.75rem', color: '#8fa8c8', textTransform: 'uppercase', letterSpacing: '0.5px' }, children: "Booking ID" }), _jsx("strong", { style: { fontSize: '1rem', color: '#fff' }, children: activeSos.bookingId || 'N/A' })] }), _jsxs("div", { children: [_jsx("span", { style: { display: 'block', fontSize: '0.75rem', color: '#8fa8c8', textTransform: 'uppercase', letterSpacing: '0.5px' }, children: "Reporter Name" }), _jsx("strong", { style: { fontSize: '1rem', color: '#fff' }, children: activeSos.passengerName || 'Unknown Passenger' })] }), _jsxs("div", { children: [_jsx("span", { style: { display: 'block', fontSize: '0.75rem', color: '#8fa8c8', textTransform: 'uppercase', letterSpacing: '0.5px' }, children: "Last Platform Location" }), _jsx("strong", { style: { fontSize: '1rem', color: '#ffeb3b' }, children: activeSos.currentPlatform || 'Unknown' })] })] }), _jsx("button", { onClick: () => { setActiveSos(null); setStatus('SOS Alert acknowledged. Assistance crew dispatched!'); }, style: { width: '100%', background: 'linear-gradient(135deg, #d32f2f, #c62828)', color: 'white', border: 'none', padding: '14px 24px', borderRadius: '12px', cursor: 'pointer', fontWeight: 'bold', fontSize: '1rem', transition: 'all 0.2s ease', boxShadow: '0 4px 15px rgba(211,47,47,0.4)' }, onMouseOver: (e) => { e.currentTarget.style.transform = 'translateY(-2px)'; }, onMouseOut: (e) => { e.currentTarget.style.transform = 'none'; }, children: "Dispatch Help & Dismiss" })] })] }))] }));
}
