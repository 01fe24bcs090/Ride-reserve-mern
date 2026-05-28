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

  const { rides, loading: ridesLoading, error: ridesError } = useDriverRides(user?.uid);

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
      setStatus("Login failed: " + (e.response?.data?.error || e.message));
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
      localStorage.setItem('token', data.token);
      setUser(data.user);
      setStatus("Signup successful.");
    } catch (e: any) {
      setStatus("Signup failed: " + (e.response?.data?.error || e.message));
    } finally {
      setAuthBusy(false);
    }
  }

  async function handleLogout() {
    localStorage.removeItem('token');
    setUser(null);
    setStatus("Signed out.");
  }

  async function acceptRide(bookingId: string) {
    if (!user) return;
    setStatus(`Accepting ride...`);
    try {
      // In a real app we might pass the driver's bovId here or the backend figures it out
      await api.patch(`/bookings/${bookingId}`, {
        rideStatus: "confirmed",
        acceptedBy: user.uid,
      });
      setStatus("Ride accepted!");
    } catch (e: any) { 
      setStatus("Error: " + (e.response?.data?.error || e.message)); 
    }
  }

  async function updateStatus(bookingId: string, newStatus: RideStatus) {
    try {
      await api.patch(`/bookings/${bookingId}`, { rideStatus: newStatus });
      setStatus(`Status updated to ${newStatus}.`);
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

  const sortedRides = [...rides].sort((a: any, b: any) => {
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
      <div className="page page-auth">
        <section className="auth-shell" style={{ gridTemplateColumns: '1fr', maxWidth: '560px', margin: '0 auto' }}>
          <section className="auth-card" style={{ padding: '0', overflow: 'hidden' }}>
            {/* Header */}
            <div className="staff-header">
              <div className="staff-header-icon">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                </svg>
              </div>
              <p className="eyebrow auth-card-eyebrow" style={{ color: '#a5b8d0' }}>Ride Reserve</p>
              <h2 style={{ color: '#fff', margin: '4px 0 6px' }}>Staff Portal</h2>
              <p style={{ color: '#8fa8c8', margin: 0, fontSize: '0.92rem' }}>
                Secure access for Administrators and Drivers
              </p>
            </div>

            {/* Form Area */}
            <div className="staff-form-area">
              <div className="staff-active-role-badge">
                <span className="staff-role-dot driver"></span>
                {isSignup ? 'Creating Driver Account' : 'Logging in as Driver'}
              </div>

              <form className="auth-form" onSubmit={isSignup ? handleSignup : handleLogin} style={{ marginTop: '16px' }}>
                {isSignup && (
                  <>
                    <label>
                      Full Name
                      <input
                        type="text"
                        value={authName}
                        onChange={(e) => setAuthName(e.target.value)}
                        placeholder="Arjun Sharma"
                        required
                      />
                    </label>
                    <label>
                      Aadhar Card Image (JPG)
                      <input
                        type="file"
                        accept="image/jpeg, image/jpg"
                        onChange={handleAadharUpload}
                        required={!aadharNumber}
                      />
                    </label>
                    {aadharNumber && (
                      <label>
                        Extracted Aadhar Number
                        <input
                          type="text"
                          value={aadharNumber}
                          onChange={(e) => setAadharNumber(e.target.value)}
                          placeholder="1234 5678 9012"
                          required
                        />
                      </label>
                    )}
                  </>
                )}
                <label>
                  Driver Email
                  <input
                    type="email"
                    value={authEmail}
                    onChange={(e) => setAuthEmail(e.target.value)}
                    placeholder="driver@ridereserve.com"
                    required
                  />
                </label>
                <label>
                  Password
                  <input
                    type="password"
                    value={authPassword}
                    onChange={(e) => setAuthPassword(e.target.value)}
                    placeholder="••••••••"
                    required
                  />
                </label>

                <button className="cta auth-submit" type="submit" disabled={authBusy}
                  style={{ background: 'linear-gradient(135deg, #e65100, #ff6f1d)' }}>
                  {authBusy
                    ? (isSignup ? "Creating account..." : "Verifying credentials...")
                    : (isSignup ? "Create Driver Account" : "Login to Driver Dashboard")
                  }
                </button>

                <div style={{ textAlign: 'center', marginTop: '1.2rem' }}>
                  <button
                    type="button"
                    className="link-btn"
                    style={{ color: '#e65100', fontSize: '0.9rem', fontWeight: 600 }}
                    onClick={() => { setIsSignup(!isSignup); setStatus(""); }}
                  >
                    {isSignup ? "Already have a driver account? Login here" : "New driver? Create an account here"}
                  </button>
                </div>

                {status && <p className="status auth-status">{status}</p>}
              </form>

              <div className="staff-info-box">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10"/>
                  <line x1="12" y1="16" x2="12" y2="12"/>
                  <line x1="12" y1="8" x2="12.01" y2="8"/>
                </svg>
                <span>Driver accounts handle ride status updates and BOV operations.</span>
              </div>
            </div>

            {/* Footer */}
            <div className="staff-footer">
              <p className="auth-footer-note" style={{ margin: 0, textAlign: 'center', fontSize: '0.9rem', color: '#5a6f8c' }}>
                Not a staff member?{' '}
                <a href="http://localhost:5173" className="link-btn" style={{ color: '#e65100', fontWeight: '600', textDecoration: 'none' }}>
                  Back to Passenger Booking
                </a>
              </p>
            </div>
          </section>
        </section>
      </div>
    );
  }

  const statusClass = (s: RideStatus) => {
    if (s === "confirmed") return "status-chip confirmed";
    if (s === "in-progress") return "status-chip progress";
    if (s === "completed") return "status-chip complete";
    return "status-chip";
  };

  return (
    <div className="page">
      <header className="hero">
        <p className="eyebrow">SmartBOV</p>
        <h1>Driver Dashboard</h1>
        <div className="hero-inline">
          <span className="hero-tag">{user.email}</span>
          <span className="hero-tag">Marketplace Active</span>
        </div>
        <div style={{ marginTop: '1rem' }}>
          <button className="secondary" onClick={handleLogout}>Sign Out</button>
        </div>
      </header>

      <div className="cards">
        <article className="metric"><h2>{sortedRides.filter((r: any) => r.acceptedBy === user.uid).length}</h2><p>My Active Rides</p></article>
        <article className="metric"><h2>{sortedRides.filter((r: any) => r.rideStatus === "pending").length}</h2><p>Available in Market</p></article>
      </div>

      <section className="table-card">
        <h2>Ride Queue</h2>
        {ridesError && <p className="status error" style={{ color: '#ff4d4f' }}>Error loading rides: {ridesError}</p>}
        {ridesLoading ? <p>Loading rides...</p> : (
          <table>
            <thead><tr><th>ID</th><th>Passenger</th><th>Route</th><th>Seats</th><th>Status</th><th>Actions</th></tr></thead>
            <tbody>
              {sortedRides.map((r: any) => (
                <tr key={r.bookingId} style={r.isPriorityPassenger && r.rideStatus === 'pending' ? {
                  background: 'rgba(211, 47, 47, 0.08)',
                  boxShadow: 'inset 4px 0 0 #d32f2f'
                } : {}}>
                  <td>{r.bookingId}</td>
                  <td>
                    {r.passengerName}
                    {r.isPriorityPassenger && (
                      <span className="priority-badge" style={{
                        background: 'linear-gradient(135deg, #d32f2f, #f44336)',
                        color: 'white',
                        padding: '2px 6px',
                        borderRadius: '4px',
                        fontSize: '0.72rem',
                        fontWeight: 'bold',
                        marginLeft: '8px',
                        display: 'inline-flex',
                        alignItems: 'center',
                        boxShadow: '0 2px 6px rgba(211, 47, 47, 0.3)'
                      }}>
                        ♿ PRIORITY
                      </span>
                    )}
                    {r.isSharedRide && (
                      <span className="shared-badge" style={{
                        background: 'linear-gradient(135deg, #0288d1, #03a9f4)',
                        color: 'white',
                        padding: '2px 6px',
                        borderRadius: '4px',
                        fontSize: '0.72rem',
                        fontWeight: 'bold',
                        marginLeft: '8px',
                        display: 'inline-flex',
                        alignItems: 'center',
                        boxShadow: '0 2px 6px rgba(2, 136, 209, 0.3)'
                      }}>
                        👥 SHARED
                      </span>
                    )}
                  </td>
                  <td>{r.fromPlatform} → {r.toPlatform}</td>
                  <td>{r.seats}</td>
                  <td><span className={statusClass(r.rideStatus)}>{r.rideStatus}</span></td>
                  <td className="actions">
                    {r.rideStatus === "pending" ? (
                      <button className="action-start" onClick={() => acceptRide(r.bookingId)}>Accept</button>
                    ) : r.rideStatus === "confirmed" ? (
                      <button className="action-start" onClick={() => updateStatus(r.bookingId, "in-progress")}>Start</button>
                    ) : r.rideStatus === "in-progress" ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        <select 
                          onChange={(e) => handleLocationChange(r.bookingId, e.target.value)}
                          defaultValue=""
                          style={{ padding: '6px', fontSize: '0.82rem', borderRadius: '4px', border: '1px solid #ff6f1d', background: '#fff3e0', color: '#e65100', fontWeight: 'bold' }}
                        >
                          <option value="" disabled>📍 Stream Platform...</option>
                          <option value="Entrance">Entrance</option>
                          <option value="Platform 1">Platform 1</option>
                          <option value="Platform 2">Platform 2</option>
                          <option value="Platform 3">Platform 3</option>
                          <option value="Platform 4">Platform 4</option>
                          <option value="Platform 5">Platform 5</option>
                          <option value="Arrived">Arrived</option>
                        </select>
                        <div style={{ display: 'flex', gap: '4px' }}>
                          <button className="action-complete" onClick={() => updateStatus(r.bookingId, "completed")} style={{ flex: 1 }}>Complete</button>
                          <button 
                            onClick={() => triggerDriverSos(r.bookingId, r.passengerName, r.fromPlatform)}
                            style={{
                              background: 'linear-gradient(135deg, #d32f2f, #c62828)',
                              color: 'white',
                              border: 'none',
                              padding: '6px 10px',
                              borderRadius: '9px',
                              cursor: 'pointer',
                              fontWeight: 'bold',
                              fontSize: '0.82rem'
                            }}
                          >
                            🚨 SOS
                          </button>
                        </div>
                      </div>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
      {status && <p className="status">{status}</p>}
    </div>
  );
}
