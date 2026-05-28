import { FormEvent, useEffect, useState } from "react";
import {
  lookupTrain,
} from "./lib/api";
import { JourneyType, UserRole, TrainDoc as TrainInfo } from "@ride-reserve/types";

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

  const [profile, setProfile] = useState({ name: "", phone: "", email: "", age: "" });
  const [selectedRole, setSelectedRole] = useState<UserRole>("passenger");
  const [authMode, setAuthMode] = useState<AuthMode>("login");
  const [authSecret, setAuthSecret] = useState("");

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
  // Removed derived fromPlatform, using state instead

  const [activeLocations, setActiveLocations] = useState<Record<string, string>>({});

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
      setBookingStatus(`📢 Alert: Train T-${trainNumber} is delayed by ${delayMinutes} minutes! Rescheduled ${rescheduledCount} ride(s).`);
      // Auto clear after 12s
      setTimeout(() => setBookingStatus(""), 12000);
    });

    return () => {
      socket.disconnect();
    };
  }, [passengerProfile, bookingHistory]);

  function triggerSos(bookingId: string, currentPlatform: string) {
    if (!window.confirm("🚨 WARNING: This will trigger an emergency alert to station administration. Proceed only if you need immediate assistance!")) return;
    if (passengerSocket) {
      passengerSocket.emit("emergency_sos", {
        bookingId,
        passengerName: passengerProfile?.name || "Passenger",
        currentPlatform: currentPlatform || "Platform 1",
        role: "passenger"
      });
      setBookingStatus("🚨 SOS alert successfully broadcasted to Station Admin!");
    }
  }


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

  async function startSession(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!isPassengerRole) {
      const isLocal = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
      const targetUrl = isLocal
        ? (selectedRole === 'driver' ? "http://localhost:5174" : "http://localhost:5175")
        : (selectedRole === 'driver' ? "https://ride-reserve-driver.web.app" : "https://ride-reserve-admin.web.app");

      if (targetUrl) {
        setAuthStatus(`Redirecting to ${selectedRoleOption.label} portal...`);
        setTimeout(() => { window.location.href = targetUrl; }, 1000);
      }
      return;
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
        await signup({
          name: profile.name,
          email: profile.email,
          phone: profile.phone,
          age: Number(profile.age),
          password: authSecret,
        });
      } else {
        await login({ email: profile.email, password: authSecret });
      }
      setAuthSecret("");
    } catch (error) {
      // Status is handled by hook
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
              <div className="absolute inset-0" style={{ background: 'linear-gradient(to bottom, rgba(15, 23, 42, 0.3), rgba(15, 23, 42, 0.6))' }}></div>
            </div>

            <div className="relative z-10 w-full p-4 flex justify-center items-center">
              {/* Glassmorphic Passenger Card */}
              <div
                style={{
                  background: 'rgba(255, 255, 255, 0.06)',
                  backdropFilter: 'blur(26px)',
                  WebkitBackdropFilter: 'blur(26px)',
                  border: '1px solid rgba(255, 255, 255, 0.16)',
                  borderRadius: '28px',
                  boxShadow: '0 30px 70px rgba(0, 0, 0, 0.35)',
                  padding: '40px 36px',
                  width: '100%',
                  maxWidth: '460px',
                  color: '#ffffff',
                  fontFamily: "'Inter', sans-serif"
                }}
              >
                <span style={{ fontSize: '0.72rem', fontWeight: 'bold', letterSpacing: '2px', textTransform: 'uppercase', color: 'rgba(255, 255, 255, 0.55)', display: 'block', marginBottom: '6px' }}>
                  SECURE ENTRY
                </span>
                <h2 style={{ fontSize: '1.9rem', fontWeight: '800', color: '#ffffff', margin: '0 0 6px 0', letterSpacing: '-0.5px' }}>
                  Passenger Login
                </h2>
                <p style={{ fontSize: '0.85rem', color: 'rgba(255, 255, 255, 0.7)', margin: '0 0 24px 0', lineHeight: '1.4' }}>
                  {authMode === 'login' ? 'Existing passengers can log in and book rides.' : 'Create an account to book premium intra-station transfers.'}
                </p>

                {/* Segmented Control Toggle */}
                <div style={{
                  display: 'flex',
                  background: 'rgba(255, 255, 255, 0.06)',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
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
                      color: authMode === 'login' ? '#0f172a' : 'rgba(255, 255, 255, 0.75)',
                      fontWeight: 'bold',
                      fontSize: '0.88rem',
                      cursor: 'pointer',
                      boxShadow: authMode === 'login' ? '0 4px 10px rgba(0,0,0,0.18)' : 'none',
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
                      color: authMode === 'signup' ? '#0f172a' : 'rgba(255, 255, 255, 0.75)',
                      fontWeight: 'bold',
                      fontSize: '0.88rem',
                      cursor: 'pointer',
                      boxShadow: authMode === 'signup' ? '0 4px 10px rgba(0,0,0,0.18)' : 'none',
                      transition: 'all 0.2s'
                    }}
                  >
                    Sign up
                  </button>
                </div>

                <form onSubmit={startSession} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  {authMode === "signup" && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      <label style={{ fontSize: '0.85rem', fontWeight: '600', color: 'rgba(255, 255, 255, 0.85)' }}>Full Name</label>
                      <input
                        type="text"
                        placeholder="Full Name"
                        value={profile.name}
                        onChange={(event) => setProfile((prev) => ({ ...prev, name: event.target.value }))}
                        required
                        style={{
                          width: '100%',
                          background: 'rgba(255, 255, 255, 0.05)',
                          border: '1px solid rgba(255, 255, 255, 0.2)',
                          borderRadius: '12px',
                          padding: '12px 16px',
                          color: '#ffffff',
                          fontSize: '0.95rem',
                          outline: 'none',
                          transition: 'all 0.2s'
                        }}
                      />
                    </div>
                  )}

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <label style={{ fontSize: '0.85rem', fontWeight: '600', color: 'rgba(255, 255, 255, 0.85)' }}>Email</label>
                    <input
                      type="email"
                      placeholder="Enter your Email"
                      value={profile.email}
                      onChange={(event) => setProfile((prev) => ({ ...prev, email: event.target.value }))}
                      required
                      style={{
                        width: '100%',
                        background: 'rgba(255, 255, 255, 0.05)',
                        border: '1px solid rgba(255, 255, 255, 0.2)',
                        borderRadius: '12px',
                        padding: '12px 16px',
                        color: '#ffffff',
                        fontSize: '0.95rem',
                        outline: 'none',
                        transition: 'all 0.2s'
                      }}
                    />
                  </div>

                  {authMode === "signup" && (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        <label style={{ fontSize: '0.85rem', fontWeight: '600', color: 'rgba(255, 255, 255, 0.85)' }}>Phone Number</label>
                        <input
                          type="text"
                          placeholder="+91..."
                          value={profile.phone}
                          onChange={(event) => setProfile((prev) => ({ ...prev, phone: event.target.value }))}
                          required
                          style={{
                            width: '100%',
                            background: 'rgba(255, 255, 255, 0.05)',
                            border: '1px solid rgba(255, 255, 255, 0.2)',
                            borderRadius: '12px',
                            padding: '12px 16px',
                            color: '#ffffff',
                            fontSize: '0.95rem',
                            outline: 'none'
                          }}
                        />
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        <label style={{ fontSize: '0.85rem', fontWeight: '600', color: 'rgba(255, 255, 255, 0.85)' }}>Age</label>
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
                            background: 'rgba(255, 255, 255, 0.05)',
                            border: '1px solid rgba(255, 255, 255, 0.2)',
                            borderRadius: '12px',
                            padding: '12px 16px',
                            color: '#ffffff',
                            fontSize: '0.95rem',
                            outline: 'none'
                          }}
                        />
                      </div>
                    </div>
                  )}

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <label style={{ fontSize: '0.85rem', fontWeight: '600', color: 'rgba(255, 255, 255, 0.85)' }}>Password</label>
                    <input
                      type="password"
                      placeholder="••••••"
                      value={authSecret}
                      onChange={(event) => setAuthSecret(event.target.value)}
                      required
                      style={{
                        width: '100%',
                        background: 'rgba(255, 255, 255, 0.05)',
                        border: '1px solid rgba(255, 255, 255, 0.2)',
                        borderRadius: '12px',
                        padding: '12px 16px',
                        color: '#ffffff',
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
                      background: 'linear-gradient(135deg, #ff7700ff, #fe7200ff)',
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
                  {status && <p style={{ textAlign: 'center', color: '#f87171', fontWeight: 'bold', margin: '6px 0 0 0', fontSize: '0.88rem' }}>{status}</p>}
                </form>

                <div style={{ textAlign: 'center', marginTop: '20px', fontSize: '0.82rem' }}>
                  <p style={{ color: 'rgba(255, 255, 255, 0.55)', margin: '0 0 10px 0' }}>
                    {authMode === 'login' ? 'New passenger? Switch to Sign up first.' : 'Already registered? Switch to Login first.'}
                  </p>
                  <p style={{ color: 'rgba(255, 255, 255, 0.55)', margin: 0 }}>
                    Are you a Driver or Admin?{' '}
                    <button
                      type="button"
                      onClick={() => window.location.href = '/staff-login'}
                      style={{ background: 'none', border: 'none', color: '#60a5fa', textDecoration: 'underline', padding: 0, cursor: 'pointer', fontWeight: 'bold' }}
                    >
                      Click here for Staff Login
                    </button>
                  </p>
                </div>
              </div>
            </div>
          </section>
        </main>
      ) : (
        <div className="page">
          <header className="hero">
            <p className="eyebrow">Hubli Railway Station</p>
            <h1>SmartBOV Passenger Booking</h1>
            <p className="subtitle">
              Built from passenger flow + BOV booking requirements. Reservation and train-number paths are both supported.
            </p>
            <div className="hero-meta">
              <span className="meta-pill">{`Logged in as ${passengerProfile?.name ?? "Passenger"}`}</span>
              <span className="meta-pill">{passengerProfile?.email ?? ""}</span>
              <span className="meta-pill">{`Journey: ${journeyType}`}</span>
              <span className="meta-pill">{busy ? "Processing..." : "Peak-aware fare estimate"}</span>
            </div>
            <div className="hero-actions">
              <button className="secondary" type="button" onClick={logout} disabled={busy}>
                Sign Out
              </button>
            </div>
          </header>

          <section className="card" style={{ background: '#ffffff', borderRadius: '24px', border: '1px solid #e2e8f0', boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.05)', padding: '24px', marginBottom: '24px' }}>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 'bold', color: '#0f172a', marginBottom: '16px', fontFamily: "'Sora', sans-serif" }}>Trip Basics</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '20px', alignItems: 'center' }}>
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
                  <option value="arrival">Arrival</option>
                  <option value="departure">Departure</option>
                </select>
              </label>

              <div style={{
                border: '1.5px dashed #bfdbfe',
                background: '#eff6ff',
                borderRadius: '16px',
                padding: '16px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '12px',
                cursor: 'pointer',
                height: '66px',
                alignSelf: 'flex-end',
                transition: 'all 0.2s'
              }} onClick={() => setIsPriorityPassenger(!isPriorityPassenger)}>
                <input
                  type="checkbox"
                  checked={isPriorityPassenger}
                  onChange={(event) => setIsPriorityPassenger(event.target.checked)}
                  style={{ width: '20px', height: '20px', cursor: 'pointer', accentColor: '#1d4ed8' }}
                />
                <span style={{ fontSize: '0.9rem', fontWeight: '600', color: '#1e40af', userSelect: 'none' }}>
                  Elderly / PwD priority required
                </span>
              </div>
            </div>

            {/* Ages grid if passengers > 1 */}
            {passengerCount > 1 && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '12px', marginTop: '16px' }}>
                {Array.from({ length: passengerCount }).map((_, idx) => (
                  <label key={idx} style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '0.8rem', fontWeight: '600', color: '#475569' }}>
                    Passenger {idx + 1} Age
                    <input
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      value={passengerAges[idx] || ""}
                      onChange={(event) => {
                        const val = event.target.value.replace(/[^0-9]/g, "");
                        const newAges = [...passengerAges];
                        newAges[idx] = val;
                        setPassengerAges(newAges);
                      }}
                      style={{
                        padding: '8px 12px',
                        borderRadius: '8px',
                        border: '1px solid #cbd5e1',
                        fontSize: '0.9rem',
                        background: '#ffffff',
                      }}
                    />
                  </label>
                ))}
              </div>
            )}
          </section>

          <section className="card" style={{ background: '#ffffff', borderRadius: '24px', border: '1px solid #e2e8f0', boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.05)', padding: '24px', marginBottom: '24px' }}>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 'bold', color: '#0f172a', marginBottom: '16px', fontFamily: "'Sora', sans-serif" }}>Train Lookup</h2>

            {/* Embedded booking mode switcher */}
            <div style={{ display: 'flex', gap: '10px', marginBottom: '18px' }}>
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
                  padding: '6px 14px',
                  borderRadius: '20px',
                  border: '1.5px solid ' + (bookingMode === 'auto' ? '#1d4ed8' : '#cbd5e1'),
                  background: bookingMode === 'auto' ? '#eff6ff' : '#ffffff',
                  color: bookingMode === 'auto' ? '#1e40af' : '#64748b',
                  fontWeight: 'bold',
                  fontSize: '0.85rem',
                  cursor: 'pointer',
                  transition: 'all 0.2s'
                }}
              >
                🔍 Live Schedule (Auto-Fetch)
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
                  padding: '6px 14px',
                  borderRadius: '20px',
                  border: '1.5px solid ' + (bookingMode === 'manual' ? '#1d4ed8' : '#cbd5e1'),
                  background: bookingMode === 'manual' ? '#eff6ff' : '#ffffff',
                  color: bookingMode === 'manual' ? '#1e40af' : '#64748b',
                  fontWeight: 'bold',
                  fontSize: '0.85rem',
                  cursor: 'pointer',
                  transition: 'all 0.2s'
                }}
              >
                ✏️ Custom Entry (Manual)
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
                  <button
                    disabled={busy}
                    type="button"
                    onClick={onTrainLookup}
                    style={{
                      padding: '12px 24px',
                      borderRadius: '12px',
                      border: 'none',
                      background: '#eff6ff',
                      color: '#1e40af',
                      fontWeight: 'bold',
                      fontSize: '0.95rem',
                      cursor: 'pointer',
                      height: '46px',
                      transition: 'all 0.2s',
                      boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)'
                    }}
                    onMouseOver={(e) => { e.currentTarget.style.background = '#dbeafe'; }}
                    onMouseOut={(e) => { e.currentTarget.style.background = '#eff6ff'; }}
                  >
                    {busy ? "Fetching..." : "Fetch Train Details"}
                  </button>
                </div>

                {train && (
                  <article className="info" style={{ background: 'rgba(30, 64, 175, 0.04)', padding: '16px', borderRadius: '16px', border: '1px solid rgba(30, 64, 175, 0.1)', marginTop: '16px' }}>
                    <h3 style={{ color: '#1e3a8a', margin: '0 0 8px 0', fontSize: '1.1rem', fontWeight: 'bold' }}>
                      🚂 {train.trainName} ({train.trainNumber})
                    </h3>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '10px', fontSize: '0.9rem', color: '#475569' }}>
                      <div><strong>Route:</strong> {train.origin} ➔ {train.destination}</div>
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
          </section>

          <section className="card" style={{ background: '#ffffff', borderRadius: '24px', border: '1px solid #e2e8f0', boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.05)', padding: '24px', marginBottom: '24px' }}>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 'bold', color: '#0f172a', marginBottom: '16px', fontFamily: "'Sora', sans-serif" }}>Luggage Details</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '20px' }}>
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
              <p style={{ color: '#b45309', fontSize: '0.85rem', fontWeight: 'bold', marginTop: '10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                ⚖️ Classed as Heavy Luggage (+Rs 10 extra charge applied)
              </p>
            )}
            {luggageWeight > 0 && luggageWeight <= 10 && (
              <p style={{ color: '#15803d', fontSize: '0.85rem', fontWeight: 'bold', marginTop: '10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                ⚖️ Classed as Light Luggage (no extra charge)
              </p>
            )}
          </section>

          <section className="card" style={{ background: '#ffffff', borderRadius: '24px', border: '1px solid #e2e8f0', boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.05)', padding: '24px', marginBottom: '24px' }}>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 'bold', color: '#0f172a', marginBottom: '16px', fontFamily: "'Sora', sans-serif" }}>Journey Details</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '20px', alignItems: 'flex-end' }}>
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
              <button
                disabled={busy}
                type="button"
                onClick={onFareEstimate}
                style={{
                  padding: '12px 24px',
                  borderRadius: '12px',
                  border: '1px solid #cbd5e1',
                  background: '#ffffff',
                  color: '#0f172a',
                  fontWeight: 'bold',
                  fontSize: '1rem',
                  cursor: 'pointer',
                  height: '46px',
                  transition: 'all 0.2s',
                  boxShadow: '0 4px 6px -1px rgba(0,0,0,0.03)'
                }}
                onMouseOver={(e) => { e.currentTarget.style.background = '#f1f5f9'; }}
                onMouseOut={(e) => { e.currentTarget.style.background = '#ffffff'; }}
              >
                Estimate Fare
              </button>
            </div>
            {fare !== null && (
              <p style={{ marginTop: '14px', fontSize: '1.1rem', fontWeight: 'bold', color: '#1e3a8a' }}>
                Estimated fare: Rs {fare} {isPeakHour ? "(peak hour applied)" : "(off peak)"}
              </p>
            )}
          </section>

          <section className="card confirm" style={{ background: '#ffffff', borderRadius: '24px', border: '1.5px solid #1e3a8a', boxShadow: '0 10px 25px -5px rgba(30, 58, 138, 0.08)', padding: '24px', marginBottom: '24px' }}>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 'bold', color: '#1e3a8a', marginBottom: '16px', fontFamily: "'Sora', sans-serif" }}>Confirmation Screen</h2>
            <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 20px 0', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px', fontSize: '0.95rem', color: '#334155' }}>
              <li style={{ padding: '8px 12px', background: '#f8fafc', borderRadius: '8px' }}><strong>Passengers / Seats:</strong> {passengerCount}</li>
              <li style={{ padding: '8px 12px', background: '#f8fafc', borderRadius: '8px' }}><strong>Priority assistance:</strong> {isPriorityPassenger ? "Yes ♿" : "No"}</li>
              <li style={{ padding: '8px 12px', background: '#f8fafc', borderRadius: '8px' }}><strong>Journey type:</strong> {journeyType.toUpperCase()}</li>
              <li style={{ padding: '8px 12px', background: '#f8fafc', borderRadius: '8px' }}><strong>From:</strong> {fromPlatform ? `Platform ${fromPlatform}` : (pickupPoint || "N/A")}</li>
              <li style={{ padding: '8px 12px', background: '#f8fafc', borderRadius: '8px' }}><strong>To:</strong> {toPlatform ? `Platform ${toPlatform}` : "N/A"}</li>
              <li style={{ padding: '8px 12px', background: '#f8fafc', borderRadius: '8px' }}><strong>Luggage:</strong> {luggageWeight > 0 ? `${luggageWeight} kg (${luggageWeight > 10 ? 'Heavy' : 'Light'})` : 'No luggage'}</li>
              <li style={{ padding: '8px 12px', background: '#eff6ff', borderRadius: '8px', color: '#1e40af', fontWeight: 'bold' }}><strong>Secure Fare:</strong> {fare === null ? "Estimate pending" : `Rs ${fare}`}</li>
            </ul>
            <button
              disabled={busy}
              type="button"
              onClick={onConfirmBooking}
              style={{
                width: '100%',
                padding: '14px 24px',
                borderRadius: '12px',
                border: 'none',
                background: 'linear-gradient(135deg, #1d4ed8, #1e40af)',
                color: '#ffffff',
                fontWeight: 'bold',
                fontSize: '1rem',
                cursor: 'pointer',
                transition: 'all 0.2s',
                boxShadow: '0 8px 20px -6px rgba(29, 78, 216, 0.4)'
              }}
              onMouseOver={(e) => { e.currentTarget.style.transform = 'translateY(-1px)'; }}
              onMouseOut={(e) => { e.currentTarget.style.transform = 'none'; }}
            >
              Confirm Booking
            </button>

            {booking && (
              <article className="success" style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', padding: '16px', borderRadius: '16px', marginTop: '20px' }}>
                <h3 style={{ color: '#166534', margin: '0 0 6px 0', fontSize: '1rem', fontWeight: 'bold' }}>✓ Booking Confirmed</h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '8px', fontSize: '0.85rem', color: '#166534' }}>
                  <p><strong>Token ID:</strong> {booking.bookingId}</p>
                  <p><strong>Vehicle:</strong> {booking.vehicleNumber}</p>
                  <p><strong>Allocated Seats:</strong> {booking.seatNumbers.length ? booking.seatNumbers.join(", ") : "Allocating..."}</p>
                  <p><strong>Scheduled Time:</strong> {new Date(booking.scheduledTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                </div>
              </article>
            )}
          </section>


          <section className="card">
            <h2>My Bookings</h2>
            {bookingHistory.length === 0 ? (
              <p>No bookings yet.</p>
            ) : (
              <div className="history" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '20px' }}>
                {bookingHistory.map((item: any) => (
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
                      <strong className="booking-token" style={{ fontSize: '1.05rem', color: '#1a3a6b' }}>{item.bookingId}</strong>
                      <span style={{
                        padding: '4px 10px',
                        borderRadius: '12px',
                        fontSize: '0.75rem',
                        fontWeight: 'bold',
                        background: item.rideStatus === 'pending' ? '#ffe0b2' : item.rideStatus === 'completed' ? '#c8e6c9' : item.rideStatus === 'cancelled' ? '#ffcdd2' : '#bbdefb',
                        color: item.rideStatus === 'pending' ? '#e65100' : item.rideStatus === 'completed' ? '#2e7d32' : item.rideStatus === 'cancelled' ? '#c62828' : '#1565c0'
                      }}>{item.rideStatus.toUpperCase()}</span>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', fontSize: '0.85rem', marginBottom: '12px', color: '#5a6f8c' }}>
                      <div><strong>🚗 BOV:</strong> {item.bovVehicleNumber || "Allocating..."}</div>
                      <div><strong>💺 Seats:</strong> {item.seatNumbers?.length ? item.seatNumbers.join(", ") : item.seats}</div>
                      <div><strong>💰 Fare:</strong> Rs {item.fare}</div>
                      <div><strong>⏰ Time:</strong> {new Date(item.scheduledTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                    </div>

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
                          <span>⏳ Waitlist Position:</span>
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

                    {/* Interactive SVG Wayfinding Map */}
                    {item.rideStatus === 'in-progress' && (
                      <div style={{
                        background: '#0d1e36',
                        border: '1px solid #163765',
                        borderRadius: '8px',
                        padding: '16px',
                        marginTop: '12px',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center'
                      }}>
                        <span style={{ fontSize: '0.8rem', fontWeight: 'bold', color: '#1565c0', marginBottom: '8px', alignSelf: 'flex-start' }}>🗺️ Station Wayfinding HUD</span>
                        <svg viewBox="0 0 300 220" style={{ width: '100%', height: 'auto', background: '#0b1626', borderRadius: '6px', border: '1px solid #1b2e46' }}>
                          {/* Station Tracks / Platforms */}
                          <line x1="120" y1="30" x2="280" y2="30" stroke="#1f3754" strokeWidth="6" strokeLinecap="round" />
                          <line x1="120" y1="70" x2="280" y2="70" stroke="#1f3754" strokeWidth="6" strokeLinecap="round" />
                          <line x1="120" y1="110" x2="280" y2="110" stroke="#1f3754" strokeWidth="6" strokeLinecap="round" />
                          <line x1="120" y1="150" x2="280" y2="150" stroke="#1f3754" strokeWidth="6" strokeLinecap="round" />
                          <line x1="120" y1="190" x2="280" y2="190" stroke="#1f3754" strokeWidth="6" strokeLinecap="round" />

                          {/* Platform Labels */}
                          <text x="270" y="24" fill="#6a7d97" fontSize="8" fontWeight="bold">PF 1</text>
                          <text x="270" y="64" fill="#6a7d97" fontSize="8" fontWeight="bold">PF 2</text>
                          <text x="270" y="104" fill="#6a7d97" fontSize="8" fontWeight="bold">PF 3</text>
                          <text x="270" y="144" fill="#6a7d97" fontSize="8" fontWeight="bold">PF 4</text>
                          <text x="270" y="184" fill="#6a7d97" fontSize="8" fontWeight="bold">PF 5</text>

                          {/* Entrance lobby */}
                          <rect x="15" y="110" width="60" height="60" rx="6" fill="#1b2a47" stroke="#374f76" strokeWidth="1" />
                          <text x="45" y="145" fill="#a5b8d0" fontSize="8" fontWeight="bold" textAnchor="middle">ENTRANCE</text>

                          {/* Dotted Connection walkways */}
                          <path d="M75,140 Q100,140 120,30" fill="none" stroke="#2c4770" strokeWidth="2" strokeDasharray="3,3" />
                          <path d="M75,140 Q100,140 120,70" fill="none" stroke="#2c4770" strokeWidth="2" strokeDasharray="3,3" />
                          <path d="M75,140 Q100,140 120,110" fill="none" stroke="#2c4770" strokeWidth="2" strokeDasharray="3,3" />
                          <path d="M75,140 Q100,140 120,150" fill="none" stroke="#2c4770" strokeWidth="2" strokeDasharray="3,3" />
                          <path d="M75,140 Q100,140 120,190" fill="none" stroke="#2c4770" strokeWidth="2" strokeDasharray="3,3" />

                          {/* Buggy coordinates generator */}
                          {(() => {
                            const curPlat = activeLocations[item.bookingId] || 'Entrance';
                            let bx = 45;
                            let by = 130;
                            if (curPlat.includes('Platform 1')) { bx = 160; by = 30; }
                            else if (curPlat.includes('Platform 2')) { bx = 160; by = 70; }
                            else if (curPlat.includes('Platform 3')) { bx = 160; by = 110; }
                            else if (curPlat.includes('Platform 4')) { bx = 160; by = 150; }
                            else if (curPlat.includes('Platform 5')) { bx = 160; by = 190; }
                            else if (curPlat === 'Arrived') {
                              const dPlat = item.toPlatform || 'Platform 4';
                              if (dPlat.includes('1')) { bx = 220; by = 30; }
                              else if (dPlat.includes('2')) { bx = 220; by = 70; }
                              else if (dPlat.includes('3')) { bx = 220; by = 110; }
                              else if (dPlat.includes('4')) { bx = 220; by = 150; }
                              else if (dPlat.includes('5')) { bx = 220; by = 190; }
                            }

                            return (
                              <g>
                                <circle cx={bx} cy={by} r="10" fill="rgba(21, 101, 192, 0.4)">
                                  <animate attributeName="r" values="8;14;8" dur="1.5s" repeatCount="indefinite" />
                                </circle>
                                <circle cx={bx} cy={by} r="5" fill="#1565c0" stroke="#ffffff" strokeWidth="1.5" />
                                <text x={bx} y={by - 10} fill="#ffffff" fontSize="6" fontWeight="bold" textAnchor="middle">🛒 BUGGY</text>
                              </g>
                            );
                          })()}
                        </svg>
                      </div>
                    )}

                    {/* Live Tracker progress bar for in-progress rides */}
                    {item.rideStatus === 'in-progress' && (
                      <div style={{
                        background: 'rgba(21, 101, 192, 0.05)',
                        border: '1px solid rgba(21, 101, 192, 0.2)',
                        borderRadius: '8px',
                        padding: '12px',
                        marginTop: '10px'
                      }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', color: '#1565c0', fontSize: '0.82rem', marginBottom: '8px' }}>
                          <span>📍 Live Tracker:</span>
                          <span>{activeLocations[item.bookingId] || 'Departing...'}</span>
                        </div>

                        {/* Tracker Visual Dots */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', position: 'relative', marginTop: '10px', padding: '0 10px' }}>
                          {/* Line background */}
                          <div style={{ position: 'absolute', top: '8px', left: '10px', right: '10px', height: '4px', background: '#cfd8dc', zIndex: 1 }}></div>

                          {/* Active Line Progress overlay */}
                          {(() => {
                            const steps = ['Entrance', 'Platform 1', 'Platform 2', 'Platform 3', 'Platform 4', 'Platform 5', 'Arrived'];
                            const currStep = activeLocations[item.bookingId] || 'Entrance';
                            const stepIdx = steps.indexOf(currStep);
                            const widthPercent = (stepIdx / (steps.length - 1)) * 100;
                            return (
                              <div style={{
                                position: 'absolute',
                                top: '8px',
                                left: '10px',
                                width: `calc(${widthPercent}% - 20px)`,
                                height: '4px',
                                background: '#1565c0',
                                zIndex: 2,
                                transition: 'all 0.5s ease'
                              }}></div>
                            );
                          })()}

                          {/* Dots */}
                          {['Entrance', 'Plat 1-2', 'Plat 3-4', 'Plat 5', 'Arrived'].map((lbl, idx) => {
                            const steps = ['Entrance', 'Platform 1', 'Platform 2', 'Platform 3', 'Platform 4', 'Platform 5', 'Arrived'];
                            const currStep = activeLocations[item.bookingId] || 'Entrance';
                            const stepIdx = steps.indexOf(currStep);

                            let isActive = false;
                            if (idx === 0) isActive = true;
                            else if (idx === 1 && (currStep.includes('Platform 1') || currStep.includes('Platform 2'))) isActive = true;
                            else if (idx === 2 && (currStep.includes('Platform 3') || currStep.includes('Platform 4'))) isActive = true;
                            else if (idx === 3 && currStep.includes('Platform 5')) isActive = true;
                            else if (idx === 4 && currStep === 'Arrived') isActive = true;

                            if (idx === 1 && stepIdx >= 1) isActive = true;
                            if (idx === 2 && stepIdx >= 3) isActive = true;
                            if (idx === 3 && stepIdx >= 5) isActive = true;
                            if (idx === 4 && stepIdx === 6) isActive = true;

                            return (
                              <div key={lbl} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', zIndex: 3 }}>
                                <div style={{
                                  width: '18px',
                                  height: '18px',
                                  borderRadius: '50%',
                                  background: isActive ? '#1565c0' : '#cfd8dc',
                                  border: '2px solid #fff',
                                  transition: 'all 0.3s ease'
                                }}></div>
                                <span style={{ fontSize: '0.6rem', marginTop: '4px', color: isActive ? '#1565c0' : '#78909c', fontWeight: 'bold' }}>{lbl}</span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* SOS Panic Button */}
                    {(item.rideStatus === 'confirmed' || item.rideStatus === 'in-progress') && (
                      <button
                        onClick={() => triggerSos(item.bookingId, item.fromPlatform || item.toPlatform)}
                        style={{
                          background: 'linear-gradient(135deg, #d32f2f, #b71c1c)',
                          color: 'white',
                          border: 'none',
                          padding: '8px 14px',
                          borderRadius: '8px',
                          cursor: 'pointer',
                          fontWeight: 'bold',
                          fontSize: '0.85rem',
                          marginTop: '12px',
                          width: '100%',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '6px',
                          boxShadow: '0 4px 12px rgba(211, 47, 47, 0.3)',
                          transition: 'all 0.2s ease'
                        }}
                      >
                        🚨 EMERGENCY SOS PANIC
                      </button>
                    )}
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
