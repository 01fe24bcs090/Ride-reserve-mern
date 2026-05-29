import { useState, useEffect } from "react";
import api from "./api/client";
import { BookingDoc as Ride, RideStatus } from "@ride-reserve/types";
import { useDriverRides } from "./hooks/useDriverRides";
import { io } from "socket.io-client";

const socketUrl = import.meta.env.VITE_API_URL ? import.meta.env.VITE_API_URL.replace("/api", "") : "http://localhost:5000";
const socket = io(socketUrl);

export default function App() {
  const [user, setUser] = useState<any>(null);
  const [authResolved, setAuthResolved] = useState(false);
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authName, setAuthName] = useState("");
  const [authBusy, setAuthBusy] = useState(false);
  const [isSignup, setIsSignup] = useState(false);
  const [status, setStatus] = useState("");
  const [aadharNumber, setAadharNumber] = useState("");
  const [aadharImage, setAadharImage] = useState<File | null>(null);

  // OTP States
  const [showOtpScreen, setShowOtpScreen] = useState(false);
  const [verifyingEmail, setVerifyingEmail] = useState("");
  const [otpValue, setOtpValue] = useState("");
  const [otpStatus, setOtpStatus] = useState("");
  const [countdown, setCountdown] = useState(0);

  const [driverBov, setDriverBov] = useState<any>(null);
  const [pins, setPins] = useState<Record<string, string>>({});
  const [showProfileMenu, setShowProfileMenu] = useState(false);

  const getDriverInitials = () => {
    const name = user?.name;
    if (!name) return "D";
    const parts = name.trim().split(/\s+/);
    const first = parts[0];
    const last = parts[parts.length - 1];
    if (first && last && parts.length >= 2) {
      return (first.charAt(0) + last.charAt(0)).toUpperCase();
    }
    return first ? first.slice(0, 2).toUpperCase() : "D";
  };
  const driverInitials = getDriverInitials();

  const { rides, loading: ridesLoading, error: ridesError } = useDriverRides(user?.uid);

  const formatBookingId = (id: string) => {
    if (!id) return "";
    const cleanId = id.replace('BKG-', '');
    if (cleanId.length > 5) {
      return '#' + cleanId.slice(-5);
    }
    return '#' + cleanId;
  };

  const stripEmojis = (text: string) => {
    if (!text) return "";
    return text.replace(/[\uE000-\uF8FF]|\uD83C[\uDC00-\uDFFF]|\uD83D[\uDC00-\uDFFF]|[\u2011-\u26FF]|\uD83E[\uDD10-\uDDFF]/g, "").trim();
  };

  useEffect(() => {
    document.body.style.background = '#f8fafc';
    document.body.style.margin = '0';
    document.body.style.fontFamily = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
  }, []);

  // Close profile menu when clicking outside
  useEffect(() => {
    if (!showProfileMenu) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('#profile-menu-container')) {
        setShowProfileMenu(false);
      }
    };
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, [showProfileMenu]);

  useEffect(() => {
    if (!user || !user.assignedBovId) {
      setDriverBov(null);
      return;
    }
    const fetchBov = async () => {
      try {
        const { data } = await api.get(`/bovs/${user.assignedBovId}`);
        setDriverBov(data);
      } catch (err) {
        console.error("Failed to fetch BOV info", err);
      }
    };
    fetchBov();
  }, [user]);

  useEffect(() => {
    if (!user || rides.length === 0) return;
    
    // Auto-simulate buggy progression for in-progress rides assigned to us
    const activeRides = rides.filter((r: any) => r.acceptedBy === user.uid && r.rideStatus === "in-progress");
    if (activeRides.length === 0) return;

    const intervals = activeRides.map((ride: any) => {
      const startPlatform = ride.fromPlatform || "Entrance";
      const steps = ["Entrance", "Platform 1", "Platform 2", "Platform 3", "Platform 4", "Platform 5", "Arrived"];
      
      const startIndex = steps.indexOf(startPlatform) >= 0 ? steps.indexOf(startPlatform) : 0;
      const relevantSteps = steps.slice(startIndex);
      
      let stepIdx = 0;
      const interval = setInterval(() => {
        if (stepIdx < relevantSteps.length) {
          const nextPlat = relevantSteps[stepIdx];
          socket.emit("driver_location_update", { bookingId: ride.bookingId, platform: nextPlat });
          stepIdx++;
        } else {
          clearInterval(interval);
        }
      }, 5000); // Progress platform location every 5 seconds
      
      return { id: ride.bookingId, interval };
    });

    return () => {
      intervals.forEach(i => clearInterval(i.interval));
    };
  }, [rides, user]);

  useEffect(() => {
    if (countdown <= 0) return;
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
          if (data.user.role === "driver") {
            setUser(data.user);
          } else {
            localStorage.removeItem('token');
            setStatus("Access denied. Drivers only.");
          }
        } catch (e: any) {
          setStatus("Auto-login failed: " + (e.response?.data?.error || e.message));
        } finally {
          setAuthBusy(false);
          setAuthResolved(true);
        }
        return;
      }

      const token = localStorage.getItem('token');
      if (token) {
        try {
          const { data } = await api.get('/auth/me');
          if (data.role === "driver") {
            setUser(data);
          } else {
            localStorage.removeItem('token');
            setStatus("Access denied. Drivers only.");
          }
        } catch (e) {
          localStorage.removeItem('token');
        }
      }
      setAuthResolved(true);
    };

    initAuth();
  }, []);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setAuthBusy(true);
    setStatus("Signing in...");
    try {
      const { data } = await api.post('/auth/login', { email: authEmail, password: authPassword });
      if (data.user.role === "driver") {
        localStorage.setItem('token', data.token);
        setUser(data.user);
        setStatus("Login successful.");
      } else {
        setStatus("Access denied. Drivers only.");
      }
    } catch (e: any) {
      const errResponse = e.response?.data;
      if (errResponse && errResponse.error === "email_not_verified") {
        setVerifyingEmail(errResponse.email || authEmail);
        setShowOtpScreen(true);
        setOtpStatus("Your email is not verified. A new 6-digit code has been sent!");
      } else {
        setStatus("Login failed: " + (errResponse?.error || e.message));
      }
    } finally {
      setAuthBusy(false);
    }
  }

  async function handleAadharUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setAadharImage(file);
    setStatus("Scanning Aadhar card...");
    setAuthBusy(true);
    try {
      // @ts-ignore
      const { data: { text } } = await window.Tesseract.recognize(file, 'eng');
      const match = text.match(/\b\d{4}\s?\d{4}\s?\d{4}\b/);
      if (match) {
        setAadharNumber(match[0].replace(/\s/g, ''));
        setStatus("Aadhar number extracted successfully.");
      } else {
        setStatus("Could not detect Aadhar number. Please enter manually.");
      }
    } catch (err) {
      setStatus("Error scanning image. Please enter Aadhar manually.");
    } finally {
      setAuthBusy(false);
    }
  }

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault();
    setAuthBusy(true);
    setStatus("Creating account...");
    try {
      const { data } = await api.post('/auth/register', {
        name: authName,
        email: authEmail,
        password: authPassword,
        aadharNumber: aadharNumber,
        role: "driver"
      });
      if (data.message === "otp_sent") {
        setVerifyingEmail(authEmail);
        setShowOtpScreen(true);
        setOtpStatus("A 6-digit verification code has been sent to your email!");
      } else {
        localStorage.setItem('token', data.token);
        setUser(data.user);
        setStatus("Signup successful.");
      }
    } catch (e: any) {
      setStatus("Signup failed: " + (e.response?.data?.error || e.message));
    } finally {
      setAuthBusy(false);
    }
  }

  async function handleVerifyOtp(e: React.FormEvent) {
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
      if (data.user.role === "driver") {
        localStorage.setItem("token", data.token);
        setUser(data.user);
        setStatus("Email verified successfully.");
        setShowOtpScreen(false);
      } else {
        setOtpStatus("Access denied. Drivers only.");
      }
    } catch (err: any) {
      const errMsg = err.response?.data?.error || err.message || "Invalid or expired code.";
      setOtpStatus(errMsg);
    } finally {
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
    } catch (err: any) {
      const errMsg = err.response?.data?.error || err.message || "Failed to resend code.";
      setOtpStatus(errMsg);
    } finally {
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

  async function acceptRide(bookingId: string) {
    if (!user) return;
    setStatus(`Accepting ride...`);
    try {
      await api.patch(`/bookings/${bookingId}/status`, {
        status: "confirmed",
        bovId: user.assignedBovId,
        bovVehicleNumber: driverBov?.vehicleNumber || "KA-25-BOV-001"
      });
      setStatus("Ride accepted!");
    } catch (e: any) {
      setStatus("Error: " + (e.response?.data?.error || e.message));
    }
  }

  async function updateStatus(bookingId: string, newStatus: RideStatus) {
    try {
      await api.patch(`/bookings/${bookingId}/status`, { status: newStatus });
      setStatus(`Status updated to ${newStatus}.`);
    } catch (e: any) {
      setStatus("Error: " + (e.response?.data?.error || e.message));
    }
  }

  async function startRideWithPin(bookingId: string, enteredPin: string) {
    if (!enteredPin || enteredPin.length !== 4) {
      setStatus("Error: Please enter the 4-digit pick-up PIN from the passenger.");
      return;
    }
    try {
      await api.patch(`/bookings/${bookingId}/status`, { status: "in-progress", pin: enteredPin });
      setStatus("Ride started successfully!");
    } catch (e: any) {
      setStatus("Error: " + (e.response?.data?.error || e.message));
    }
  }

  function handleLocationChange(bookingId: string, platform: string) {
    if (!platform) return;
    socket.emit("driver_location_update", { bookingId, platform });
    setStatus(`Streaming buggy position: ${platform}`);
  }

  function triggerDriverSos(bookingId: string, passengerName: string, currentPlatform: string) {
    if (!window.confirm("🚨 WARNING: This will trigger an emergency alert to station administration. Proceed only if you need immediate assistance!")) return;
    socket.emit("emergency_sos", {
      bookingId,
      passengerName,
      currentPlatform: currentPlatform || "Platform 1",
      role: "driver"
    });
    setStatus("🚨 SOS emergency successfully broadcasted to Station Admin!");
  }

  const sortedRides = rides
    .filter((r: any) => r.rideStatus !== "completed" && r.rideStatus !== "cancelled")
    .sort((a: any, b: any) => {
      const aMine = a.acceptedBy === user?.uid;
      const bMine = b.acceptedBy === user?.uid;
      if (aMine && !bMine) return -1;
      if (!aMine && bMine) return 1;

      if (a.isPriorityPassenger && !b.isPriorityPassenger) return -1;
      if (!a.isPriorityPassenger && b.isPriorityPassenger) return 1;

      return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
    });


  if (!authResolved) return <div className="page">Initializing Driver Portal...</div>;

  if (!user) {
    return (
      <div className="bg-background font-body-lg text-on-surface antialiased" style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100vw',
        height: '100vh',
        zIndex: 9999,
        margin: 0,
        padding: 0,
        overflow: 'hidden'
      }}>
        <main style={{ height: '100%', display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
          {/* Full Screen Centered Section */}
          <section style={{ position: 'relative', flex: 1, minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px 0' }}>
            {/* Background Concourse Texture */}
            <div style={{ position: 'absolute', inset: 0, zIndex: 0, overflow: 'hidden' }}>
              <img alt="Hubballi Junction Station" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} src="/bg_train_new.jpg" />
            </div>

            <div style={{ position: 'relative', zIndex: 10, width: '90%', maxWidth: '460px', padding: '16px', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
              {/* Solid High-Contrast Card with technical tighter corners */}
              <div
                style={{
                  background: '#ffffff',
                  border: '1px solid #e2e8f0',
                  borderRadius: '12px',
                  boxShadow: '0 8px 30px rgba(15, 23, 42, 0.06)',
                  padding: '40px 36px',
                  width: '100%',
                  color: '#0f172a',
                  fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif"
                }}
              >
                {showOtpScreen ? (
                  <>
                    <span style={{ fontSize: '0.72rem', fontWeight: 'bold', letterSpacing: '2px', textTransform: 'uppercase', color: '#ff7700', display: 'block', marginBottom: '6px', textAlign: 'center' }}>
                      SECURITY CHECK
                    </span>
                    <h2 style={{ fontSize: '1.9rem', fontWeight: '800', color: '#0f172a', margin: '0 0 6px 0', letterSpacing: '-0.5px', textAlign: 'center' }}>
                      Verify Email
                    </h2>
                    <p style={{ fontSize: '0.85rem', color: '#475569', margin: '0 0 24px 0', lineHeight: '1.4', textAlign: 'center' }}>
                      We sent a 6-digit verification code to <strong style={{ color: '#0f172a' }}>{verifyingEmail}</strong>. Please enter it below:
                    </p>

                    <form onSubmit={handleVerifyOtp} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        <label style={{ fontSize: '0.85rem', fontWeight: '600', color: '#334155', textAlign: 'center', marginBottom: '4px' }}>
                          Enter 6-Digit OTP
                        </label>
                        <input
                          type="text"
                          maxLength={6}
                          placeholder="000000"
                          value={otpValue}
                          onChange={(e) => setOtpValue(e.target.value.replace(/[^0-9]/g, ''))}
                          required
                          style={{
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
                          }}
                        />
                      </div>

                      <button
                        type="submit"
                        disabled={authBusy}
                        style={{
                          width: '100%',
                          padding: '14px 0',
                          borderRadius: '8px',
                          border: 'none',
                          background: '#1d4ed8',
                          color: '#ffffff',
                          fontWeight: 'bold',
                          fontSize: '1rem',
                          cursor: 'pointer',
                          boxShadow: '0 4px 12px rgba(29, 78, 216, 0.2)',
                          transition: 'all 0.2s',
                          fontFamily: "'Inter', sans-serif"
                        }}
                        onMouseOver={(e) => { e.currentTarget.style.transform = 'translateY(-1px)'; }}
                        onMouseOut={(e) => { e.currentTarget.style.transform = 'none'; }}
                      >
                        {authBusy ? 'Verifying Code...' : 'Verify & Continue'}
                      </button>

                      {otpStatus && (
                        <p style={{
                          textAlign: 'center',
                          color: otpStatus.includes('sent') ? '#16a34a' : '#dc2626',
                          fontWeight: 'bold',
                          margin: '0',
                          fontSize: '0.88rem',
                          lineHeight: '1.4'
                        }}>
                          {otpStatus}
                        </p>
                      )}
                    </form>

                    <div style={{ textAlign: 'center', marginTop: '24px', paddingTop: '16px', borderTop: '1px solid #e2e8f0' }}>
                      <p style={{ color: '#64748b', fontSize: '0.85rem', margin: '0 0 16px 0' }}>
                        Didn't receive a code?{' '}
                        {countdown > 0 ? (
                          <span style={{ fontWeight: 'bold', color: '#ff7700' }}>Resend in {countdown}s</span>
                        ) : (
                          <button
                            type="button"
                            onClick={handleResendOtp}
                            style={{
                              background: 'none',
                              border: 'none',
                              color: '#ff7700',
                              fontWeight: 'bold',
                              textDecoration: 'underline',
                              cursor: 'pointer',
                              padding: 0
                            }}
                          >
                            Resend Code
                          </button>
                        )}
                      </p>
                      <button
                        type="button"
                        onClick={() => {
                          setShowOtpScreen(false);
                          setOtpValue("");
                          setOtpStatus("");
                        }}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: '#64748b',
                          fontSize: '0.88rem',
                          fontWeight: '600',
                          cursor: 'pointer',
                          textDecoration: 'underline'
                        }}
                      >
                        Back to Login
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    {/* Logo Placeholder */}
                    <div style={{ height: '56px', margin: '0 auto 16px auto' }} />

                    <h1 style={{ fontSize: '2.1rem', fontWeight: '800', color: '#0f172a', margin: '0 0 4px 0', letterSpacing: '-0.75px', textAlign: 'center', fontFamily: "'Inter', sans-serif" }}>
                      Hubballi BOV Transit
                    </h1>
                    <p style={{ fontSize: '0.95rem', fontWeight: '700', color: '#1d4ed8', margin: '0 0 10px 0', textAlign: 'center', letterSpacing: '0.5px' }}>
                      Welcome to SSS Hubballi Junction.
                    </p>
                    <p style={{ fontSize: '0.88rem', color: '#475569', margin: '0 0 24px 0', lineHeight: '1.5', textAlign: 'center' }}>
                      Secure staff access for Drivers managing platform passenger transfers.
                    </p>

                    {/* Main Action Toggle */}
                    <div style={{
                      display: 'flex',
                      background: '#f1f5f9',
                      border: '1px solid #cbd5e1',
                      borderRadius: '99px',
                      padding: '3px',
                      marginBottom: '24px'
                    }}>
                      <button
                        type="button"
                        onClick={() => { setIsSignup(false); setStatus(""); }}
                        style={{
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
                        }}
                      >
                        Login
                      </button>
                      <button
                        type="button"
                        onClick={() => { setIsSignup(true); setStatus(""); }}
                        style={{
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
                        }}
                      >
                        Sign up
                      </button>
                    </div>

                    {/* Form */}
                    <form onSubmit={isSignup ? handleSignup : handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                      {isSignup && (
                        <>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                            <label style={{ fontSize: '0.85rem', fontWeight: '600', color: '#334155' }}>Full Name</label>
                            <input
                              type="text"
                              value={authName}
                              onChange={(e) => setAuthName(e.target.value)}
                              placeholder="Enter your Full Name"
                              required
                              style={{
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
                              }}
                            />
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                            <label style={{ fontSize: '0.85rem', fontWeight: '600', color: '#334155' }}>Aadhar Card Image (JPG)</label>
                            <input
                              type="file"
                              accept="image/jpeg, image/jpg"
                              onChange={handleAadharUpload}
                              required={!aadharNumber}
                              style={{
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
                              }}
                            />
                          </div>
                          {aadharNumber && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                              <label style={{ fontSize: '0.85rem', fontWeight: '600', color: '#334155' }}>Extracted Aadhar Number</label>
                              <input
                                type="text"
                                value={aadharNumber}
                                onChange={(e) => setAadharNumber(e.target.value)}
                                placeholder="1234 5678 9012"
                                required
                                style={{
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
                                }}
                              />
                            </div>
                          )}
                        </>
                      )}

                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        <label style={{ fontSize: '0.85rem', fontWeight: '600', color: '#334155' }}>Driver Email</label>
                        <input
                          type="email"
                          value={authEmail}
                          onChange={(e) => setAuthEmail(e.target.value)}
                          placeholder="driver@ridereserve.com"
                          required
                          style={{
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
                          }}
                        />
                      </div>

                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        <label style={{ fontSize: '0.85rem', fontWeight: '600', color: '#334155' }}>Password</label>
                        <input
                          type="password"
                          value={authPassword}
                          onChange={(e) => setAuthPassword(e.target.value)}
                          placeholder="******"
                          required
                          style={{
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
                          }}
                        />
                      </div>

                      <button
                        type="submit"
                        disabled={authBusy}
                        style={{
                          width: '100%',
                          padding: '14px 0',
                          borderRadius: '8px',
                          border: 'none',
                          background: '#1d4ed8',
                          color: '#ffffff',
                          fontWeight: 'bold',
                          fontSize: '1rem',
                          cursor: 'pointer',
                          boxShadow: '0 4px 12px rgba(29, 78, 216, 0.2)',
                          transition: 'all 0.2s',
                          marginTop: '8px',
                          fontFamily: "'Inter', sans-serif"
                        }}
                        onMouseOver={(e) => { e.currentTarget.style.transform = 'translateY(-1px)'; }}
                        onMouseOut={(e) => { e.currentTarget.style.transform = 'none'; }}
                      >
                        {authBusy
                          ? (isSignup ? 'Creating account...' : 'Authenticating...')
                          : (isSignup ? 'Create Driver Account' : 'Login as Driver')
                        }
                      </button>

                      {status && (
                        <p style={{
                          textAlign: 'center',
                          color: status.includes('successful') || status.includes('created') ? '#16a34a' : '#dc2626',
                          fontWeight: 'bold',
                          margin: '8px 0 0 0',
                          fontSize: '0.85rem'
                        }}>
                          {status}
                        </p>
                      )}
                    </form>

                    {/* Informative Alert Box */}
                    <div style={{
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
                    }}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, color: '#64748b', marginTop: '2px' }}>
                        <circle cx="12" cy="12" r="10" />
                        <line x1="12" y1="16" x2="12" y2="12" />
                        <line x1="12" y1="8" x2="12.01" y2="8" />
                      </svg>
                      <span>Driver accounts handle ride status updates and BOV operations.</span>
                    </div>

                    {/* Back Link */}
                    <div style={{ textAlign: 'center', marginTop: '24px', paddingTop: '16px', borderTop: '1px solid #e2e8f0' }}>
                      <a
                        href="http://localhost:5173"
                        style={{
                          color: '#64748b',
                          fontSize: '0.88rem',
                          fontWeight: '600',
                          textDecoration: 'underline',
                          padding: 0
                        }}
                      >
                        Back to Passenger Booking
                      </a>
                    </div>
                  </>
                )}
              </div>
            </div>
          </section>
        </main>
      </div>
    );
  }


  return (
    <div className="page" style={{ maxWidth: '1100px', margin: '0 auto', padding: '24px 18px 50px', fontFamily: "'Inter', sans-serif" }}>
      {/* Cinematic Photographic Header with tighter, technical corner rounding */}
      <header style={{
        position: 'relative',
        backgroundImage: 'linear-gradient(rgba(15, 23, 42, 0.75), rgba(15, 23, 42, 0.75)), url(/bg_train_new.jpg)',
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        borderRadius: '12px',
        padding: '32px 28px',
        color: '#ffffff',
        boxShadow: '0 10px 30px rgba(15, 23, 42, 0.15)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '20px'
      }}>
        <div style={{ zIndex: 10 }}>
          <p style={{ margin: 0, textTransform: 'uppercase', letterSpacing: '2px', fontSize: '0.72rem', fontWeight: '800', color: '#60a5fa' }}>
            Hubballi BOV Transit
          </p>
          <h1 style={{ margin: '4px 0 2px 0', fontSize: '1.85rem', fontWeight: '800', fontFamily: "'Inter', sans-serif", letterSpacing: '-0.5px' }}>
            Driver Command Center
          </h1>
          <p style={{ margin: 0, fontSize: '0.85rem', color: '#94a3b8', fontWeight: '500' }}>
            SSS Hubballi Junction • Live Operations
          </p>
        </div>

        {/* Premium Direct User Panel with Interactive Dropdown (Strictly Emoji-free) */}
        <div 
          id="profile-menu-container" 
          style={{ 
            position: 'relative', 
            display: 'flex', 
            alignItems: 'center', 
            zIndex: 100 
          }}
        >
          <button
            onClick={(e) => {
              e.stopPropagation();
              setShowProfileMenu(prev => !prev);
            }}
            style={{
              width: '44px',
              height: '44px',
              borderRadius: '50%',
              background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.15), rgba(255, 255, 255, 0.08))',
              color: '#ffffff',
              border: '1px solid rgba(255, 255, 255, 0.25)',
              fontSize: '0.95rem',
              fontWeight: '800',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontFamily: "'Inter', sans-serif",
              boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)',
              transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
              outline: 'none',
              userSelect: 'none',
              backdropFilter: 'blur(8px)'
            }}
            onMouseOver={(e) => {
              e.currentTarget.style.transform = 'scale(1.05)';
              e.currentTarget.style.borderColor = '#ffffff';
              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.25)';
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.transform = 'none';
              e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.25)';
              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.15)';
            }}
          >
            {driverInitials}
          </button>

          {showProfileMenu && (
            <div
              style={{
                position: 'absolute',
                top: '100%',
                right: 0,
                marginTop: '12px',
                width: '290px',
                background: '#ffffff',
                borderRadius: '16px',
                border: '1px solid rgba(0, 0, 0, 0.08)',
                boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04), 0 0 1px 1px rgba(0, 0, 0, 0.02)',
                padding: '20px',
                zIndex: 1000,
                display: 'flex',
                flexDirection: 'column',
                gap: '16px',
                color: '#0f172a',
                fontFamily: "'Inter', sans-serif"
              }}
            >
              {/* User Info block */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                <div
                  style={{
                    width: '48px',
                    height: '48px',
                    borderRadius: '50%',
                    background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.1), rgba(29, 78, 216, 0.15))',
                    color: '#1d4ed8',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '1.1rem',
                    fontWeight: '800',
                    fontFamily: "'Inter', sans-serif",
                    border: '1px solid rgba(29, 78, 216, 0.1)'
                  }}
                >
                  {driverInitials}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                  <span 
                    style={{ 
                      fontSize: '0.95rem', 
                      fontWeight: '700', 
                      color: '#0f172a',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis'
                    }}
                  >
                    {user?.name || "Driver"}
                  </span>
                  <span 
                    style={{ 
                      fontSize: '0.78rem', 
                      color: '#64748b',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis'
                    }}
                  >
                    {user?.email || "No Email"}
                  </span>
                </div>
              </div>

              {/* Verified Pill */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  background: '#f0fdf4',
                  border: '1px solid #bbf7d0',
                  borderRadius: '8px',
                  padding: '6px 10px',
                  color: '#16a34a',
                  fontSize: '0.78rem',
                  fontWeight: '600'
                }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12"/>
                </svg>
                <span>Active Duty</span>
              </div>

              <div style={{ height: '1px', background: '#e2e8f0' }} />

              {/* BOV Assignment Info Card */}
              <div style={{
                background: '#f8fafc',
                border: '1px solid #e2e8f0',
                borderRadius: '10px',
                padding: '12px',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px'
              }}>
                <span style={{ fontSize: '0.72rem', fontWeight: '700', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  Assigned Vehicle
                </span>
                {driverBov ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '0.8rem', color: '#334155' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ fontWeight: '600' }}>{driverBov.vehicleNumber}</span>
                      <span style={{ 
                        fontSize: '0.7rem', 
                        fontWeight: '700', 
                        color: driverBov.status === 'active' ? '#16a34a' : '#b45309',
                        textTransform: 'uppercase'
                      }}>
                        {driverBov.status}
                      </span>
                    </div>
                    <div style={{ fontSize: '0.72rem', color: '#64748b' }}>
                      Capacity: {driverBov.totalSeats} Seats
                    </div>
                  </div>
                ) : (
                  <span style={{ fontSize: '0.78rem', color: '#b45309', fontWeight: '600' }}>
                    Pending Vehicle Assignment
                  </span>
                )}
              </div>

              {/* Shift Stats Card */}
              <div style={{
                background: '#f8fafc',
                border: '1px solid #e2e8f0',
                borderRadius: '10px',
                padding: '12px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
              }}>
                <span style={{ fontSize: '0.78rem', fontWeight: '600', color: '#334155' }}>
                  Shift Progress
                </span>
                <span style={{ fontSize: '0.82rem', fontWeight: '800', color: '#1d4ed8', background: '#eff6ff', border: '1px solid #bfdbfe', padding: '3px 8px', borderRadius: '6px' }}>
                  {rides.filter((r: any) => r.acceptedBy === user?.uid && r.rideStatus === 'completed').length} Rides
                </span>
              </div>

              <div style={{ height: '1px', background: '#e2e8f0' }} />

              {/* Sign out button */}
              <button
                onClick={async () => {
                  setShowProfileMenu(false);
                  handleLogout();
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: '100%',
                  padding: '12px',
                  borderRadius: '10px',
                  border: '1px solid rgba(239, 68, 68, 0.2)',
                  background: 'rgba(239, 68, 68, 0.06)',
                  color: '#dc2626',
                  fontSize: '0.88rem',
                  fontWeight: '700',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                  fontFamily: "'Inter', sans-serif"
                }}
                onMouseOver={(e) => {
                  e.currentTarget.style.background = 'rgba(239, 68, 68, 0.12)';
                  e.currentTarget.style.borderColor = 'rgba(239, 68, 68, 0.35)';
                }}
                onMouseOut={(e) => {
                  e.currentTarget.style.background = 'rgba(239, 68, 68, 0.06)';
                  e.currentTarget.style.borderColor = 'rgba(239, 68, 68, 0.2)';
                }}
              >
                Sign Out
              </button>
            </div>
          )}
        </div>
      </header>

      {/* Quick Stats Metric Cards with technical label-style curves */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '20px', marginTop: '24px' }}>
        <article style={{
          background: '#ffffff',
          borderRadius: '12px',
          padding: '20px 24px',
          border: '1px solid #e2e8f0',
          boxShadow: '0 4px 12px rgba(15, 23, 42, 0.03)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          transition: 'all 0.25s'
        }}>
          <div>
            <p style={{ margin: 0, fontSize: '0.8rem', color: '#64748b', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.5px', fontFamily: "'Inter', sans-serif" }}>
              Active Rides
            </p>
            <h2 style={{ margin: '4px 0 0 0', fontSize: '1.9rem', color: '#0f172a', fontWeight: '800', fontFamily: "'Inter', sans-serif", textShadow: '0 2px 4px rgba(15, 23, 42, 0.08)' }}>
              {sortedRides.filter((r: any) => r.acceptedBy === user.uid && r.rideStatus !== 'completed' && r.rideStatus !== 'cancelled').length}
            </h2>
          </div>
          <div style={{ background: '#eff6ff', borderRadius: '8px', width: '40px', height: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#1d4ed8" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
          </div>
        </article>

        <article style={{
          background: '#ffffff',
          borderRadius: '12px',
          padding: '20px 24px',
          border: '1px solid #e2e8f0',
          boxShadow: '0 4px 12px rgba(15, 23, 42, 0.03)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          transition: 'all 0.25s'
        }}>
          <div>
            <p style={{ margin: 0, fontSize: '0.8rem', color: '#64748b', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.5px', fontFamily: "'Inter', sans-serif" }}>
              Pending Requests
            </p>
            <h2 style={{ margin: '4px 0 0 0', fontSize: '1.9rem', color: '#0f172a', fontWeight: '800', fontFamily: "'Inter', sans-serif", textShadow: '0 2px 4px rgba(15, 23, 42, 0.08)' }}>
              {sortedRides.filter((r: any) => r.rideStatus === "pending").length}
            </h2>
          </div>
          <div style={{ background: '#fffbeb', borderRadius: '8px', width: '40px', height: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#d97706" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="16" y1="13" x2="8" y2="13" />
              <line x1="16" y1="17" x2="8" y2="17" />
              <polyline points="10 9 9 9 8 9" />
            </svg>
          </div>
        </article>
      </div>

      {/* Ride Queue Job Cards Section */}
      <section style={{ marginTop: '32px' }}>
        <h2 style={{ fontSize: '1.15rem', fontWeight: '800', color: '#0f172a', margin: '0 0 16px 0', display: 'flex', alignItems: 'center', gap: '8px' }}>
          Operations Queue
          <span style={{ fontSize: '0.8rem', fontWeight: '700', background: '#e2e8f0', color: '#475569', padding: '2px 6px', borderRadius: '4px' }}>
            {sortedRides.length} Total
          </span>
        </h2>

        {ridesError && <p className="status error" style={{ color: '#ff4d4f', background: '#fef2f2', border: '1px solid #fca5a5', padding: '12px', borderRadius: '12px' }}>Error loading rides: {ridesError}</p>}

        {ridesLoading ? (
          <p style={{ color: '#64748b', fontSize: '0.9rem' }}>Loading operations...</p>
        ) : sortedRides.length === 0 ? (
          <div style={{ background: '#ffffff', borderRadius: '12px', padding: '40px', border: '1px solid #e2e8f0', textAlign: 'center', color: '#64748b' }}>
            No operations in the queue.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {sortedRides.map((r: any) => {
              const isMine = r.acceptedBy === user.uid;
              const isPending = r.rideStatus === "pending";
              const isConfirmed = r.rideStatus === "confirmed";
              const isInProgress = r.rideStatus === "in-progress";
              const isCompleted = r.rideStatus === "completed" || r.rideStatus === "cancelled";

              return (
                <article
                  key={r.bookingId}
                  style={{
                    background: isCompleted ? '#f8fafc' : '#ffffff',
                    opacity: isCompleted ? 0.65 : 1,
                    borderRadius: '12px',
                    padding: '20px 24px',
                    border: '1.5px solid ' + (isCompleted ? '#e2e8f0' : isMine ? '#bfdbfe' : '#e2e8f0'),
                    boxShadow: isCompleted ? 'none' : isMine ? '0 6px 15px -3px rgba(29, 78, 216, 0.04)' : '0 4px 12px -3px rgba(15, 23, 42, 0.03)',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    gap: '20px',
                    transition: 'all 0.15s ease',
                    position: 'relative',
                    overflow: 'hidden'
                  }}
                >
                  {/* Left accent color indicator for pending priority requests (muted orange/amber highlight) */}
                  {r.isPriorityPassenger && !isCompleted && (
                    <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: '4px', background: 'linear-gradient(to bottom, #f59e0b, #d97706)' }} />
                  )}

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', flex: 1, minWidth: '280px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                      <span style={{ fontSize: '0.8rem', fontWeight: '700', color: '#64748b', background: '#f1f5f9', padding: '3px 8px', borderRadius: '6px' }}>
                        ID: {formatBookingId(r.bookingId)}
                      </span>

                      {r.isPriorityPassenger && (
                        <span className="priority-badge" style={{
                          background: '#fffbeb',
                          color: '#b45309',
                          border: '1px solid #fde68a',
                          padding: '2px 8px',
                          borderRadius: '6px',
                          fontSize: '0.7rem',
                          fontWeight: '700',
                          display: 'inline-flex',
                          alignItems: 'center'
                        }}>
                          PRIORITY
                        </span>
                      )}

                      {r.isSharedRide && (
                        <span className="shared-badge" style={{
                          background: '#f0f9ff',
                          color: '#0369a1',
                          border: '1px solid #bae6fd',
                          padding: '2px 8px',
                          borderRadius: '6px',
                          fontSize: '0.7rem',
                          fontWeight: '700',
                          display: 'inline-flex',
                          alignItems: 'center'
                        }}>
                          SHARED
                        </span>
                      )}

                      <span style={{
                        padding: '2px 8px',
                        borderRadius: '6px',
                        border: '1px solid ' + (isPending ? '#fde68a' : isConfirmed ? '#bfdbfe' : isInProgress ? '#bae6fd' : '#e2e8f0'),
                        fontSize: '0.7rem',
                        fontWeight: '700',
                        textTransform: 'uppercase',
                        background: isPending ? '#fffbeb' : isConfirmed ? '#eff6ff' : isInProgress ? '#f0f9ff' : '#f1f5f9',
                        color: isPending ? '#d97706' : isConfirmed ? '#1e40af' : isInProgress ? '#0369a1' : '#64748b'
                      }}>
                        {r.rideStatus}
                      </span>
                    </div>

                    {/* Route is the largest, most prominent text on each card */}
                    <h3 style={{ margin: '6px 0 0 0', fontSize: '1.25rem', fontWeight: '800', color: isCompleted ? '#64748b' : '#0f172a', letterSpacing: '-0.3px', fontFamily: "'Inter', sans-serif" }}>
                      {r.fromPlatform} → {r.toPlatform}
                    </h3>

                    {/* Passenger details below route */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '0.85rem', color: isCompleted ? '#94a3b8' : '#475569', marginTop: '2px', flexWrap: 'wrap', fontFamily: "'Inter', sans-serif" }}>
                      <span>Passenger: <strong style={{ color: isCompleted ? '#64748b' : '#0f172a' }}>{r.passengerName}</strong></span>
                      <span style={{ width: '4px', height: '4px', background: '#cbd5e1', borderRadius: '50%' }}></span>
                      <span>Seats: <strong style={{ color: isCompleted ? '#64748b' : '#0f172a' }}>{r.seats} Seat(s)</strong></span>
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: '180px', justifyContent: 'flex-end' }}>
                    {isPending ? (
                      <button
                        onClick={() => acceptRide(r.bookingId)}
                        style={{
                          background: 'transparent',
                          border: '1.5px solid #1d4ed8',
                          color: '#1d4ed8',
                          padding: '10px 20px',
                          borderRadius: '8px',
                          fontWeight: '700',
                          fontSize: '0.88rem',
                          cursor: 'pointer',
                          transition: 'all 0.15s',
                          width: '100%',
                          fontFamily: "'Inter', sans-serif"
                        }}
                        onMouseOver={(e) => {
                          e.currentTarget.style.background = '#eff6ff';
                        }}
                        onMouseOut={(e) => {
                          e.currentTarget.style.background = 'transparent';
                        }}
                      >
                        Accept
                      </button>
                    ) : isConfirmed ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', width: '100%' }}>
                        <input
                          type="text"
                          maxLength={4}
                          placeholder="Enter PIN"
                          value={pins[r.bookingId] || ""}
                          onChange={(e) => setPins(prev => ({ ...prev, [r.bookingId]: e.target.value.replace(/[^0-9]/g, '') }))}
                          style={{
                            width: '90px',
                            padding: '10px 8px',
                            border: '1.5px solid #cbd5e1',
                            borderRadius: '8px',
                            fontSize: '0.9rem',
                            fontWeight: 'bold',
                            textAlign: 'center',
                            outline: 'none',
                            fontFamily: 'monospace',
                            boxSizing: 'border-box'
                          }}
                        />
                        <button
                          onClick={() => startRideWithPin(r.bookingId, pins[r.bookingId] || "")}
                          style={{
                            background: 'linear-gradient(135deg, #16a34a, #15803d)',
                            border: 'none',
                            color: '#ffffff',
                            padding: '12px 20px',
                            borderRadius: '8px',
                            fontWeight: '700',
                            fontSize: '0.92rem',
                            cursor: 'pointer',
                            boxShadow: '0 4px 12px rgba(22, 163, 74, 0.2)',
                            transition: 'all 0.15s',
                            flex: 1,
                            fontFamily: "'Inter', sans-serif"
                          }}
                          onMouseOver={(e) => {
                            e.currentTarget.style.transform = 'translateY(-1px)';
                          }}
                          onMouseOut={(e) => {
                            e.currentTarget.style.transform = 'none';
                          }}
                        >
                          Start
                        </button>
                      </div>
                    ) : isInProgress ? (
                      <button
                        onClick={() => updateStatus(r.bookingId, "completed")}
                        style={{
                          background: '#1d4ed8',
                          border: 'none',
                          color: '#ffffff',
                          padding: '14px 28px',
                          borderRadius: '8px',
                          fontWeight: '700',
                          fontSize: '0.95rem',
                          cursor: 'pointer',
                          boxShadow: '0 4px 12px rgba(29, 78, 216, 0.2)',
                          transition: 'all 0.15s',
                          width: '100%',
                          fontFamily: "'Inter', sans-serif"
                        }}
                        onMouseOver={(e) => {
                          e.currentTarget.style.transform = 'translateY(-1px)';
                        }}
                        onMouseOut={(e) => {
                          e.currentTarget.style.transform = 'none';
                        }}
                      >
                        Complete Ride
                      </button>
                    ) : null}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {status && (
        <p style={{
          marginTop: '20px',
          padding: '12px 16px',
          borderRadius: '8px',
          background: status.includes('Error') ? '#fef2f2' : '#f0fdf4',
          border: '1px solid ' + (status.includes('Error') ? '#fca5a5' : '#bbf7d0'),
          color: status.includes('Error') ? '#b91c1c' : '#166534',
          fontWeight: 'bold',
          fontSize: '0.88rem',
          textAlign: 'center',
          fontFamily: "'Inter', sans-serif"
        }}>
          {stripEmojis(status)}
        </p>
      )}
    </div>
  );
}
