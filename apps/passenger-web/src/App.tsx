import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  createBooking,
  getFareEstimate,
  lookupTrain,
  subscribeToPassengerBookings,
  type BookingHistoryItem,
} from "./lib/api";
import {
  loadPassengerProfile,
  signInPassenger,
  signOutPassenger,
  signUpPassenger,
  subscribeToAuthChanges,
  type PassengerProfile,
} from "./lib/auth";
import { pickupPoints, platformOptions } from "./lib/mockData";
import { firebaseReady } from "./lib/firebase";

import { JourneyType, LuggageType, UserRole, UserDoc as Profile, TrainDoc as TrainInfo } from "@ride-reserve/types";

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
  const [luggageType, setLuggageType] = useState<LuggageType>("none");
  const [seats, setSeats] = useState(1);

  const [train, setTrain] = useState<TrainInfo | null>(null);
  const [fare, setFare] = useState<number | null>(null);
  const [isPeakHour, setIsPeakHour] = useState(false);
  const [booking, setBooking] = useState<BookingResult | null>(null);

  const busy = authBusy || bookingBusy;
  const status = authStatus || bookingStatus;
  const setStatus = (msg: string) => {
    if (authBusy) setAuthStatus(msg);
    else setBookingStatus(msg);
  };

  const selectedRoleOption = roleOptions.find((role) => role.value === selectedRole)!;
  const isPassengerRole = selectedRole === "passenger";
  const fromPlatform = train?.platformNumber ?? "";

  useEffect(() => {
    if (!isPassengerRole && authMode === "signup") {
      setAuthMode("login");
    }
  }, [authMode, isPassengerRole]);

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
      } else {
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
      setFare(response.fare);
      setIsPeakHour(Boolean(response.isPeakHour));
      if (journeyType === "departure" && train) {
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
    if (!toPlatform.trim()) {
      setStatus("Select destination platform.");
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
        luggageType,
        isPriorityPassenger,
      });
      setBooking(result);
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
    <div className={sessionReady ? "page" : "page page-auth"}>
      {!firebaseReady && (
        <div className="warning-banner" style={{ backgroundColor: '#ff4d4f', color: 'white', padding: '10px', textAlign: 'center', fontWeight: 'bold', position: 'sticky', top: 0, zIndex: 1000 }}>
          ⚠️ Firebase Configuration Missing: Please set your VITE_FIREBASE_* environment variables.
        </div>
      )}
      {!sessionReady ? (
        <section className="auth-shell">
          <article className="auth-spotlight">
            <p className="eyebrow">Ride Reserve</p>
            <h1>Smart station rides for passengers, drivers, and railway operations.</h1>
            <p className="subtitle">
              Book platform transfer rides, check train-linked fares, manage driver movement, and monitor station transport from one connected system.
            </p>

            <div className="auth-stats">
              <article>
                <strong>Fast</strong>
                <span>Booking in minutes</span>
              </article>
              <article>
                <strong>Live</strong>
                <span>Driver ride updates</span>
              </article>
              <article>
                <strong>24/7</strong>
                <span>Station mobility support</span>
              </article>
            </div>

            <div className="auth-badges">
              <span className="meta-pill">Platform transfers</span>
              <span className="meta-pill">Train fare lookup</span>
              <span className="meta-pill">Driver dispatch</span>
            </div>

            <div className="auth-highlight-card">
              <p className="auth-highlight-label">{selectedRoleOption.label} services</p>
              <h3>{selectedRoleOption.helper}</h3>
              <p>{selectedRoleOption.description}</p>
              <ul className="auth-points">
                {(roleHighlights[selectedRole] ?? []).map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          </article>

          <section className="auth-card">
            <p className="eyebrow auth-card-eyebrow">Secure entry</p>
            <h2>
              {isPassengerRole
                ? authMode === "login"
                  ? "Passenger Login"
                  : "Passenger Signup"
                : `${selectedRoleOption.label} Portal Access`}
            </h2>
            <p className="auth-copy">
              {isPassengerRole
                ? authMode === "login"
                  ? "Existing passengers can log in and book rides ."
                  : "New passengers can create an account before entering the booking flow."
                : `This passenger app is live with Firebase first. ${selectedRoleOption.label} accounts should continue in the dedicated ${selectedRoleOption.label.toLowerCase()} portal.`}
            </p>

            <div className="auth-mode-toggle">
              <button
                type="button"
                className={authMode === "login" ? "auth-mode-btn active" : "auth-mode-btn"}
                onClick={() => setAuthMode("login")}
              >
                Login
              </button>
              <button
                type="button"
                className={authMode === "signup" ? "auth-mode-btn active" : "auth-mode-btn"}
                onClick={() => setAuthMode("signup")}
              >
                Sign up
              </button>
            </div>

            <form className="auth-form" onSubmit={startSession}>
              {authMode === "signup" && (
                <label>
                  Full Name
                  <input
                    value={profile.name}
                    onChange={(event) => setProfile((prev) => ({ ...prev, name: event.target.value }))}
                    placeholder="Full name"
                  />
                </label>
              )}

              <label>
                Email
                <input
                  type="email"
                  value={profile.email}
                  onChange={(event) => setProfile((prev) => ({ ...prev, email: event.target.value }))}
                  placeholder="name@example.com"
                />
              </label>

              {isPassengerRole && authMode === "signup" && (
                <label>
                  Phone Number
                  <input
                    value={profile.phone}
                    onChange={(event) => setProfile((prev) => ({ ...prev, phone: event.target.value }))}
                    placeholder="+91..."
                  />
                </label>
              )}

              {authMode === "signup" ? (
                <label>
                  Age
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    value={profile.age}
                    onChange={(event) => {
                      const val = event.target.value.replace(/[^0-9]/g, "");
                      if (val === "" || (Number(val) >= 1 && Number(val) <= 120)) {
                        setProfile((prev) => ({ ...prev, age: val }));
                      }
                    }}
                    placeholder="Age"
                  />
                </label>
              ) : (
                <label>
                  Password
                  <input
                    type="password"
                    value={authSecret}
                    onChange={(event) => setAuthSecret(event.target.value)}
                    placeholder="Enter password"
                  />
                </label>
              )}

              {authMode === "signup" && (
                <label>
                  Password
                  <input
                    type="password"
                    value={authSecret}
                    onChange={(event) => setAuthSecret(event.target.value)}
                    placeholder="Create a password"
                  />
                </label>
              )}

              <button className="cta auth-submit" type="submit">
                {authMode === "login"
                  ? "Login as Passenger"
                  : "Create Passenger Account"}
              </button>

              {status && <p className="status auth-status">{status}</p>}
            </form>

            <p className="auth-footer-note">
              {authMode === "login"
                ? "New passenger? Switch to Sign up first."
                : "Already registered? Switch back to Login."}
            </p>
            <div className="staff-portal-link">
              <p className="auth-footer-note">
                Are you a Driver or Admin? <button type="button" className="link-btn" onClick={() => window.location.href = '/staff-login'}>Click here for Staff Login</button>
              </p>
            </div>
            {!authResolved && <p className="auth-footer-note">Checking your Firebase session...</p>}
          </section>
        </section>
      ) : (
        <>
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

          <section className="card">
            <h2>Trip Basics</h2>
            <div className="grid">
              <label>
                Number of Passengers
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={passengerCount || ""}
                  onChange={(event) => {
                    const val = event.target.value.replace(/[^0-9]/g, "");
                    if (val === "") {
                      setPassengerCount(0);
                    } else {
                      const num = Number(val);
                      if (num > 5) {
                        setStatus("Cannot book with more than 5 passengers.");
                        setPassengerCount(1);
                      } else {
                        setPassengerCount(num);
                      }
                    }
                  }}
                  onBlur={() => {
                    if (passengerCount < 1) setPassengerCount(1);
                  }}
                />
              </label>
              <label>
                Number of Seats
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={seats || ""}
                  onChange={(event) => {
                    const val = event.target.value.replace(/[^0-9]/g, "");
                    if (val === "") {
                      setSeats(0);
                    } else {
                      const num = Number(val);
                      if (num > 5) {
                        setStatus("Cannot book with more than 5 seats.");
                        setSeats(1);
                      } else {
                        setSeats(num);
                      }
                    }
                  }}
                  onBlur={() => {
                    if (seats < 1) setSeats(1);
                  }}
                />
              </label>
              <label>
                Journey Type
                <select
                  value={journeyType}
                  onChange={(event) => setJourneyType(event.target.value as JourneyType)}
                >
                  <option value="arrival">Arrival</option>
                  <option value="departure">Departure</option>
                </select>
              </label>
              <label className="checkbox">
                <input
                  type="checkbox"
                  checked={isPriorityPassenger}
                  onChange={(event) => setIsPriorityPassenger(event.target.checked)}
                />
                Elderly / PwD priority required
              </label>
            </div>
          </section>

          <section className="card">
            <h2>Train Lookup</h2>
            <div className="grid">
              <label>
                Train Number
                <input
                  value={trainNumber}
                  onChange={(event) => setTrainNumber(event.target.value)}
                  placeholder="Train No."
                />
              </label>
              <button disabled={busy} className="secondary" type="button" onClick={onTrainLookup}>
                Fetch Train
              </button>
            </div>

            {train && (
              <article className="info">
                <h3>
                  {train.trainName} ({train.trainNumber})
                </h3>
                <p>
                  {train.origin} to {train.destination}
                </p>
                <p>
                  Platform {train.platformNumber} | Arrival: {train.scheduledArrival ?? "N/A"} | Departure:{" "}
                  {train.scheduledDeparture ?? "N/A"}
                </p>
              </article>
            )}
          </section>

          {journeyType === "departure" && (
            <section className="card">
              <h2>Luggage Details</h2>
              <div className="grid">
                <label>
                  Luggage Type
                  <select
                    value={luggageType}
                    onChange={(event) => setLuggageType(event.target.value as LuggageType)}
                  >
                    <option value="none">None</option>
                    <option value="light">Light</option>
                    <option value="heavy">Heavy</option>
                  </select>
                </label>
              </div>
            </section>
          )}

          {journeyType === "arrival" && (
            <section className="card">
              <h2>Arrival Luggage</h2>
              <label>
                Luggage
                <select
                  value={luggageType}
                  onChange={(event) => setLuggageType(event.target.value as LuggageType)}
                >
                  <option value="none">None</option>
                  <option value="light">Light</option>
                  <option value="heavy">Heavy</option>
                </select>
              </label>
            </section>
          )}

          <section className="card">
            <h2>Journey Details</h2>
            <div className="grid">
              {journeyType === "departure" ? (
                <>
                  <label>
                    Source (Pickup Point)
                    <select value={pickupPoint} onChange={(event) => setPickupPoint(event.target.value)}>
                      <option value="">Select pickup point</option>
                      {pickupPoints.map((point) => (
                        <option key={point} value={point}>
                          {point}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Destination (Train Platform)
                    <input value={toPlatform} readOnly placeholder="Auto from train lookup" />
                  </label>
                </>
              ) : (
                <>
                  <label>
                    Source (Train Platform)
                    <input value={fromPlatform} readOnly placeholder="Auto from train lookup" />
                  </label>
                  <label>
                    Destination Platform
                    <select value={toPlatform} onChange={(event) => setToPlatform(event.target.value)}>
                      <option value="">Select destination platform</option>
                      {platformOptions
                        .filter((platform) => platform !== fromPlatform)
                        .map((platform) => (
                          <option key={platform} value={platform}>
                            Platform {platform}
                          </option>
                        ))}
                    </select>
                  </label>
                </>
              )}
              <button disabled={busy} className="secondary" type="button" onClick={onFareEstimate}>
                Estimate Fare
              </button>
            </div>
            {fare !== null && (
              <p className="fare">
                Estimated fare: Rs {fare} {isPeakHour ? "(peak hour applied)" : "(off peak)"}
              </p>
            )}
          </section>

          <section className="card confirm">
            <h2>Confirmation Screen</h2>
            <ul>
              <li>Passengers: {passengerCount}</li>
              <li>Priority flag: {isPriorityPassenger ? "Yes" : "No"}</li>
              <li>Journey: {journeyType}</li>
              <li>From platform: {fromPlatform || "N/A"}</li>
              <li>To platform: {toPlatform || "N/A"}</li>
              <li>Luggage: {luggageType}</li>
              <li>Fare: {fare === null ? "Estimate pending" : `Rs ${fare}`}</li>
            </ul>
            <button disabled={busy} className="cta" type="button" onClick={onConfirmBooking}>
              Confirm Booking
            </button>

            {booking && (
              <article className="success">
                <h3>Booking Confirmed</h3>
                <p>Token: {booking.bookingId}</p>
                <p>BOV: {booking.vehicleNumber}</p>
                <p>Seats: {booking.seatNumbers.join(", ")}</p>
                <p>Pickup Time: {new Date(booking.scheduledTime).toLocaleString()}</p>
              </article>
            )}
          </section>

          <section className="card">
            <h2>My Bookings</h2>
            {bookingHistory.length === 0 ? (
              <p>No bookings yet.</p>
            ) : (
              <div className="history">
                {bookingHistory.map((item) => (
                  <article key={item.bookingId} className="history-item">
                    <strong className="booking-token">{item.bookingId}</strong>
                    <span>{item.bovVehicleNumber}</span>
                    <span>Seats: {item.seatNumbers.join(", ")}</span>
                    <span>Fare: Rs {item.fare}</span>
                    <span>Status: {item.rideStatus}</span>
                    <span>{new Date(item.scheduledTime).toLocaleString()}</span>
                  </article>
                ))}
              </div>
            )}
          </section>
        </>
      )}

      {sessionReady && status && <p className="status">{status}</p>}
    </div>
  );
}
