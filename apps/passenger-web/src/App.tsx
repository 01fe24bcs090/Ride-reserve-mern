import { FormEvent, useEffect, useState, useRef } from "react";
import {
  lookupTrain,
} from "./lib/api";
import { JourneyType, UserRole, TrainDoc as TrainInfo } from "@ride-reserve/types";
import api from "./api/client";

type AuthMode = "login" | "signup";

interface BookingResult {
  bookingId: string;
  vehicleNumber: string;
  seatNumbers: number[];
  fare: number;
  scheduledTime: string;
}

const roleOptions: Array<{
  value: UserRole;
  label: string;
  description: string;
  helper: string;
}> = [
    {
      value: "passenger",
      label: "Passenger",
      description: "Book platform transfer rides, check fare estimates, and view your ride history from one account.",
      helper: "Passenger services",
    }
  ];

const roleHighlights: Partial<Record<UserRole, string[]>> = {
  passenger: ["Platform-to-platform booking", "Instant fare estimate", "Live booking history"]
};

import { useAuth } from "./hooks/useAuth";
import { useBookings } from "./hooks/useBookings";
import { pickupPoints, platformOptions } from "./lib/mockData";
import { io } from "socket.io-client";

export default function App() {
  const {
    passengerProfile,
    sessionReady,
    authResolved,
    busy: authBusy,
    status: authStatus,
    setStatus: setAuthStatus,
    login,
    signup,
    logout
  } = useAuth();

  const {
    bookingHistory,
    status: bookingStatus,
    setStatus: setBookingStatus,
    busy: bookingBusy,
    confirmBooking,
    lookupTrain,
    getFareEstimate
  } = useBookings(passengerProfile?.uid);

  const getInitials = () => {
    const name = passengerProfile?.name;
    if (!name) return "P";
    const parts = name.trim().split(/\s+/);
    const first = parts[0];
    const last = parts[parts.length - 1];
    if (first && last && parts.length >= 2) {
      return (first.charAt(0) + last.charAt(0)).toUpperCase();
    }
    return first ? first.slice(0, 2).toUpperCase() : "P";
  };
  const initials = getInitials();

  const [profile, setProfile] = useState({ name: "", phone: "", email: "", age: "" });
  const [selectedRole, setSelectedRole] = useState<UserRole>("passenger");
  const [authMode, setAuthMode] = useState<AuthMode>("login");
  const [authSecret, setAuthSecret] = useState("");
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [showHistoryInDropdown, setShowHistoryInDropdown] = useState(false);

  const [showOtpScreen, setShowOtpScreen] = useState(false);
  const [verifyingEmail, setVerifyingEmail] = useState("");
  const [otpValue, setOtpValue] = useState("");
  const [otpStatus, setOtpStatus] = useState("");
  const [countdown, setCountdown] = useState(0);

  // Close profile menu when clicking outside
  useEffect(() => {
    if (!showProfileMenu) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('#profile-menu-container')) {
        setShowProfileMenu(false);
        setShowHistoryInDropdown(false);
      }
    };
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, [showProfileMenu]);

  useEffect(() => {
    if (countdown <= 0) return;
    const timer = setTimeout(() => {
      setCountdown(prev => prev - 1);
    }, 1000);
    return () => clearTimeout(timer);
  }, [countdown]);

  const [passengerCount, setPassengerCount] = useState(1);
  const [isPriorityPassenger, setIsPriorityPassenger] = useState(false);
  const [journeyType, setJourneyType] = useState<JourneyType>("arrival");
  const [trainNumber, setTrainNumber] = useState("");
  const [toPlatform, setToPlatform] = useState("");
  const [pickupPoint, setPickupPoint] = useState("");
  const [lightLuggageCount, setLightLuggageCount] = useState(0);
  const [heavyLuggageCount, setHeavyLuggageCount] = useState(0);
  const [luggageWeight, setLuggageWeight] = useState<number>(0);
  const [passengerAges, setPassengerAges] = useState<string[]>([""]);
  const [fromPlatform, setFromPlatform] = useState("");
  const [seats, setSeats] = useState(1);

  const [train, setTrain] = useState<TrainInfo | null>(null);
  const [fare, setFare] = useState<number | null>(null);
  const [isPeakHour, setIsPeakHour] = useState(false);
  const [booking, setBooking] = useState<BookingResult | null>(null);

  const [bookingMode, setBookingMode] = useState<"auto" | "manual">("auto");
  const [passengerSocket, setPassengerSocket] = useState<any>(null);

  const busy = authBusy || bookingBusy;
  const status = authStatus || bookingStatus;
  const setStatus = (msg: string) => {
    if (authBusy) setAuthStatus(msg);
    else setBookingStatus(msg);
  };

  const selectedRoleOption = roleOptions.find((role) => role.value === selectedRole)!;
  const isPassengerRole = selectedRole === "passenger";
  
  const isLocal = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
  const driverPortalUrl = import.meta.env.VITE_DRIVER_URL || (isLocal ? "http://localhost:5174" : "https://ride-reserve-driver.web.app");
  const adminPortalUrl = import.meta.env.VITE_ADMIN_URL || (isLocal ? "http://localhost:5175" : "https://ride-reserve-admin.web.app");
  // Removed derived fromPlatform, using state instead

  const [activeLocations, setActiveLocations] = useState<Record<string, string>>({});
  const [holdProgress, setHoldProgress] = useState<Record<string, number>>({});
  const holdIntervals = useRef<Record<string, any>>({});

  const hasActiveBooking = bookingHistory.some(
    (b) => b.rideStatus === "pending" || b.rideStatus === "confirmed" || b.rideStatus === "in-progress"
  );
  const activeBookings = bookingHistory.filter(
    (b) => b.rideStatus === "pending" || b.rideStatus === "confirmed" || b.rideStatus === "in-progress"
  );
  const pastBookings = bookingHistory.filter(
    (b) => b.rideStatus === "completed" || b.rideStatus === "cancelled"
  );

  useEffect(() => {
    if (!isPassengerRole && authMode === "signup") {
      setAuthMode("login");
    }
  }, [authMode, isPassengerRole]);

  useEffect(() => {
    if (!passengerProfile?.uid) return;

    const socketUrl = import.meta.env.VITE_API_URL ? import.meta.env.VITE_API_URL.replace("/api", "") : "http://localhost:5000";
    const socket = io(socketUrl);
    setPassengerSocket(socket);

    // Join room for this passenger
    socket.emit("join_room", passengerProfile.uid);

    // Dynamically listen for location updates on all active bookings
    const activeBookings = bookingHistory.filter(b => b.rideStatus === "in-progress" || b.rideStatus === "confirmed");
    activeBookings.forEach((b) => {
      socket.on(`booking_location_update_${b.bookingId}`, ({ platform }) => {
        setActiveLocations(prev => ({
          ...prev,
          [b.bookingId]: platform
        }));
      });
    });

    // Listen for train delay alerts
    socket.on("train_delay_update", ({ trainNumber, delayMinutes, rescheduledCount }) => {
      setBookingStatus(`Alert: Train T-${trainNumber} is delayed by ${delayMinutes} minutes! Rescheduled ${rescheduledCount} ride(s).`);
      // Auto clear after 12s
      setTimeout(() => setBookingStatus(""), 12000);
    });

    return () => {
      socket.disconnect();
    };
  }, [passengerProfile, bookingHistory]);

  const startSosHold = (bookingId: string, currentPlatform: string) => {
    if (holdIntervals.current[bookingId]) {
      clearInterval(holdIntervals.current[bookingId]);
    }
    
    setHoldProgress(prev => ({ ...prev, [bookingId]: 0 }));
    
    let currentProgress = 0;
    holdIntervals.current[bookingId] = setInterval(() => {
      currentProgress += 1;
      setHoldProgress(prev => ({ ...prev, [bookingId]: currentProgress }));
      
      if (currentProgress >= 100) {
        clearInterval(holdIntervals.current[bookingId]);
        delete holdIntervals.current[bookingId];
        setHoldProgress(prev => {
          const next = { ...prev };
          delete next[bookingId];
          return next;
        });
        
        if (passengerSocket) {
          passengerSocket.emit("emergency_sos", {
            bookingId,
            passengerName: passengerProfile?.name || "Passenger",
            currentPlatform: currentPlatform || "Platform 1",
            role: "passenger"
          });
          setBookingStatus("SOS emergency successfully broadcasted to Station Admin!");
        }
      }
    }, 30);
  };

  const cancelSosHold = (bookingId: string) => {
    if (holdIntervals.current[bookingId]) {
      clearInterval(holdIntervals.current[bookingId]);
      delete holdIntervals.current[bookingId];
    }
    setHoldProgress(prev => {
      const next = { ...prev };
      delete next[bookingId];
      return next;
    });
  };


  async function onTrainLookup() {
    if (!trainNumber.trim()) {
      setStatus("Enter train number first.");
      return;
    }
    setBookingStatus("Looking up train details...");
    try {
      const response = await lookupTrain(trainNumber.trim()) as unknown as TrainInfo;
      setTrain(response);
      if (journeyType === "departure") {
        setToPlatform(response.platformNumber);
        setFromPlatform("");
      } else {
        setFromPlatform(response.platformNumber);
        setToPlatform((prev) => (prev && prev !== response.platformNumber ? prev : ""));
      }
      setBookingStatus("Train details fetched.");
    } catch (error) {
      setTrain(null);
      setBookingStatus(error instanceof Error ? error.message : "Train lookup failed.");
    }
  }

  async function onFareEstimate() {
    if (!trainNumber.trim()) {
      setStatus("Enter train number before fare estimate.");
      return;
    }
    setBookingStatus("Calculating fare...");
    try {
      const response = await getFareEstimate(trainNumber.trim(), journeyType);
      let calculatedFare = response.fare;
      if (luggageWeight > 10) {
        calculatedFare += 10;
      }
      setFare(calculatedFare);
      setIsPeakHour(Boolean(response.isPeakHour));
      if (bookingMode === "auto" && journeyType === "departure" && train) {
        setToPlatform(train.platformNumber);
      }
      setBookingStatus("Fare estimate ready.");
    } catch (error) {
      setBookingStatus(error instanceof Error ? error.message : "Fare estimate failed.");
    }
  }

  async function onConfirmBooking() {
    if (hasActiveBooking) {
      setStatus("You already have a pending or active booking. Please complete or cancel it first.");
      return;
    }
    if (!trainNumber.trim()) {
      setStatus("Train number is required.");
      return;
    }
    if (bookingMode === "auto" && !train) {
      setStatus("Please fetch train details first.");
      return;
    }
    if (!toPlatform.trim()) {
      setStatus("Select platform first.");
      return;
    }
    if (journeyType === "arrival" && toPlatform === fromPlatform) {
      setStatus("Destination platform must be different from source platform.");
      return;
    }
    if (journeyType === "departure" && !pickupPoint.trim()) {
      setStatus("Pickup point is required for departure flow.");
      return;
    }

    try {
      const result = await confirmBooking({
        trainNumber: trainNumber.trim(),
        fromPlatform: journeyType === 'arrival' ? (fromPlatform || (train ? train.platformNumber : "")) : pickupPoint,
        toPlatform: toPlatform.trim(),
        seats,
        passengerCount,
        journeyType,
        pickupPoint: pickupPoint.trim() || undefined,
        lightLuggageCount,
        heavyLuggageCount,
        luggageWeight,
        isPriorityPassenger,
        passengerAges: passengerAges.map(a => Number(a) || 0),
      });
      setBooking({
        bookingId: result.bookingId,
        vehicleNumber: "Allocating...",
        seatNumbers: [],
        fare: fare || 0,
        scheduledTime: new Date().toISOString()
      });
    } catch (error) {
      // Status is handled by hook
    }
  }

  const normalizePhone = (val: string) => {
    let digits = val.replace(/[^0-9]/g, "");
    if (digits.startsWith("0") && digits.length > 10) {
      digits = digits.slice(1);
    }
    if (digits.startsWith("91") && digits.length > 10) {
      digits = digits.slice(2);
    }
    return digits.slice(0, 10);
  };

  async function startSession(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!isPassengerRole) {
      const isLocal = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
      const targetUrl = selectedRole === 'driver'
        ? (import.meta.env.VITE_DRIVER_URL || (isLocal ? "http://localhost:5174" : "https://ride-reserve-driver.web.app"))
        : (import.meta.env.VITE_ADMIN_URL || (isLocal ? "http://localhost:5175" : "https://ride-reserve-admin.web.app"));

      if (targetUrl) {
        setAuthStatus(`Redirecting to ${selectedRoleOption.label} portal...`);
        setTimeout(() => { window.location.href = targetUrl; }, 1000);
      }
      return;
    }

    let normalizedPhone = "";
    if (authMode === "signup") {
      if (!profile.name.trim()) {
        setAuthStatus("Full Name is required.");
        return;
      }
      normalizedPhone = normalizePhone(profile.phone);
      if (normalizedPhone.length !== 10) {
        setAuthStatus("Please enter a valid 10-digit phone number.");
        return;
      }
      if (!profile.age || isNaN(Number(profile.age)) || Number(profile.age) <= 0) {
        setAuthStatus("Please enter a valid age.");
        return;
      }
    }

    if (!profile.email.trim()) {
      setAuthStatus("Email is required.");
      return;
    }

    if (!authSecret.trim()) {
      setAuthStatus(authMode === "signup" ? "Set a password for signup." : "Enter your password.");
      return;
    }

    try {
      if (authMode === "signup") {
        const response = await signup({
          name: profile.name,
          email: profile.email,
          phone: normalizedPhone,
          age: Number(profile.age),
          password: authSecret,
        }) as any;
        if (response && response.message === "otp_sent") {
          setVerifyingEmail(profile.email);
          setShowOtpScreen(true);
        }
      } else {
        await login({ email: profile.email, password: authSecret });
      }
      setAuthSecret("");
    } catch (error: any) {
      const errResponse = error.response?.data;
      if (errResponse && errResponse.error === "email_not_verified") {
        setVerifyingEmail(errResponse.email || profile.email);
        setShowOtpScreen(true);
        setOtpStatus("Your email is not verified. A new 6-digit code has been sent!");
      }
    }
  }

  async function handleVerifyOtp(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (otpValue.length !== 6) {
      setOtpStatus("Please enter a valid 6-digit code.");
      return;
    }
    setAuthStatus("Checking verification code...");
    setOtpStatus("");
    try {
      const { data } = await api.post("/auth/verify-otp", {
        email: verifyingEmail,
        otp: otpValue
      });
      localStorage.setItem("token", data.token);
      window.location.reload();
    } catch (err: any) {
      const errMsg = err.response?.data?.error || err.message || "Invalid or expired code.";
      setOtpStatus(errMsg);
      setAuthStatus("");
    }
  }

  async function handleResendOtp() {
    setOtpStatus("");
    setAuthStatus("Resending code...");
    try {
      await api.post("/auth/resend-otp", { email: verifyingEmail });
      setOtpStatus("A new 6-digit verification code has been sent!");
      setAuthStatus("");
      setCountdown(60);
    } catch (err: any) {
      const errMsg = err.response?.data?.error || err.message || "Failed to resend code.";
      setOtpStatus(errMsg);
      setAuthStatus("");
    }
  }

  return (
    <div className={sessionReady ? "page" : "page-auth bg-background font-body-lg text-on-surface antialiased"}>
      {!sessionReady ? (
        <main>
          {/* Full Screen Centered Glassmorphism Section */}
          <section className="relative min-h-screen flex items-center justify-center overflow-hidden">
            {/* Background Image */}
            <div className="absolute inset-0 z-0">
              <img alt="Hubballi Junction Station" className="w-full h-full object-cover" src="/bg_train_new.jpg" />
            </div>

            <div className="relative z-10 w-full p-4 flex justify-center items-center">
              {/* Solid High-Contrast Passenger Card */}
              <div
                style={{
                  background: '#ffffff',
                  border: '1px solid #e2e8f0',
                  borderRadius: '24px',
                  boxShadow: '0 20px 50px rgba(15, 23, 42, 0.15)',
                  padding: '40px 36px',
                  width: '100%',
                  maxWidth: '460px',
                  color: '#0f172a',
                  fontFamily: "'Plus Jakarta Sans', sans-serif"
                }}
              >
                {showOtpScreen ? (
                  <>
                    <span style={{ fontSize: '0.72rem', fontWeight: 'bold', letterSpacing: '2px', textTransform: 'uppercase', color: '#ff7700', display: 'block', marginBottom: '6px' }}>
                      SECURITY CHECK
                    </span>
                    <h2 style={{ fontSize: '1.9rem', fontWeight: '800', color: '#0f172a', margin: '0 0 6px 0', letterSpacing: '-0.5px' }}>
                      Verify Email
                    </h2>
                    <p style={{ fontSize: '0.85rem', color: '#475569', margin: '0 0 24px 0', lineHeight: '1.4' }}>
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
                        disabled={busy}
                        style={{
                          width: '100%',
                          padding: '14px 0',
                          borderRadius: '12px',
                          border: 'none',
                          background: 'linear-gradient(135deg, #ff7700ff, #fe7200ff)',
                          color: '#ffffff',
                          fontWeight: 'bold',
                          fontSize: '1rem',
                          cursor: 'pointer',
                          boxShadow: '0 8px 24px -4px rgba(131, 79, 36, 0.4)',
                          transition: 'all 0.2s'
                        }}
                        onMouseOver={(e) => { e.currentTarget.style.transform = 'translateY(-1px)'; }}
                        onMouseOut={(e) => { e.currentTarget.style.transform = 'none'; }}
                      >
                        {busy ? 'Verifying Code...' : 'Verify & Continue'}
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
                        Back to Passenger Login
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    {/* Logo Placeholder */}
                    <div style={{ height: '56px', margin: '0 auto 16px auto' }} />

                    <h1 style={{ fontSize: '2.1rem', fontWeight: '800', color: '#0f172a', margin: '0 0 4px 0', letterSpacing: '-0.75px', textAlign: 'center', fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
                      Hubballi BOV Transit
                    </h1>
                    <p style={{ fontSize: '0.95rem', fontWeight: '700', color: '#ff7700', margin: '0 0 10px 0', textAlign: 'center', letterSpacing: '0.5px' }}>
                      Welcome to SSS Hubballi Junction.
                    </p>
                    <p style={{ fontSize: '0.88rem', color: '#475569', margin: '0 0 24px 0', lineHeight: '1.5', textAlign: 'center' }}>
                      Book Battery Operated Vehicles (BOVs) for easy, accessible transit across the platforms.
                    </p>

                    {/* Segmented Control Toggle */}
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
                        onClick={() => { setAuthMode('login'); setStatus(''); }}
                        style={{
                          flex: 1,
                          padding: '10px 0',
                          borderRadius: '99px',
                          border: 'none',
                          background: authMode === 'login' ? '#ffffff' : 'transparent',
                          color: authMode === 'login' ? '#0f172a' : '#64748b',
                          fontWeight: 'bold',
                          fontSize: '0.88rem',
                          cursor: 'pointer',
                          boxShadow: authMode === 'login' ? '0 2px 6px rgba(15, 23, 42, 0.08)' : 'none',
                          transition: 'all 0.2s'
                        }}
                      >
                        Login
                      </button>
                      <button
                        type="button"
                        onClick={() => { setAuthMode('signup'); setStatus(''); }}
                        style={{
                          flex: 1,
                          padding: '10px 0',
                          borderRadius: '99px',
                          border: 'none',
                          background: authMode === 'signup' ? '#ffffff' : 'transparent',
                          color: authMode === 'signup' ? '#0f172a' : '#64748b',
                          fontWeight: 'bold',
                          fontSize: '0.88rem',
                          cursor: 'pointer',
                          boxShadow: authMode === 'signup' ? '0 2px 6px rgba(15, 23, 42, 0.08)' : 'none',
                          transition: 'all 0.2s'
                        }}
                      >
                        Sign up
                      </button>
                    </div>

                    <form onSubmit={startSession} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                      {authMode === "signup" && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                          <label style={{ fontSize: '0.85rem', fontWeight: '600', color: '#334155' }}>Full Name</label>
                          <input
                            type="text"
                            placeholder="Full Name"
                            value={profile.name}
                            onChange={(event) => setProfile((prev) => ({ ...prev, name: event.target.value }))}
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
                              transition: 'all 0.2s'
                            }}
                          />
                        </div>
                      )}

                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        <label style={{ fontSize: '0.85rem', fontWeight: '600', color: '#334155' }}>Email</label>
                        <input
                          type="email"
                          placeholder="Enter your Email"
                          value={profile.email}
                          onChange={(event) => setProfile((prev) => ({ ...prev, email: event.target.value }))}
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
                            transition: 'all 0.2s'
                          }}
                        />
                      </div>

                      {authMode === "signup" && (
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                            <label style={{ fontSize: '0.85rem', fontWeight: '600', color: '#334155' }}>Phone Number</label>
                            <input
                              type="text"
                              maxLength={15}
                              placeholder="+91 98765 43210"
                              value={profile.phone}
                              onChange={(event) => {
                                const raw = event.target.value;
                                const val = raw.replace(/[^+0-9\s-]/g, "");
                                setProfile((prev) => ({ ...prev, phone: val }));
                              }}
                              onBlur={() => {
                                setProfile((prev) => ({ ...prev, phone: normalizePhone(prev.phone) }));
                              }}
                              required
                              style={{
                                width: '100%',
                                background: '#ffffff',
                                border: '1px solid #cbd5e1',
                                borderRadius: '12px',
                                padding: '12px 16px',
                                color: '#0f172a',
                                fontSize: '0.95rem',
                                outline: 'none'
                              }}
                            />
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                            <label style={{ fontSize: '0.85rem', fontWeight: '600', color: '#334155' }}>Age</label>
                            <input
                              type="text"
                              inputMode="numeric"
                              pattern="[0-9]*"
                              placeholder="Age"
                              value={profile.age}
                              onChange={(event) => {
                                const val = event.target.value.replace(/[^0-9]/g, "");
                                if (val === "" || (Number(val) >= 1 && Number(val) <= 120)) {
                                   setProfile((prev) => ({ ...prev, age: val }));
                                }
                              }}
                              required
                              style={{
                                width: '100%',
                                background: '#ffffff',
                                border: '1px solid #cbd5e1',
                                borderRadius: '12px',
                                padding: '12px 16px',
                                color: '#0f172a',
                                fontSize: '0.95rem',
                                outline: 'none'
                              }}
                            />
                          </div>
                        </div>
                      )}

                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        <label style={{ fontSize: '0.85rem', fontWeight: '600', color: '#334155' }}>Password</label>
                        <input
                          type="password"
                          placeholder="******"
                          value={authSecret}
                          onChange={(event) => setAuthSecret(event.target.value)}
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
                            transition: 'all 0.2s'
                          }}
                        />
                      </div>

                      <button
                        type="submit"
                        disabled={busy}
                        style={{
                          width: '100%',
                          padding: '14px 0',
                          borderRadius: '12px',
                          border: 'none',
                          background: '#ff7700',
                          color: '#ffffff',
                          fontWeight: 'bold',
                          fontSize: '1rem',
                          cursor: 'pointer',
                          boxShadow: '0 8px 24px -4px rgba(131, 79, 36, 0.4)',
                          transition: 'all 0.2s',
                          marginTop: '8px'
                        }}
                        onMouseOver={(e) => { e.currentTarget.style.transform = 'translateY(-1px)'; }}
                        onMouseOut={(e) => { e.currentTarget.style.transform = 'none'; }}
                      >
                        {busy
                          ? (authMode === 'login' ? 'Authenticating...' : 'Registering...')
                          : (authMode === 'login' ? 'Login as Passenger' : 'Register Account')
                        }
                      </button>
                      <p style={{ textAlign: 'center', color: '#dc2626', fontWeight: 'bold', margin: '8px 0 0 0', fontSize: '0.85rem' }}>
                        {status || "Signed out."}
                      </p>
                    </form>

                    <div style={{ textAlign: 'center', marginTop: '20px', fontSize: '0.82rem' }}>
                      <p style={{ color: '#475569', margin: '0 0 10px 0' }}>
                        {authMode === 'login' ? 'New passenger? Switch to Sign up first.' : 'Already registered? Switch to Login first.'}
                      </p>
                      
                      {/* Subtle Staff Portals Divider */}
                      <div style={{ display: 'flex', alignItems: 'center', margin: '24px 0 16px 0' }}>
                        <div style={{ flex: 1, height: '1px', background: '#e2e8f0' }}></div>
                        <span style={{ padding: '0 12px', color: '#64748b', fontSize: '0.75rem', fontWeight: 700, letterSpacing: '1.5px', textTransform: 'uppercase' }}>
                          STAFF PORTALS
                        </span>
                        <div style={{ flex: 1, height: '1px', background: '#e2e8f0' }}></div>
                      </div>

                      <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
                        <a
                          href={driverPortalUrl}
                          style={{
                            flex: 1,
                            padding: '10px 14px',
                            borderRadius: '12px',
                            background: 'rgba(230, 81, 0, 0.08)',
                            border: '1px solid rgba(230, 81, 0, 0.2)',
                            color: '#d84315',
                            textDecoration: 'none',
                            fontSize: '0.82rem',
                            fontWeight: 'bold',
                            textAlign: 'center',
                            transition: 'all 0.2s ease',
                            display: 'inline-block'
                          }}
                          onMouseOver={(e) => {
                            e.currentTarget.style.background = 'rgba(230, 81, 0, 0.14)';
                            e.currentTarget.style.borderColor = 'rgba(230, 81, 0, 0.35)';
                          }}
                          onMouseOut={(e) => {
                            e.currentTarget.style.background = 'rgba(230, 81, 0, 0.08)';
                            e.currentTarget.style.borderColor = 'rgba(230, 81, 0, 0.2)';
                          }}
                        >
                          Driver Portal
                        </a>
                        <a
                          href={adminPortalUrl}
                          style={{
                            flex: 1,
                            padding: '10px 14px',
                            borderRadius: '12px',
                            background: 'rgba(26, 58, 107, 0.06)',
                            border: '1px solid rgba(26, 58, 107, 0.15)',
                            color: '#1a3a6b',
                            textDecoration: 'none',
                            fontSize: '0.82rem',
                            fontWeight: 'bold',
                            textAlign: 'center',
                            transition: 'all 0.2s ease',
                            display: 'inline-block'
                          }}
                          onMouseOver={(e) => {
                            e.currentTarget.style.background = 'rgba(26, 58, 107, 0.12)';
                            e.currentTarget.style.borderColor = 'rgba(26, 58, 107, 0.25)';
                          }}
                          onMouseOut={(e) => {
                            e.currentTarget.style.background = 'rgba(26, 58, 107, 0.06)';
                            e.currentTarget.style.borderColor = 'rgba(26, 58, 107, 0.15)';
                          }}
                        >
                          Admin Portal
                        </a>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>
          </section>
        </main>
      ) : (
        <div className="page">
          {/* Cinematic Header & Clean Navigation */}
          <header 
            style={{
              position: 'relative',
              borderRadius: '24px',
              overflow: 'visible',
              padding: '40px 32px',
              marginBottom: '32px',
              boxShadow: '0 20px 40px rgba(15, 23, 42, 0.12)',
              backgroundImage: 'linear-gradient(to bottom, rgba(15, 23, 42, 0.4), rgba(15, 23, 42, 0.85)), url("/bg_train_new.jpg")',
              backgroundSize: 'cover',
              backgroundPosition: 'center',
              backgroundAttachment: 'local',
              color: '#ffffff',
              display: 'flex',
              flexDirection: 'column',
              gap: '24px',
              border: '1px solid rgba(255, 255, 255, 0.1)'
            }}
          >
            {/* Top Navbar */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', zIndex: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                {/* Header Logo Placeholder */}
                <div style={{ width: '32px', height: '32px' }} />
                <span style={{ fontSize: '1.35rem', fontWeight: '800', fontFamily: "'Plus Jakarta Sans', sans-serif", letterSpacing: '-0.5px' }}>
                  SmartBOV Booking
                </span>
              </div>
              
              {/* Premium Direct User Panel with Interactive Dropdown */}
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
                    background: 'linear-gradient(135deg, #3b82f6, #1d4ed8)',
                    color: '#ffffff',
                    border: '2px solid rgba(255, 255, 255, 0.3)',
                    fontSize: '0.95rem',
                    fontWeight: '800',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontFamily: "'Plus Jakarta Sans', sans-serif",
                    letterSpacing: '0.5px',
                    boxShadow: '0 4px 12px rgba(29, 78, 216, 0.25)',
                    transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                    outline: 'none',
                    userSelect: 'none'
                  }}
                  onMouseOver={(e) => {
                    e.currentTarget.style.transform = 'scale(1.05)';
                    e.currentTarget.style.borderColor = '#ffffff';
                    e.currentTarget.style.boxShadow = '0 6px 16px rgba(29, 78, 216, 0.4), 0 0 0 4px rgba(59, 130, 246, 0.2)';
                  }}
                  onMouseOut={(e) => {
                    e.currentTarget.style.transform = 'none';
                    e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.3)';
                    e.currentTarget.style.boxShadow = '0 4px 12px rgba(29, 78, 216, 0.25)';
                  }}
                >
                  {initials}
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
                          fontFamily: "'Plus Jakarta Sans', sans-serif",
                          border: '1px solid rgba(29, 78, 216, 0.1)'
                        }}
                      >
                        {initials}
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
                          {passengerProfile?.name || "Passenger"}
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
                          {passengerProfile?.email || "No Email"}
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
                      <span>Verified Passenger</span>
                    </div>

                    <div style={{ height: '1px', background: '#e2e8f0' }} />

                    {/* Collapsible History Menu Option */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <button
                        onClick={() => {
                          setShowHistoryInDropdown(prev => !prev);
                        }}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          width: '100%',
                          padding: '10px 12px',
                          borderRadius: '10px',
                          border: 'none',
                          background: showHistoryInDropdown ? '#f1f5f9' : 'transparent',
                          color: '#334155',
                          fontSize: '0.85rem',
                          fontWeight: '600',
                          cursor: 'pointer',
                          transition: 'all 0.15s ease',
                          userSelect: 'none'
                        }}
                        onMouseOver={(e) => {
                          if (!showHistoryInDropdown) {
                            e.currentTarget.style.background = '#f1f5f9';
                            e.currentTarget.style.color = '#0f172a';
                          }
                        }}
                        onMouseOut={(e) => {
                          if (!showHistoryInDropdown) {
                            e.currentTarget.style.background = 'transparent';
                            e.currentTarget.style.color = '#334155';
                          }
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: '#475569', flexShrink: 0 }}>
                            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                            <polyline points="14 2 14 8 20 8"/>
                            <line x1="16" y1="13" x2="8" y2="13"/>
                            <line x1="16" y1="17" x2="8" y2="17"/>
                            <polyline points="10 9 9 9 8 9"/>
                          </svg>
                          <span>Ride History</span>
                          <span style={{ fontSize: '0.75rem', color: '#64748b', background: '#e2e8f0', padding: '2px 6px', borderRadius: '4px', fontWeight: '700' }}>
                            {pastBookings.length}
                          </span>
                        </div>
                        <span style={{ fontSize: '0.75rem', transform: showHistoryInDropdown ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s ease' }}>
                          ▶
                        </span>
                      </button>

                      {/* Expandable History Content */}
                      {showHistoryInDropdown && (
                        <div 
                          style={{ 
                            display: 'flex', 
                            flexDirection: 'column', 
                            gap: '8px', 
                            marginTop: '6px',
                            maxHeight: '220px', 
                            overflowY: 'auto',
                            padding: '4px 6px 4px 2px',
                            borderLeft: '2px solid #e2e8f0',
                            marginLeft: '12px'
                          }}
                        >
                          {pastBookings.length === 0 ? (
                            <span style={{ fontSize: '0.75rem', color: '#94a3b8', padding: '8px 12px', fontStyle: 'italic' }}>
                              No past rides found.
                            </span>
                          ) : (
                            pastBookings.map((b: any) => (
                              <div 
                                key={b.bookingId} 
                                style={{
                                  background: '#f8fafc',
                                  border: '1px solid #e2e8f0',
                                  borderRadius: '10px',
                                  padding: '10px',
                                  display: 'flex',
                                  flexDirection: 'column',
                                  gap: '6px',
                                  fontSize: '0.75rem'
                                }}
                              >
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                  <span style={{ fontWeight: '700', color: '#1e293b' }}>
                                    {b.fromPlatform} → {b.toPlatform}
                                  </span>
                                  <span style={{
                                    padding: '2px 6px',
                                    borderRadius: '4px',
                                    fontSize: '0.62rem',
                                    fontWeight: '700',
                                    textTransform: 'uppercase',
                                    background: b.rideStatus === 'completed' ? '#eff6ff' : '#fef2f2',
                                    color: b.rideStatus === 'completed' ? '#1d4ed8' : '#b91c1c',
                                    border: '1px solid ' + (b.rideStatus === 'completed' ? '#bfdbfe' : '#fca5a5')
                                  }}>
                                    {b.rideStatus}
                                  </span>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', color: '#64748b' }}>
                                  <span>
                                    {new Date(b.scheduledTime).toLocaleDateString([], { month: 'short', day: 'numeric' })},{' '}
                                    {new Date(b.scheduledTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                  </span>
                                  <span style={{ fontWeight: '700', color: '#1d4ed8' }}>
                                    Rs {b.fare}
                                  </span>
                                </div>
                              </div>
                            ))
                          )}
                        </div>
                      )}
                    </div>

                    <div style={{ height: '1px', background: '#e2e8f0' }} />

                    {/* Sign out button */}
                    <button
                      onClick={async () => {
                        setShowProfileMenu(false);
                        await logout();
                      }}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '8px',
                        width: '100%',
                        padding: '12px',
                        borderRadius: '10px',
                        border: '1px solid rgba(239, 68, 68, 0.2)',
                        background: 'rgba(239, 68, 68, 0.06)',
                        color: '#dc2626',
                        fontSize: '0.88rem',
                        fontWeight: '700',
                        cursor: 'pointer',
                        transition: 'all 0.2s ease'
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
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                        <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
                        <polyline points="16 17 21 12 16 7"/>
                        <line x1="21" y1="12" x2="9" y2="12"/>
                      </svg>
                      Sign Out
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Header Caption */}
            <div style={{ zIndex: 10, marginTop: '8px' }}>
              <h1 style={{ fontSize: '2.4rem', fontWeight: '800', margin: '0 0 6px 0', letterSpacing: '-0.75px', fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
                Hubballi BOV Transit
              </h1>
              <p style={{ fontSize: '1.02rem', opacity: '0.92', margin: 0, maxWidth: '620px', lineHeight: '1.6', fontWeight: '500' }}>
                Welcome to SSS Hubballi Junction. Instantly reserve Battery Operated Vehicles (BOVs) to navigate platforms securely and comfortably.
              </p>
            </div>
          </header>

          {/* Premium Vertical Stepper Layout */}
          {/* Premium Flat Booking Flow */}
          <section 
            id="booking-form-section"
            style={{ 
              background: '#ffffff', 
              borderRadius: '28px', 
              border: '1px solid #e2e8f0', 
              boxShadow: '0 12px 36px rgba(15, 23, 42, 0.03)', 
              padding: '40px 36px', 
              marginBottom: '32px',
              display: 'flex',
              flexDirection: 'column',
              gap: '32px'
            }}
          >
            {hasActiveBooking && (
              <div style={{
                background: '#fffbeb',
                border: '1.5px solid #fef3c7',
                borderRadius: '16px',
                padding: '16px 20px',
                color: '#b45309',
                fontSize: '0.95rem',
                fontWeight: '600',
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                lineHeight: '1.5',
                boxShadow: '0 4px 12px rgba(180, 83, 9, 0.05)',
                marginBottom: '8px'
              }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, color: '#d97706' }}>
                  <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                  <line x1="12" y1="9" x2="12" y2="13"/>
                  <line x1="12" y1="17" x2="12.01" y2="17"/>
                </svg>
                <span>You currently have an active or pending buggy booking. To maintain optimal station transit flow, another ride cannot be scheduled until your current journey completes or is cancelled.</span>
              </div>
            )}

            {/* Trip Basics */}
            <div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '20px', alignItems: 'center' }}>
                <label style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '0.9rem', fontWeight: '600', color: '#334155' }}>
                  Number of Passengers / Seats
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    value={passengerCount || ""}
                    onChange={(event) => {
                      const val = event.target.value.replace(/[^0-9]/g, "");
                      if (val === "") {
                        setPassengerCount(0);
                        setSeats(0);
                      } else {
                        const num = Number(val);
                        if (num > 5) {
                          setStatus("Cannot book with more than 5 passengers.");
                          setPassengerCount(1);
                          setSeats(1);
                          setPassengerAges([""]);
                        } else {
                          setPassengerCount(num);
                          setSeats(num);
                          setPassengerAges(prev => {
                            const newAges = [...prev];
                            while (newAges.length < num) newAges.push("");
                            return newAges.slice(0, num);
                          });
                        }
                      }
                    }}
                    onBlur={() => {
                      if (passengerCount < 1) {
                        setPassengerCount(1);
                        setSeats(1);
                      }
                    }}
                    style={{
                      padding: '12px 16px',
                      borderRadius: '12px',
                      border: '1.5px solid #cbd5e1',
                      fontSize: '1rem',
                      background: '#ffffff',
                      outline: 'none',
                      transition: 'all 0.2s'
                    }}
                  />
                </label>

                <label style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '0.9rem', fontWeight: '600', color: '#334155' }}>
                  Journey Type
                  <select
                    value={journeyType}
                    onChange={(event) => setJourneyType(event.target.value as JourneyType)}
                    style={{
                      padding: '12px 16px',
                      borderRadius: '12px',
                      border: '1.5px solid #cbd5e1',
                      fontSize: '1rem',
                      background: '#ffffff',
                      outline: 'none',
                      appearance: 'none',
                      backgroundImage: 'url("data:image/svg+xml;charset=UTF-8,%3csvg xmlns=\'http://www.w3.org/2000/svg\' viewBox=\'0 0 24 24\' fill=\'none\' stroke=\'%23334155\' stroke-width=\'2\' stroke-linecap=\'round\' stroke-linejoin=\'round\'%3e%3cpolyline points=\'6 9 12 15 18 9\'%3e%3c/polyline%3e%3c/svg%3e")',
                      backgroundRepeat: 'no-repeat',
                      backgroundPosition: 'right 16px center',
                      backgroundSize: '16px',
                      cursor: 'pointer'
                    }}
                  >
                    <option value="arrival">Arrival (De-boarding train)</option>
                    <option value="departure">Departure (Boarding train)</option>
                  </select>
                </label>

                <div style={{
                  border: '1.5px dashed #bfdbfe',
                  background: isPriorityPassenger ? '#eff6ff' : '#f8fafc',
                  borderStyle: isPriorityPassenger ? 'solid' : 'dashed',
                  borderColor: isPriorityPassenger ? '#3b82f6' : '#cbd5e1',
                  borderRadius: '16px',
                  padding: '16px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '12px',
                  cursor: 'pointer',
                  minHeight: '48px',
                  alignSelf: 'flex-end',
                  transition: 'all 0.2s ease',
                  boxSizing: 'border-box'
                }} onClick={() => setIsPriorityPassenger(!isPriorityPassenger)}>
                  <input
                    type="checkbox"
                    checked={isPriorityPassenger}
                    onChange={(event) => setIsPriorityPassenger(event.target.checked)}
                    style={{ width: '18px', height: '18px', cursor: 'pointer', accentColor: '#1d4ed8' }}
                  />
                  <span style={{ fontSize: '0.9rem', fontWeight: 'bold', color: isPriorityPassenger ? '#1e40af' : '#475569', userSelect: 'none' }}>
                    Elderly / PwD Assistance
                  </span>
                </div>
              </div>

              {/* Ages Input if passengers > 1 */}
              {passengerCount > 1 && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '12px', marginTop: '18px', padding: '16px', background: '#f8fafc', borderRadius: '16px' }}>
                  {Array.from({ length: passengerCount }).map((_, idx) => (
                    <label key={idx} style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '0.8rem', fontWeight: '600', color: '#475569' }}>
                      Passenger {idx + 1} Age
                      <input
                        type="text"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        placeholder="Age"
                        value={passengerAges[idx] || ""}
                        onChange={(event) => {
                          const val = event.target.value.replace(/[^0-9]/g, "");
                          const newAges = [...passengerAges];
                          newAges[idx] = val;
                          setPassengerAges(newAges);
                        }}
                        style={{
                          padding: '10px 14px',
                          borderRadius: '10px',
                          border: '1px solid #cbd5e1',
                          fontSize: '0.9rem',
                          background: '#ffffff',
                        }}
                      />
                    </label>
                  ))}
                </div>
              )}
            </div>

            {/* Spacing Divider */}
            <div style={{ height: '1px', background: '#f1f5f9' }}></div>

            {/* Train Lookup */}
            <div>
              {/* Embedded booking mode switcher */}
              <div style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
                <button
                  type="button"
                  onClick={() => {
                    setBookingMode('auto');
                    setTrain(null);
                    setFromPlatform("");
                    setToPlatform("");
                    setFare(null);
                  }}
                  style={{
                    padding: '8px 16px',
                    borderRadius: '24px',
                    border: '2px solid ' + (bookingMode === 'auto' ? '#1d4ed8' : '#e2e8f0'),
                    background: bookingMode === 'auto' ? '#eff6ff' : '#ffffff',
                    color: bookingMode === 'auto' ? '#1e40af' : '#64748b',
                    fontWeight: 'bold',
                    fontSize: '0.85rem',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                    boxShadow: bookingMode === 'auto' ? '0 4px 10px rgba(29, 78, 216, 0.08)' : 'none'
                  }}
                >
                  Live Schedule (Auto-Fetch)
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setBookingMode('manual');
                    setTrain(null);
                    setFromPlatform("");
                    setToPlatform("");
                    setFare(null);
                  }}
                  style={{
                    padding: '8px 16px',
                    borderRadius: '24px',
                    border: '2px solid ' + (bookingMode === 'manual' ? '#1d4ed8' : '#e2e8f0'),
                    background: bookingMode === 'manual' ? '#eff6ff' : '#ffffff',
                    color: bookingMode === 'manual' ? '#1e40af' : '#64748b',
                    fontWeight: 'bold',
                    fontSize: '0.85rem',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                    boxShadow: bookingMode === 'manual' ? '0 4px 10px rgba(29, 78, 216, 0.08)' : 'none'
                  }}
                >
                  Custom Entry (Manual)
                </button>
              </div>

              {bookingMode === "auto" ? (
                <>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', alignItems: 'flex-end' }}>
                    <label style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '0.9rem', fontWeight: '600', color: '#334155' }}>
                      Train Number
                      <input
                        value={trainNumber}
                        onChange={(event) => setTrainNumber(event.target.value)}
                        placeholder="Train No. (e.g. 20653)"
                        style={{
                          padding: '12px 16px',
                          borderRadius: '12px',
                          border: '1.5px solid #cbd5e1',
                          fontSize: '1rem',
                          background: '#ffffff',
                          outline: 'none'
                        }}
                      />
                    </label>
                    
                    {/* Secondary Blue-Outlined Button */}
                    <button
                      disabled={busy}
                      type="button"
                      onClick={onTrainLookup}
                      style={{
                        padding: '12px 24px',
                        borderRadius: '12px',
                        border: '2px solid #1d4ed8',
                        background: '#ffffff',
                        color: '#1d4ed8',
                        fontWeight: 'bold',
                        fontSize: '0.95rem',
                        cursor: 'pointer',
                        height: '48px',
                        transition: 'all 0.2s',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '8px'
                      }}
                      onMouseOver={(e) => {
                        e.currentTarget.style.background = '#eff6ff';
                        e.currentTarget.style.transform = 'translateY(-1px)';
                      }}
                      onMouseOut={(e) => {
                        e.currentTarget.style.background = '#ffffff';
                        e.currentTarget.style.transform = 'none';
                      }}
                    >
                      {busy ? "Fetching..." : "Fetch Train Details"}
                    </button>
                  </div>

                  {train && (
                    <article style={{ background: '#f8fafc', padding: '18px', borderRadius: '18px', border: '1px solid #e2e8f0', marginTop: '18px' }}>
                      <h3 style={{ color: '#1e3a8a', margin: '0 0 10px 0', fontSize: '1.1rem', fontWeight: 'bold' }}>
                        {train.trainName} ({train.trainNumber})
                      </h3>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px', fontSize: '0.9rem', color: '#475569' }}>
                        <div><strong>Route:</strong> {train.origin} to {train.destination}</div>
                        <div><strong>Station Platform:</strong> Platform {train.platformNumber}</div>
                        <div><strong>Timings:</strong> Arr: {train.scheduledArrival ?? "N/A"} | Dep: {train.scheduledDeparture ?? "N/A"}</div>
                      </div>
                    </article>
                  )}
                </>
              ) : (
                <label style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '0.9rem', fontWeight: '600', color: '#334155' }}>
                  Train Number / Name
                  <input
                    value={trainNumber}
                    onChange={(event) => setTrainNumber(event.target.value)}
                    placeholder="e.g. 20653"
                    style={{
                      padding: '12px 16px',
                      borderRadius: '12px',
                      border: '1.5px solid #cbd5e1',
                      fontSize: '1rem',
                      background: '#ffffff',
                      outline: 'none'
                    }}
                  />
                </label>
              )}
            </div>

            {/* Spacing Divider */}
            <div style={{ height: '1px', background: '#f1f5f9' }}></div>

            {/* Luggage & Platform Details */}
            <div>
              {/* Luggage Input sub-section */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '20px', marginBottom: '18px' }}>
                <label style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '0.9rem', fontWeight: '600', color: '#334155' }}>
                  Luggage Weight (in kg)
                  <input
                    type="number"
                    min="0"
                    placeholder="e.g. 15"
                    value={luggageWeight || ""}
                    onChange={e => {
                      const weight = Number(e.target.value) || 0;
                      setLuggageWeight(weight);
                      if (weight > 10) {
                        setHeavyLuggageCount(1);
                        setLightLuggageCount(0);
                      } else if (weight > 0) {
                        setLightLuggageCount(1);
                        setHeavyLuggageCount(0);
                      } else {
                        setLightLuggageCount(0);
                        setHeavyLuggageCount(0);
                      }
                    }}
                    style={{
                      padding: '12px 16px',
                      borderRadius: '12px',
                      border: '1.5px solid #cbd5e1',
                      fontSize: '1rem',
                      background: '#ffffff',
                      outline: 'none'
                    }}
                  />
                </label>
              </div>
              {luggageWeight > 10 && (
                <p style={{ color: '#b45309', fontSize: '0.85rem', fontWeight: 'bold', margin: '0 0 20px 0', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  Classed as Heavy Luggage (+Rs 10 extra charge applied)
                </p>
              )}
              {luggageWeight > 0 && luggageWeight <= 10 && (
                <p style={{ color: '#15803d', fontSize: '0.85rem', fontWeight: 'bold', margin: '0 0 20px 0', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  Classed as Light Luggage (no extra charge)
                </p>
              )}

              {/* Platforms Input sub-section */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '20px', alignItems: 'flex-end', marginBottom: '24px' }}>
                {journeyType === "departure" ? (
                  <>
                    <label style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '0.9rem', fontWeight: '600', color: '#334155' }}>
                      Source (Pickup Point)
                      <select
                        value={pickupPoint}
                        onChange={(event) => setPickupPoint(event.target.value)}
                        style={{
                          padding: '12px 16px',
                          borderRadius: '12px',
                          border: '1.5px solid #cbd5e1',
                          fontSize: '1rem',
                          background: '#ffffff',
                          outline: 'none',
                          cursor: 'pointer'
                        }}
                      >
                        <option value="">Select pickup point</option>
                        {pickupPoints.map((point) => (
                          <option key={point} value={point}>{point}</option>
                        ))}
                      </select>
                    </label>
                    <label style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '0.9rem', fontWeight: '600', color: '#334155' }}>
                      Destination (Train Platform)
                      {bookingMode === "auto" ? (
                        <input
                          type="text"
                          readOnly
                          value={train ? `Platform ${train.platformNumber}` : "Fetch train first"}
                          style={{
                            padding: '12px 16px',
                            borderRadius: '12px',
                            border: '1.5px solid #e2e8f0',
                            fontSize: '1rem',
                            background: '#f8fafc',
                            color: '#64748b',
                            outline: 'none'
                          }}
                        />
                      ) : (
                        <select
                          value={toPlatform}
                          onChange={(event) => setToPlatform(event.target.value)}
                          style={{
                            padding: '12px 16px',
                            borderRadius: '12px',
                            border: '1.5px solid #cbd5e1',
                            fontSize: '1rem',
                            background: '#ffffff',
                            outline: 'none',
                            cursor: 'pointer'
                          }}
                        >
                          <option value="">Select platform</option>
                          {platformOptions.map((platform) => (
                            <option key={platform} value={platform}>Platform {platform}</option>
                          ))}
                        </select>
                      )}
                    </label>
                  </>
                ) : (
                  <>
                    <label style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '0.9rem', fontWeight: '600', color: '#334155' }}>
                      Source (Train Platform)
                      {bookingMode === "auto" ? (
                        <input
                          type="text"
                          readOnly
                          value={train ? `Platform ${train.platformNumber}` : "Fetch train first"}
                          style={{
                            padding: '12px 16px',
                            borderRadius: '12px',
                            border: '1.5px solid #e2e8f0',
                            fontSize: '1rem',
                            background: '#f8fafc',
                            color: '#64748b',
                            outline: 'none'
                          }}
                        />
                      ) : (
                        <select
                          value={fromPlatform}
                          onChange={(event) => setFromPlatform(event.target.value)}
                          style={{
                            padding: '12px 16px',
                            borderRadius: '12px',
                            border: '1.5px solid #cbd5e1',
                            fontSize: '1rem',
                            background: '#ffffff',
                            outline: 'none',
                            cursor: 'pointer'
                          }}
                        >
                          <option value="">Select platform</option>
                          {platformOptions.map((platform) => (
                            <option key={platform} value={platform}>Platform {platform}</option>
                          ))}
                        </select>
                      )}
                    </label>
                    <label style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '0.9rem', fontWeight: '600', color: '#334155' }}>
                      Destination Platform
                      <select
                        value={toPlatform}
                        onChange={(event) => setToPlatform(event.target.value)}
                        style={{
                          padding: '12px 16px',
                          borderRadius: '12px',
                          border: '1.5px solid #cbd5e1',
                          fontSize: '1rem',
                          background: '#ffffff',
                          outline: 'none',
                          cursor: 'pointer'
                        }}
                      >
                        <option value="">Select destination platform</option>
                        {platformOptions
                          .filter((platform) => platform !== fromPlatform)
                          .map((platform) => (
                            <option key={platform} value={platform}>Platform {platform}</option>
                          ))}
                      </select>
                    </label>
                  </>
                )}
                
                {/* Secondary Blue-Outlined Button */}
                <button
                  disabled={busy}
                  type="button"
                  onClick={onFareEstimate}
                  style={{
                    padding: '12px 24px',
                    borderRadius: '12px',
                    border: '2px solid #1d4ed8',
                    background: '#ffffff',
                    color: '#1d4ed8',
                    fontWeight: 'bold',
                    fontSize: '0.95rem',
                    cursor: 'pointer',
                    height: '48px',
                    transition: 'all 0.2s',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px'
                  }}
                  onMouseOver={(e) => {
                    e.currentTarget.style.background = '#eff6ff';
                    e.currentTarget.style.transform = 'translateY(-1px)';
                  }}
                  onMouseOut={(e) => {
                    e.currentTarget.style.background = '#ffffff';
                    e.currentTarget.style.transform = 'none';
                  }}
                >
                  Estimate Fare
                </button>
              </div>

              {fare !== null && (
                <p style={{ margin: '12px 0 0 0', fontSize: '1.05rem', fontWeight: 'bold', color: '#1e3a8a', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  Estimated fare: Rs {fare} {isPeakHour ? "(peak hour applied)" : "(off peak)"}
                </p>
              )}
            </div>
            
            {/* Massive Review Booking primary button */}
            <div style={{ display: 'flex', justifyContent: 'center', marginTop: '24px', borderTop: '1px solid #f1f5f9', paddingTop: '32px' }}>
              <button
                type="button"
                disabled={hasActiveBooking}
                onClick={() => {
                  if (hasActiveBooking) return;
                  setStatus('');
                  setShowReviewModal(true);
                }}
                style={{
                  width: '100%',
                  maxWidth: '380px',
                  padding: '16px 32px',
                  borderRadius: '16px',
                  border: 'none',
                  background: hasActiveBooking ? '#cbd5e1' : 'linear-gradient(135deg, #1d4ed8, #1e40af)',
                  color: hasActiveBooking ? '#94a3b8' : '#ffffff',
                  fontWeight: 'bold',
                  fontSize: '1.1rem',
                  cursor: hasActiveBooking ? 'not-allowed' : 'pointer',
                  boxShadow: hasActiveBooking ? 'none' : '0 8px 24px rgba(29, 78, 216, 0.3)',
                  transition: 'all 0.2s',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px'
                }}
                onMouseOver={(e) => {
                  if (hasActiveBooking) return;
                  e.currentTarget.style.transform = 'translateY(-2px)';
                  e.currentTarget.style.boxShadow = '0 12px 30px rgba(29, 78, 216, 0.4)';
                }}
                onMouseOut={(e) => {
                  if (hasActiveBooking) return;
                  e.currentTarget.style.transform = 'none';
                  e.currentTarget.style.boxShadow = '0 8px 24px rgba(29, 78, 216, 0.3)';
                }}
              >
                Review Booking
              </button>
            </div>
          </section>

          {/* Premium Review Modal Overlay */}
          {showReviewModal && (
            <div style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(15, 23, 42, 0.6)',
              backdropFilter: 'blur(8px)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 9999,
              padding: '20px'
            }}>
              <div style={{
                background: '#ffffff',
                borderRadius: '28px',
                boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
                width: '100%',
                maxWidth: '520px',
                padding: '32px',
                position: 'relative',
                boxSizing: 'border-box'
              }}>
                {/* Modal Header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                  <h3 style={{ fontSize: '1.4rem', fontWeight: '800', color: '#0f172a', margin: 0, fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
                    Review Your Ride
                  </h3>
                  <button
                    onClick={() => {
                      setShowReviewModal(false);
                      setBooking(null);
                    }}
                    style={{
                      background: '#f1f5f9',
                      border: 'none',
                      width: '32px',
                      height: '32px',
                      borderRadius: '50%',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '1rem',
                      color: '#64748b',
                      fontWeight: 'bold',
                      transition: 'all 0.2s'
                    }}
                    onMouseOver={(e) => e.currentTarget.style.background = '#e2e8f0'}
                    onMouseOut={(e) => e.currentTarget.style.background = '#f1f5f9'}
                  >
                    X
                  </button>
                </div>

                {/* Booking Details Summary */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '24px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 14px', background: '#f8fafc', borderRadius: '12px', fontSize: '0.95rem' }}>
                    <span style={{ color: '#64748b', fontWeight: '500' }}>Passengers / Seats</span>
                    <strong style={{ color: '#0f172a' }}>{passengerCount} Seat(s)</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 14px', background: '#f8fafc', borderRadius: '12px', fontSize: '0.95rem' }}>
                    <span style={{ color: '#64748b', fontWeight: '500' }}>Priority Assistance</span>
                    <strong style={{ color: '#1e40af' }}>{isPriorityPassenger ? "Enabled" : "None"}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 14px', background: '#f8fafc', borderRadius: '12px', fontSize: '0.95rem' }}>
                    <span style={{ color: '#64748b', fontWeight: '500' }}>Journey Type</span>
                    <strong style={{ color: '#0f172a' }}>{journeyType === 'arrival' ? "Arrival" : "Departure"}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 14px', background: '#f8fafc', borderRadius: '12px', fontSize: '0.95rem' }}>
                    <span style={{ color: '#64748b', fontWeight: '500' }}>From Platform</span>
                    <strong style={{ color: '#0f172a' }}>{fromPlatform ? (fromPlatform.toLowerCase().startsWith("platform") ? fromPlatform : `Platform ${fromPlatform}`) : (pickupPoint || "N/A")}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 14px', background: '#f8fafc', borderRadius: '12px', fontSize: '0.95rem' }}>
                    <span style={{ color: '#64748b', fontWeight: '500' }}>To Platform</span>
                    <strong style={{ color: '#0f172a' }}>{toPlatform ? (toPlatform.toLowerCase().startsWith("platform") ? toPlatform : `Platform ${toPlatform}`) : "N/A"}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 14px', background: '#f8fafc', borderRadius: '12px', fontSize: '0.95rem' }}>
                    <span style={{ color: '#64748b', fontWeight: '500' }}>Luggage weight</span>
                    <strong style={{ color: '#0f172a' }}>{luggageWeight > 0 ? `${luggageWeight} kg` : "None"}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 14px', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '12px', fontSize: '1.05rem' }}>
                    <span style={{ color: '#1e40af', fontWeight: '600' }}>Secure Fare</span>
                    <strong style={{ color: '#1d4ed8' }}>{fare === null ? "Estimate pending" : `Rs ${fare}`}</strong>
                  </div>
                </div>

                {/* Validation Status message in Modal */}
                {status && <p style={{ color: '#dc2626', fontWeight: 'bold', fontSize: '0.85rem', margin: '0 0 16px 0', textAlign: 'center' }}>{status}</p>}

                {/* Confirmation Actions */}
                {!booking ? (
                  <button
                    disabled={busy}
                    type="button"
                    onClick={onConfirmBooking}
                    style={{
                      width: '100%',
                      padding: '16px 24px',
                      borderRadius: '16px',
                      border: 'none',
                      background: 'linear-gradient(135deg, #1d4ed8, #1e40af)',
                      color: '#ffffff',
                      fontWeight: 'bold',
                      fontSize: '1.1rem',
                      cursor: 'pointer',
                      boxShadow: '0 8px 24px rgba(29, 78, 216, 0.35)',
                      transition: 'all 0.2s',
                      boxSizing: 'border-box'
                    }}
                    onMouseOver={(e) => { e.currentTarget.style.transform = 'translateY(-1px)'; }}
                    onMouseOut={(e) => { e.currentTarget.style.transform = 'none'; }}
                  >
                    {busy ? "Booking..." : "Confirm & Book Buggy"}
                  </button>
                ) : (
                  <div style={{
                    background: '#f0fdf4',
                    border: '1px solid #bbf7d0',
                    padding: '20px',
                    borderRadius: '16px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '12px'
                  }}>
                    <h4 style={{ color: '#166534', margin: 0, fontSize: '1.1rem', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      Booking Confirmed
                    </h4>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '8px', fontSize: '0.9rem', color: '#166534' }}>
                      <div><strong>Token ID:</strong> {booking.bookingId}</div>
                      <div><strong>Vehicle:</strong> {booking.vehicleNumber}</div>
                      <div><strong>Allocated Seats:</strong> {booking.seatNumbers.length ? booking.seatNumbers.join(", ") : "Allocating..."}</div>
                      <div><strong>Scheduled Time:</strong> {new Date(booking.scheduledTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                    </div>
                    <button
                      onClick={() => {
                        setShowReviewModal(false);
                        setBooking(null);
                      }}
                      type="button"
                      style={{
                        marginTop: '8px',
                        width: '100%',
                        padding: '12px',
                        background: '#166534',
                        color: '#ffffff',
                        border: 'none',
                        borderRadius: '8px',
                        fontWeight: 'bold',
                        cursor: 'pointer'
                      }}
                    >
                      Done
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}


          <section className="card">
            <h2>My Bookings</h2>
            {activeBookings.length === 0 ? (
              <p style={{ color: '#64748b', fontSize: '0.95rem' }}>No active bookings at the moment. Use the scheduler above to book a platform transfer.</p>
            ) : (
              <div className="history" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '20px' }}>
                {activeBookings.map((item: any) => (
                  <article key={item.bookingId} className="history-item" style={{
                    position: 'relative',
                    overflow: 'hidden',
                    padding: '20px',
                    borderRadius: '12px',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.05)',
                    background: 'rgba(255, 255, 255, 0.8)',
                    border: '1px solid rgba(0,0,0,0.08)'
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                      <strong className="booking-token" style={{ fontSize: '1.05rem', color: '#1a3a6b', whiteSpace: 'nowrap' }}>{item.bookingId}</strong>
                      <span style={{
                        padding: '4px 10px',
                        borderRadius: '12px',
                        fontSize: '0.75rem',
                        fontWeight: 'bold',
                        background: item.rideStatus === 'pending' ? '#ffe0b2' : item.rideStatus === 'completed' ? '#c8e6c9' : item.rideStatus === 'cancelled' ? '#ffcdd2' : '#bbdefb',
                        color: item.rideStatus === 'pending' ? '#e65100' : item.rideStatus === 'completed' ? '#2e7d32' : item.rideStatus === 'cancelled' ? '#c62828' : '#1565c0'
                      }}>{item.rideStatus.toUpperCase()}</span>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 0.7fr', gap: '8px', fontSize: '0.85rem', marginBottom: '12px', color: '#5a6f8c' }}>
                      <div style={{ whiteSpace: 'nowrap' }}><strong>BOV:</strong> {item.bovVehicleNumber || "Allocating..."}</div>
                      <div><strong>Seats:</strong> {item.seatNumbers?.length ? item.seatNumbers.join(", ") : item.seats}</div>
                      <div><strong>Fare:</strong> Rs {item.fare}</div>
                      <div><strong>Time:</strong> {new Date(item.scheduledTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                    </div>

                    {item.rideStatus === 'confirmed' && item.startPin && (
                      <div className="glass-card" style={{
                        background: 'linear-gradient(135deg, #eff6ff, #dbeafe)',
                        border: '1px solid #bfdbfe',
                        borderRadius: '8px',
                        padding: '12px',
                        marginTop: '10px',
                        marginBottom: '10px',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        fontFamily: "'Inter', sans-serif"
                      }}>
                        <div>
                          <span style={{ fontSize: '0.78rem', color: '#1e40af', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block' }}>
                            Pick-up PIN code
                          </span>
                          <span style={{ fontSize: '0.8rem', color: '#1e40af', opacity: 0.8, fontWeight: '500' }}>
                            Give this PIN to the driver to start the transfer
                          </span>
                        </div>
                        <strong style={{ fontSize: '1.5rem', color: '#1d4ed8', fontWeight: '900', letterSpacing: '2px', fontFamily: 'monospace' }}>
                          {item.startPin}
                        </strong>
                      </div>
                    )}

                    {/* Waitlist Card Details for Pending rides */}
                    {item.rideStatus === 'pending' && (
                      <div className="glass-card" style={{
                        background: 'rgba(230, 81, 0, 0.05)',
                        border: '1px solid rgba(230, 81, 0, 0.2)',
                        borderRadius: '8px',
                        padding: '12px',
                        marginTop: '10px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '6px'
                      }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', color: '#e65100', fontSize: '0.85rem' }}>
                          <span>Waitlist Position:</span>
                          <span>#{item.queuePosition || 1}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: '#7e57c2' }}>
                          <span>Est. wait time:</span>
                          <strong>~{item.estimatedWaitMinutes || 5} mins</strong>
                        </div>
                        <div style={{ height: '4px', background: '#ffe0b2', borderRadius: '2px', overflow: 'hidden', marginTop: '4px' }}>
                          <div style={{
                            height: '100%',
                            width: '45%',
                            background: '#e65100',
                            borderRadius: '2px'
                          }}></div>
                        </div>
                      </div>
                    )}

                     {/* Safe Interactive Hold-to-SOS Panic Button */}
                     {(item.rideStatus === 'confirmed' || item.rideStatus === 'in-progress') && (() => {
                       const progress = holdProgress[item.bookingId] || 0;
                       const isHolding = progress > 0;
                       return (
                         <button
                           onMouseDown={() => startSosHold(item.bookingId, item.fromPlatform || item.toPlatform)}
                           onMouseUp={() => cancelSosHold(item.bookingId)}
                           onMouseLeave={() => cancelSosHold(item.bookingId)}
                           onTouchStart={() => startSosHold(item.bookingId, item.fromPlatform || item.toPlatform)}
                           onTouchEnd={() => cancelSosHold(item.bookingId)}
                           onTouchCancel={() => cancelSosHold(item.bookingId)}
                           style={{
                             background: isHolding 
                               ? `linear-gradient(90deg, #8b1111 0%, #8b1111 ${progress}%, #d32f2f ${progress}%, #d32f2f 100%)` 
                               : 'linear-gradient(135deg, #d32f2f, #b71c1c)',
                             color: 'white',
                             border: 'none',
                             padding: '14px 20px',
                             borderRadius: '8px',
                             cursor: 'pointer',
                             fontWeight: 'bold',
                             fontSize: '0.9rem',
                             marginTop: '16px',
                             width: '100%',
                             display: 'flex',
                             alignItems: 'center',
                             justifyContent: 'center',
                             gap: '8px',
                             boxShadow: isHolding 
                               ? '0 6px 20px rgba(139, 17, 17, 0.4)' 
                               : '0 4px 12px rgba(211, 47, 47, 0.25)',
                             transition: 'background 0.05s linear, transform 0.15s ease',
                             userSelect: 'none',
                             WebkitUserSelect: 'none',
                             fontFamily: "'Inter', sans-serif"
                           }}
                         >
                           {isHolding ? (
                             <span>🚨 HOLDING... ({Math.ceil((3 - (progress * 3) / 100))}s)</span>
                           ) : (
                             <span>🚨 HOLD FOR 3S FOR EMERGENCY SOS</span>
                           )}
                         </button>
                       );
                     })()}
                  </article>
                ))}
              </div>
            )}
          </section>


        </div>
      )}

      {sessionReady && status && <p className="status">{status}</p>}
    </div>
  );
}
