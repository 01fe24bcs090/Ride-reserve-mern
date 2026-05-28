import { useState, useEffect } from "react";
import api from "./api/client";
import { BovDoc as Bov, UserDoc as Driver, TrainDoc as Train, PeakHourDoc as PeakHour, PlatformDoc as Platform, BookingDoc as Booking, BovStatus, RideStatus } from "@ride-reserve/types";
import { useAdminData } from "./hooks/useAdminData";
import { io } from "socket.io-client";

const socketUrl = import.meta.env.VITE_API_URL ? import.meta.env.VITE_API_URL.replace("/api", "") : "http://localhost:5000";

type Tab =
  | "bovs"
  | "drivers"
  | "trains"
  | "bookings"
  | "peakHours"
  | "analytics";

export default function App() {
  const [triggerRefetch, setTriggerRefetch] = useState(0);
  const { 
    bovs, 
    drivers, 
    trains, 
    bookings, 
    peakHours, 
    loading 
  } = useAdminData(triggerRefetch);

  const [activeTab, setActiveTab] = useState<Tab>("bookings");
  const [user, setUser] = useState<any>(null);
  const [authResolved, setAuthResolved] = useState(false);
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authBusy, setAuthBusy] = useState(false);
  const [activeSos, setActiveSos] = useState<any>(null);
  const [status, setStatus] = useState("");

  const [newBov, setNewBov] = useState({ vehicleNumber: "", totalSeats: 4, currentPlatform: "" });
  const [newTrain, setNewTrain] = useState({ trainNumber: "", trainName: "", platformNumber: "", type: "arriving" as any, isActive: true });
  const [newPeak, setNewPeak] = useState({ label: "", startTime: "", endTime: "", multiplier: 1.5 });

  const forceRefetch = () => setTriggerRefetch(Date.now());

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
          } else {
            localStorage.removeItem('token');
            setStatus("Access denied. Admin only.");
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
          if (data.role === "admin") {
            setUser(data);
          } else {
            localStorage.removeItem('token');
            setStatus("Access denied. Admin only.");
          }
        } catch (e) {
          localStorage.removeItem('token');
        }
      }
      setAuthResolved(true);
    };

    initAuth();
  }, []);

  useEffect(() => {
    if (!user) return;
    const socket = io(socketUrl);

    socket.emit("join_room", "admin");

    socket.on("admin_emergency_sos", (data: any) => {
      console.log("🚨 Admin received SOS:", data);
      setActiveSos(data);
      forceRefetch();
    });

    return () => {
      socket.disconnect();
    };
  }, [user]);

  useEffect(() => {
    if (!activeSos) return;
    
    let audioCtx: AudioContext | null = null;
    let osc1: OscillatorNode | null = null;
    let osc2: OscillatorNode | null = null;
    let gainNode: GainNode | null = null;
    let intervalId: any = null;

    try {
      const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
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
        if (!audioCtx || !gainNode || !osc1 || !osc2) return;
        const now = audioCtx.currentTime;
        if (high) {
          osc1.frequency.exponentialRampToValueAtTime(880, now + 0.3);
          osc2.frequency.exponentialRampToValueAtTime(888, now + 0.3);
          gainNode.gain.linearRampToValueAtTime(0.15, now + 0.1);
        } else {
          osc1.frequency.exponentialRampToValueAtTime(440, now + 0.3);
          osc2.frequency.exponentialRampToValueAtTime(444, now + 0.3);
          gainNode.gain.linearRampToValueAtTime(0.02, now + 0.1);
        }
        high = !high;
      }, 400);

    } catch (err) {
      console.warn("Web Audio API not supported or blocked:", err);
    }

    return () => {
      if (intervalId) clearInterval(intervalId);
      try {
        if (osc1) osc1.stop();
        if (osc2) osc2.stop();
        if (audioCtx) audioCtx.close();
      } catch (e) {}
    };
  }, [activeSos]);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setAuthBusy(true);
    setStatus("Signing in...");
    try {
      const { data } = await api.post('/auth/login', { email: authEmail, password: authPassword });
      if (data.user.role === "admin") {
        localStorage.setItem('token', data.token);
        setUser(data.user);
        setStatus("Login successful.");
      } else {
        setStatus("Access denied. Admin only.");
      }
    } catch (e: any) {
      setStatus("Login failed: " + (e.response?.data?.error || e.message));
    } finally {
      setAuthBusy(false);
    }
  }

  async function handleLogout() {
    localStorage.removeItem('token');
    setUser(null);
    setStatus("Signed out.");
  }

  async function addBov() {
    if (!newBov.vehicleNumber.trim() || !newBov.currentPlatform.trim()) return;
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
    } catch (e: any) { setStatus("Error: " + (e.response?.data?.error || e.message)); }
  }

  async function updateBovAssignment(bovId: string, driverId: string | null) {
    try {
      const oldBov = bovs.find((b: any) => b.bovId === bovId);
      if (oldBov?.assignedDriverId) {
        await api.patch(`/users/${oldBov.assignedDriverId}`, { assignedBovId: null });
      }
      await api.patch(`/bovs/${bovId}`, { assignedDriverId: driverId });
      if (driverId) {
        const otherBov = bovs.find((b: any) => b.assignedDriverId === driverId && b.bovId !== bovId);
        if (otherBov) {
          await api.patch(`/bovs/${otherBov.bovId}`, { assignedDriverId: null });
        }
        await api.patch(`/users/${driverId}`, { assignedBovId: bovId });
      }
      setStatus("BOV assignment updated.");
      forceRefetch();
    } catch (e: any) { setStatus("Error: " + (e.response?.data?.error || e.message)); }
  }

  async function updateDriverAssignment(driverId: string, bovId: string | null) {
    try {
      const driver = drivers.find((d: any) => d.uid === driverId);
      if (driver?.assignedBovId) {
        await api.patch(`/bovs/${driver.assignedBovId}`, { assignedDriverId: null });
      }
      await api.patch(`/users/${driverId}`, { assignedBovId: bovId });
      if (bovId) {
        const otherDriver = drivers.find((d: any) => d.assignedBovId === bovId && d.uid !== driverId);
        if (otherDriver) {
          await api.patch(`/users/${otherDriver.uid}`, { assignedBovId: null });
        }
        await api.patch(`/bovs/${bovId}`, { assignedDriverId: driverId });
      }
      setStatus("Driver assignment updated.");
      forceRefetch();
    } catch (e: any) { setStatus("Error: " + (e.response?.data?.error || e.message)); }
  }

  async function deleteDriver(uid: string) {
    if (!window.confirm("Are you sure you want to delete this driver?")) return;
    try {
      await api.delete(`/users/${uid}`);
      setStatus("Driver deleted successfully.");
      forceRefetch();
    } catch (e: any) {
      setStatus("Error deleting driver: " + (e.response?.data?.error || e.message));
    }
  }

  async function addTrain() {
    if (!newTrain.trainNumber.trim()) return;
    try {
      await api.post('/trains', { ...newTrain });
      setNewTrain({ trainNumber: "", trainName: "", platformNumber: "", type: "arriving", isActive: true });
      setStatus("Train added.");
      forceRefetch();
    } catch (e: any) { setStatus("Error: " + (e.response?.data?.error || e.message)); }
  }

  async function delayTrain(trainNumber: string, delayMinutes: number) {
    if (delayMinutes <= 0) return;
    setStatus(`Delaying train ${trainNumber} by ${delayMinutes} mins...`);
    try {
      const { data } = await api.patch(`/trains/${trainNumber}/delay`, { delayMinutes });
      setStatus(`Train delayed successfully! Rescheduled ${data.rescheduledCount} active booking(s).`);
      forceRefetch();
    } catch (e: any) {
      setStatus("Error delaying train: " + (e.response?.data?.error || e.message));
    }
  }

  async function addPeakHour() {
    if (!newPeak.label.trim()) return;
    try {
      await api.post('/peakhours', { ...newPeak });
      setNewPeak({ label: "", startTime: "", endTime: "", multiplier: 1.5 });
      setStatus("Peak hour added.");
      forceRefetch();
    } catch (e: any) { setStatus("Error: " + (e.response?.data?.error || e.message)); }
  }

  async function deletePeakHour(id: string) {
    if (!window.confirm("Are you sure you want to delete this peak hour rule?")) return;
    try {
      await api.delete(`/peakhours/${id}`);
      setStatus("Peak hour rule deleted.");
      forceRefetch();
    } catch (e: any) {
      setStatus("Error deleting peak hour: " + (e.response?.data?.error || e.message));
    }
  }

  if (!authResolved || (user && loading)) return <div className="page">Loading Admin Dashboard...</div>;

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
                <span className="staff-role-dot admin"></span>
                Logging in as Administrator
              </div>

              <form className="auth-form" onSubmit={handleLogin} style={{ marginTop: '16px' }}>
                <label>
                  Admin Email
                  <input
                    type="email"
                    value={authEmail}
                    onChange={(e) => setAuthEmail(e.target.value)}
                    placeholder="admin@ridereserve.com"
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
                  style={{ background: 'linear-gradient(135deg, #1a3a6b, #2d6cb5)', boxShadow: '0 7px 16px rgba(26, 58, 107, 0.28)' }}>
                  {authBusy ? "Verifying credentials..." : "Login to Admin Dashboard"}
                </button>

                {status && <p className="status auth-status" style={{ marginTop: '1.2rem' }}>{status}</p>}
              </form>

              <div className="staff-info-box">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10"/>
                  <line x1="12" y1="16" x2="12" y2="12"/>
                  <line x1="12" y1="8" x2="12.01" y2="8"/>
                </svg>
                <span>Admin accounts manage BOVs, trains, bookings, peak hours, and analytics.</span>
              </div>
            </div>

            {/* Footer */}
            <div className="staff-footer">
              <p className="auth-footer-note" style={{ margin: 0, textAlign: 'center', fontSize: '0.9rem', color: '#5a6f8c' }}>
                Not a staff member?{' '}
                <a href="http://localhost:5173" className="link-btn" style={{ color: '#1a3a6b', fontWeight: '600', textDecoration: 'none' }}>
                  Back to Passenger Booking
                </a>
              </p>
            </div>
          </section>
        </section>
      </div>
    );
  }

  const bovStatusClass = (status: BovStatus) => {
    if (status === "active") return "badge success";
    if (status === "maintenance") return "badge warn";
    return "badge muted";
  };

  const rideStatusClass = (status: RideStatus) => {
    if (status === "completed") return "badge success";
    if (status === "cancelled") return "badge danger";
    if (status === "in-progress") return "badge info";
    return "badge confirm";
  };

  return (
    <div className="page">
      <header className="hero">
        <p className="eyebrow">Hubli Railway Station</p>
        <h1>Admin Mobility Dashboard</h1>
        <div className="hero-stats">
          <article><strong>{bovs.length}</strong><span>Total BOVs</span></article>
          <article><strong>{drivers.length}</strong><span>Active Drivers</span></article>
          <article><strong>{bookings.length}</strong><span>Total Bookings</span></article>
        </div>
        <div style={{ marginTop: '1rem' }}>
          <button className="secondary" onClick={handleLogout}>Sign Out</button>
        </div>
      </header>

      <nav className="tabs">
        {(
          [
            ["bookings", "Live Bookings"],
            ["bovs", "BOV Management"],
            ["drivers", "Drivers"],
            ["trains", "Trains"],
            ["peakHours", "Peak Pricing"],
            ["analytics", "Analytics"],
          ] as Array<[Tab, string]>
        ).map(([key, label]) => (
          <button
            type="button"
            key={key}
            className={activeTab === key ? "tab active" : "tab"}
            onClick={() => setActiveTab(key)}
          >
            {label}
          </button>
        ))}
      </nav>

      {activeTab === "bovs" && (
        <section className="card">
          <h2>BOV Management</h2>
          <div className="grid">
            <label>Vehicle Number<input value={newBov.vehicleNumber} onChange={e => setNewBov(prev => ({ ...prev, vehicleNumber: e.target.value }))} /></label>
            <label>Seats<input type="number" value={newBov.totalSeats} onChange={e => setNewBov(prev => ({ ...prev, totalSeats: Number(e.target.value) }))} /></label>
            <label>Platform<input value={newBov.currentPlatform} onChange={e => setNewBov(prev => ({ ...prev, currentPlatform: e.target.value }))} /></label>
          </div>
          <button className="cta" onClick={addBov}>Add BOV</button>
          <table>
            <thead><tr><th>ID</th><th>Vehicle</th><th>Seats</th><th>Status</th><th>Assignment</th></tr></thead>
            <tbody>
              {bovs.map((b: any) => (
                <tr key={b.bovId}>
                  <td>{b.bovId}</td>
                  <td>{b.vehicleNumber}</td>
                  <td>{b.totalSeats}</td>
                  <td><span className={bovStatusClass(b.status)}>{b.status}</span></td>
                  <td>
                    <select value={b.assignedDriverId ?? ""} onChange={e => updateBovAssignment(b.bovId, e.target.value || null)}>
                      <option value="">Unassigned</option>
                      {drivers.map((d: any) => <option key={d.uid} value={d.uid}>{d.name}</option>)}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {activeTab === "drivers" && (
        <section className="card">
          <h2>Driver Management</h2>
          <p className="hint">Drivers sign up through Staff Portal.</p>
          <table>
            <thead><tr><th>UID</th><th>Name</th><th>Email</th><th>Assigned BOV</th><th>Status</th><th>Actions</th></tr></thead>
            <tbody>
              {drivers.map((d: any) => (
                <tr key={d.uid}>
                  <td>{d.uid}</td>
                  <td>{d.name}</td>
                  <td>{d.email}</td>
                  <td>
                    <select value={d.assignedBovId ?? ""} onChange={e => updateDriverAssignment(d.uid, e.target.value || null)}>
                      <option value="">None</option>
                      {bovs.map((b: any) => <option key={b.bovId} value={b.bovId}>{b.bovId}</option>)}
                    </select>
                  </td>
                  <td><span className={d.active ? "badge success" : "badge muted"}>{d.active ? "active" : "inactive"}</span></td>
                  <td><button onClick={() => deleteDriver(d.uid)}>Delete</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {activeTab === "trains" && (
        <section className="card">
          <h2>Train Schedules</h2>
          <div className="grid">
            <label>Train No.<input value={newTrain.trainNumber} onChange={e => setNewTrain(prev => ({ ...prev, trainNumber: e.target.value }))} /></label>
            <label>Name<input value={newTrain.trainName} onChange={e => setNewTrain(prev => ({ ...prev, trainName: e.target.value }))} /></label>
            <label>Platform<input value={newTrain.platformNumber} onChange={e => setNewTrain(prev => ({ ...prev, platformNumber: e.target.value }))} /></label>
          </div>
          <button className="cta" onClick={addTrain}>Add Train</button>
          <table>
            <thead><tr><th>Number</th><th>Name</th><th>Platform</th><th>Type</th><th>Active</th><th>Actions / Delay Sync</th></tr></thead>
            <tbody>
              {trains.map((t: any) => (
                <tr key={t.trainNumber}>
                  <td>{t.trainNumber}</td>
                  <td>{t.trainName}</td>
                  <td>{t.platformNumber}</td>
                  <td>{t.type}</td>
                  <td>{t.isActive ? "Yes" : "No"}</td>
                  <td>
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                      <select 
                        id={`delay-select-${t.trainNumber}`}
                        defaultValue="30"
                        style={{ padding: '4px', fontSize: '0.85rem', borderRadius: '4px' }}
                      >
                        <option value="15">Delay 15m</option>
                        <option value="30">Delay 30m</option>
                        <option value="45">Delay 45m</option>
                        <option value="60">Delay 60m</option>
                      </select>
                      <button 
                        onClick={() => {
                          const select = document.getElementById(`delay-select-${t.trainNumber}`) as HTMLSelectElement;
                          const val = Number(select?.value || 30);
                          delayTrain(t.trainNumber, val);
                        }}
                        style={{
                          background: 'linear-gradient(135deg, #1a3a6b, #2d6cb5)',
                          color: '#fff',
                          border: 'none',
                          padding: '4px 10px',
                          borderRadius: '4px',
                          cursor: 'pointer',
                          fontWeight: 'bold',
                          fontSize: '0.85rem'
                        }}
                      >
                        Apply Delay
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {activeTab === "bookings" && (
        <section className="card">
          <h2>All Ride Bookings</h2>
          <table>
            <thead><tr><th>ID</th><th>Train</th><th>From</th><th>To</th><th>BOV</th><th>Fare</th><th>Status</th><th>Created</th></tr></thead>
            <tbody>
              {bookings.map((b: any) => (
                <tr key={b.bookingId}>
                  <td>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <span style={{ fontWeight: 'bold' }}>{b.bookingId}</span>
                      {b.isSharedRide && (
                        <span className="badge info" style={{
                          background: 'linear-gradient(135deg, #0288d1, #03a9f4)',
                          color: 'white',
                          fontSize: '0.7rem',
                          padding: '2px 6px',
                          borderRadius: '4px',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '3px',
                          alignSelf: 'flex-start',
                          boxShadow: '0 2px 6px rgba(2, 136, 209, 0.3)',
                          fontWeight: 'bold'
                        }}>
                          👥 SHARED
                        </span>
                      )}
                    </div>
                  </td>
                  <td>{b.trainNumber}</td>
                  <td>{b.fromPlatform}</td>
                  <td>{b.toPlatform}</td>
                  <td>{b.bovId}</td>
                  <td>Rs {b.fare}</td>
                  <td><span className={rideStatusClass(b.rideStatus)}>{b.rideStatus}</span></td>
                  <td>{new Date(b.createdAt).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {activeTab === "peakHours" && (
        <section className="card">
          <h2>Peak Hour Pricing</h2>
          <div className="grid">
            <label>Label<input value={newPeak.label} onChange={e => setNewPeak(prev => ({ ...prev, label: e.target.value }))} /></label>
            <label>Start<input type="time" value={newPeak.startTime} onChange={e => setNewPeak(prev => ({ ...prev, startTime: e.target.value }))} /></label>
            <label>End<input type="time" value={newPeak.endTime} onChange={e => setNewPeak(prev => ({ ...prev, endTime: e.target.value }))} /></label>
            <label>Multiplier<input type="number" step="0.1" value={newPeak.multiplier} onChange={e => setNewPeak(prev => ({ ...prev, multiplier: Number(e.target.value) }))} /></label>
          </div>
          <button className="cta" onClick={addPeakHour}>Add Rule</button>
          <table>
            <thead><tr><th>Label</th><th>Time Range</th><th>Multiplier</th><th>Actions</th></tr></thead>
            <tbody>
              {peakHours.map((p: any) => (
                <tr key={p._id || p.id || p.label}>
                  <td>{p.label}</td>
                  <td>{p.startTime} - {p.endTime}</td>
                  <td>{p.multiplier}x</td>
                  <td><button onClick={() => deletePeakHour(p._id || p.id || "")}>Delete</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}



      {activeTab === "analytics" && (
        <section className="card">
          <h2>Station Mobility Analytics</h2>
          <div className="stats">
            <article><strong>{bookings.filter((b: any) => b.rideStatus === "completed").length}</strong><span>Completed Rides</span></article>
            <article><strong>Rs {bookings.filter((b: any) => b.rideStatus === "completed").reduce((sum: number, b: any) => sum + b.fare, 0)}</strong><span>Total Revenue</span></article>
            <article><strong>{bookings.filter((b: any) => b.isSharedRide).length}</strong><span>Shared Rides Optimized</span></article>
            <article><strong>{bookings.filter((b: any) => b.rideStatus === "cancelled").length}</strong><span>Cancellations</span></article>
          </div>

          {/* Platform Demand Heatmap */}
          <div style={{ marginTop: '2.5rem' }}>
            <h3>📍 Platform Demand Heatmap</h3>
            <p className="hint" style={{ marginBottom: '1.2rem' }}>Visualizing buggy booking volumes originating from/going to each platform. Deeper crimson indicates higher demand.</p>
            <div style={{ 
              display: 'grid', 
              gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', 
              gap: '16px',
              marginTop: '10px'
            }}>
              {["Platform 1", "Platform 2", "Platform 3", "Platform 4", "Platform 5"].map((platName) => {
                const count = bookings.filter((b: any) => b.fromPlatform === platName || b.toPlatform === platName).length;
                
                // Calculate dynamic heatmap opacity/intensity based on booking count
                const maxCount = Math.max(1, ...["Platform 1", "Platform 2", "Platform 3", "Platform 4", "Platform 5"].map(p => 
                  bookings.filter((b: any) => b.fromPlatform === p || b.toPlatform === p).length
                ));
                
                // Color grading: transparent crimson to deep crimson
                const backgroundIntensity = `rgba(211, 47, 47, ${0.1 + (count / maxCount) * 0.8})`;
                const textColor = count / maxCount > 0.4 ? '#ffffff' : 'inherit';
                const labelColor = count / maxCount > 0.4 ? 'rgba(255, 255, 255, 0.8)' : '#8fa8c8';

                return (
                  <article key={platName} style={{ 
                    background: backgroundIntensity, 
                    color: textColor, 
                    border: '1px solid rgba(211, 47, 47, 0.3)',
                    boxShadow: count / maxCount > 0.6 ? '0 8px 24px rgba(211, 47, 47, 0.35)' : 'none',
                    transition: 'all 0.3s ease',
                    transform: count / maxCount > 0.6 ? 'scale(1.03)' : 'scale(1)',
                    borderRadius: '8px',
                    padding: '16px',
                    textAlign: 'center'
                  }}>
                    <strong style={{ fontSize: '1.8rem', display: 'block', marginBottom: '4px' }}>{count}</strong>
                    <span style={{ color: labelColor, fontSize: '0.85rem', fontWeight: 'bold' }}>{platName}</span>
                  </article>
                );
              })}
            </div>
          </div>

          {/* CSS Hourly Train Demand Chart */}
          <div style={{ marginTop: '3rem' }}>
            <h3>⏰ Peak Demand by Train (Hourly Volumes)</h3>
            <p className="hint" style={{ marginBottom: '1.5rem' }}>Visualizing the relative passenger booking loads of station trains.</p>
            <div style={{ 
              background: '#0d1e36', 
              padding: '24px', 
              borderRadius: '12px', 
              border: '1px solid #1a3a6b',
              marginTop: '10px'
            }}>
              <div style={{ 
                display: 'flex', 
                alignItems: 'flex-end', 
                height: '180px', 
                gap: '24px',
                justifyContent: 'space-around',
                paddingBottom: '8px',
                borderBottom: '2px solid #1a3a6b'
              }}>
                {["12725", "17301", "12079", "20653"].map((trainNo) => {
                  const count = bookings.filter((b: any) => b.trainNumber === trainNo).length;
                  const maxCount = Math.max(1, ...["12725", "17301", "12079", "20653"].map(t => 
                    bookings.filter((b: any) => b.trainNumber === t).length
                  ));
                  
                  const barHeight = `${Math.max(15, (count / maxCount) * 150)}px`;
                  const barColor = count / maxCount > 0.7 
                    ? 'linear-gradient(180deg, #ff7b00, #ff4500)' 
                    : 'linear-gradient(180deg, #2d6cb5, #1a3a6b)';

                  return (
                    <div key={trainNo} style={{ 
                      display: 'flex', 
                      flexDirection: 'column', 
                      alignItems: 'center', 
                      width: '45px' 
                    }}>
                      <span style={{ color: '#fff', fontSize: '0.85rem', fontWeight: 'bold', marginBottom: '6px' }}>{count}</span>
                      <div style={{ 
                        height: barHeight, 
                        width: '100%', 
                        background: barColor, 
                        borderRadius: '6px 6px 0 0',
                        boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
                        transition: 'height 0.8s cubic-bezier(0.4, 0, 0.2, 1)'
                      }}></div>
                      <span style={{ color: '#a5b8d0', fontSize: '0.75rem', marginTop: '8px', fontWeight: 'bold' }}>T-{trainNo}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </section>
      )}

      {status && <p className="status">{status}</p>}
      
      {activeSos && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(15, 2, 2, 0.9)',
          backdropFilter: 'blur(16px)',
          zIndex: 99999,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#fff',
          fontFamily: "'Plus Jakarta Sans', 'Segoe UI', sans-serif",
          animation: 'sosFadeIn 0.3s ease-out'
        }}>
          <style>{`
            @keyframes sosFadeIn {
              from { opacity: 0; }
              to { opacity: 1; }
            }
            @keyframes sosPulse {
              0% { box-shadow: 0 0 0 0 rgba(211, 47, 47, 0.7), 0 0 0 0 rgba(211, 47, 47, 0.4); }
              70% { box-shadow: 0 0 0 20px rgba(211, 47, 47, 0), 0 0 0 40px rgba(211, 47, 47, 0); }
              100% { box-shadow: 0 0 0 0 rgba(211, 47, 47, 0), 0 0 0 0 rgba(211, 47, 47, 0); }
            }
            @keyframes borderGlow {
              0% { border-color: #d32f2f; }
              50% { border-color: #ff5252; }
              100% { border-color: #d32f2f; }
            }
          `}</style>
          <div style={{
            background: 'rgba(30, 8, 8, 0.85)',
            border: '2px solid #d32f2f',
            borderRadius: '24px',
            padding: '40px',
            maxWidth: '550px',
            width: '90%',
            textAlign: 'center',
            boxShadow: '0 20px 50px rgba(0,0,0,0.5)',
            animation: 'sosPulse 2s infinite, borderGlow 2s infinite',
          }}>
            <div style={{
              background: 'linear-gradient(135deg, #d32f2f, #b71c1c)',
              width: '80px',
              height: '80px',
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 24px',
              boxShadow: '0 4px 20px rgba(211, 47, 47, 0.5)'
            }}>
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: '#fff' }}>
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                <line x1="12" y1="9" x2="12" y2="13"/>
                <line x1="12" y1="17" x2="12.01" y2="17"/>
              </svg>
            </div>
            
            <span style={{
              background: 'rgba(211, 47, 47, 0.15)',
              color: '#ff5252',
              fontSize: '0.8rem',
              fontWeight: 'bold',
              letterSpacing: '2px',
              padding: '6px 16px',
              borderRadius: '20px',
              textTransform: 'uppercase',
              display: 'inline-block',
              marginBottom: '16px',
              border: '1px solid rgba(211, 47, 47, 0.3)'
            }}>
              🚨 Active SOS Panic Event
            </span>
            
            <h2 style={{ fontSize: '2rem', margin: '0 0 12px', fontWeight: 'bold', color: '#fff' }}>Emergency Alarm</h2>
            
            <p style={{ color: '#a5b8d0', margin: '0 0 30px', fontSize: '0.95rem', lineHeight: '1.5' }}>
              An emergency SOS panic signal has been dispatched from the station platform floor. Please coordinate immediate dispatch.
            </p>

            <div style={{
              background: 'rgba(255,255,255,0.03)',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: '16px',
              padding: '20px',
              textAlign: 'left',
              marginBottom: '32px',
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '16px 12px'
            }}>
              <div>
                <span style={{ display: 'block', fontSize: '0.75rem', color: '#8fa8c8', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Distressed Node</span>
                <strong style={{ fontSize: '1rem', color: '#ff5252' }}>{activeSos.role?.toUpperCase() || 'PASSENGER'}</strong>
              </div>
              <div>
                <span style={{ display: 'block', fontSize: '0.75rem', color: '#8fa8c8', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Booking ID</span>
                <strong style={{ fontSize: '1rem', color: '#fff' }}>{activeSos.bookingId || 'N/A'}</strong>
              </div>
              <div>
                <span style={{ display: 'block', fontSize: '0.75rem', color: '#8fa8c8', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Reporter Name</span>
                <strong style={{ fontSize: '1rem', color: '#fff' }}>{activeSos.passengerName || 'Unknown Passenger'}</strong>
              </div>
              <div>
                <span style={{ display: 'block', fontSize: '0.75rem', color: '#8fa8c8', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Last Platform Location</span>
                <strong style={{ fontSize: '1rem', color: '#ffeb3b' }}>📍 {activeSos.currentPlatform || 'Unknown'}</strong>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '12px' }}>
              <button 
                onClick={() => {
                  setActiveSos(null);
                  setStatus("🚨 SOS Alert acknowledged. Assistance crew dispatched!");
                }}
                style={{
                  flex: 1,
                  background: 'linear-gradient(135deg, #d32f2f, #c62828)',
                  color: 'white',
                  border: 'none',
                  padding: '14px 24px',
                  borderRadius: '12px',
                  cursor: 'pointer',
                  fontWeight: 'bold',
                  fontSize: '1rem',
                  transition: 'all 0.2s ease',
                  boxShadow: '0 4px 15px rgba(211, 47, 47, 0.4)'
                }}
                onMouseOver={(e) => { e.currentTarget.style.transform = 'translateY(-2px)'; }}
                onMouseOut={(e) => { e.currentTarget.style.transform = 'none'; }}
              >
                Dispatch Help & Dismiss
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
