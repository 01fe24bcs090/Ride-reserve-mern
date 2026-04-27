import { useMemo, useState, useEffect } from "react";
import { collection, onSnapshot, query, doc, setDoc, updateDoc, deleteDoc, getDocs, orderBy, getDoc } from "firebase/firestore";
import { db, firebaseReady, auth } from "./lib/firebase";
import { signInWithEmailAndPassword, onAuthStateChanged, signOut, User } from "firebase/auth";
import { BovDoc as Bov, UserDoc as Driver, TrainDoc as Train, PeakHourDoc as PeakHour, PlatformDoc as Platform, BookingDoc as Booking, BovStatus, RideStatus } from "@ride-reserve/types";
import { useAdminData } from "./hooks/useAdminData";

type Tab =
  | "bovs"
  | "drivers"
  | "trains"
  | "bookings"
  | "peakHours"
  | "platforms"
  | "analytics";

export default function App() {
  const { 
    bovs, 
    drivers, 
    trains, 
    bookings, 
    peakHours, 
    platforms, 
    loading 
  } = useAdminData();

  const [activeTab, setActiveTab] = useState<Tab>("bookings");
  const [user, setUser] = useState<User | null>(null);
  const [authResolved, setAuthResolved] = useState(false);
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authBusy, setAuthBusy] = useState(false);
  const [status, setStatus] = useState("");

  const [newBov, setNewBov] = useState({ vehicleNumber: "", totalSeats: 4, currentPlatform: "" });
  const [newTrain, setNewTrain] = useState({ trainNumber: "", trainName: "", platformNumber: "", type: "arriving" as any, isActive: true });
  const [newPeak, setNewPeak] = useState({ label: "", startTime: "", endTime: "", multiplier: 1.5 });
  const [newPlatform, setNewPlatform] = useState({ platformId: "", platformName: "", platformNumber: "" });

  useEffect(() => {
    if (!auth) return;

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
          } else {
            await signOut(auth!);
            setStatus("Access denied. Admin only.");
            setUser(null);
          }
        } catch {
          setUser(u);
        }
      } else {
        setUser(u);
      }
      setAuthResolved(true);
    });

    return unsubscribe;
  }, []);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    if (!auth) return;
    setAuthBusy(true);
    setStatus("Signing in...");
    try {
      await signInWithEmailAndPassword(auth, authEmail, authPassword);
      setStatus("Login successful.");
    } catch (e) {
      setStatus("Login failed: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setAuthBusy(false);
    }
  }

  async function handleLogout() {
    await signOut(auth!);
    setUser(null);
    setStatus("Signed out.");
  }

  // Helper functions for CRUD (keeping them as is since they are already implemented)
  async function addBov() {
    if (!newBov.vehicleNumber.trim() || !newBov.currentPlatform.trim()) return;
    if (!db) return;
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
    } catch (e) { setStatus("Error: " + e); }
  }

  async function updateBovAssignment(bovId: string, driverId: string | null) {
    if (!db) return;
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
    } catch (e) { setStatus("Error: " + e); }
  }

  async function updateDriverAssignment(driverId: string, bovId: string | null) {
    if (!db) return;
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
    } catch (e) { setStatus("Error: " + e); }
  }

  async function deleteDriver(uid: string) {
    if (!db) return;
    if (!window.confirm("Are you sure you want to delete this driver?")) return;
    try {
      const driver = drivers.find(d => d.uid === uid);
      if (driver?.assignedBovId) {
        await updateDoc(doc(db, "bovs", driver.assignedBovId), { assignedDriverId: null });
      }
      await deleteDoc(doc(db, "users", uid));
      setStatus(`Driver ${uid} deleted.`);
    } catch (e) { setStatus("Error: " + e); }
  }

  async function addTrain() {
    if (!newTrain.trainNumber.trim()) return;
    if (!db) return;
    try {
      await setDoc(doc(db, "trains", newTrain.trainNumber), { ...newTrain });
      setNewTrain({ trainNumber: "", trainName: "", platformNumber: "", type: "arriving", isActive: true });
      setStatus("Train added.");
    } catch (e) { setStatus("Error: " + e); }
  }

  async function addPeakHour() {
    if (!newPeak.label.trim()) return;
    if (!db) return;
    try {
      await setDoc(doc(collection(db, "peakHours")), { ...newPeak });
      setNewPeak({ label: "", startTime: "", endTime: "", multiplier: 1.5 });
      setStatus("Peak hour added.");
    } catch (e) { setStatus("Error: " + e); }
  }

  async function addPlatform() {
    if (!newPlatform.platformId.trim()) return;
    if (!db) return;
    try {
      await setDoc(doc(db, "platforms", newPlatform.platformId), { ...newPlatform });
      setNewPlatform({ platformId: "", platformName: "", platformNumber: "" });
      setStatus("Platform added.");
    } catch (e) { setStatus("Error: " + e); }
  }

  async function deletePeakHour(id: string) {
    if (!db) return;
    try {
      await deleteDoc(doc(db, "peakHours", id));
      setStatus("Peak hour deleted.");
    } catch (e) { setStatus("Error: " + e); }
  }

  async function deletePlatform(id: string) {
    if (!db) return;
    try {
      await deleteDoc(doc(db, "platforms", id));
      setStatus("Platform deleted.");
    } catch (e) { setStatus("Error: " + e); }
  }

  if (!authResolved || loading) return <div className="page">Loading Admin Dashboard...</div>;

  if (!user) {
    return (
      <div className="page page-auth">
        <section className="auth-shell" style={{ gridTemplateColumns: '1fr', maxWidth: '460px', margin: '0 auto' }}>
          <form className="auth-card" onSubmit={handleLogin}>
            <h2>Admin Login</h2>
            <p>Access the central railway mobility dashboard.</p>
            <label>
              Email
              <input type="email" value={authEmail} onChange={e => setAuthEmail(e.target.value)} required />
            </label>
            <label>
              Password
              <input type="password" value={authPassword} onChange={e => setAuthPassword(e.target.value)} required />
            </label>
            <button className="cta auth-submit" type="submit" disabled={authBusy}>
              {authBusy ? "Verifying..." : "Login to Admin"}
            </button>
            {status && <p className="status">{status}</p>}
          </form>
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
            ["platforms", "Platform Config"],
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
              {bovs.map(b => (
                <tr key={b.bovId}>
                  <td>{b.bovId}</td>
                  <td>{b.vehicleNumber}</td>
                  <td>{b.totalSeats}</td>
                  <td><span className={bovStatusClass(b.status)}>{b.status}</span></td>
                  <td>
                    <select value={b.assignedDriverId ?? ""} onChange={e => updateBovAssignment(b.bovId, e.target.value || null)}>
                      <option value="">Unassigned</option>
                      {drivers.map(d => <option key={d.uid} value={d.uid}>{d.name}</option>)}
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
              {drivers.map(d => (
                <tr key={d.uid}>
                  <td>{d.uid}</td>
                  <td>{d.name}</td>
                  <td>{d.email}</td>
                  <td>
                    <select value={d.assignedBovId ?? ""} onChange={e => updateDriverAssignment(d.uid, e.target.value || null)}>
                      <option value="">None</option>
                      {bovs.map(b => <option key={b.bovId} value={b.bovId}>{b.bovId}</option>)}
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
            <thead><tr><th>Number</th><th>Name</th><th>Platform</th><th>Type</th><th>Active</th></tr></thead>
            <tbody>
              {trains.map(t => (
                <tr key={t.trainNumber}>
                  <td>{t.trainNumber}</td>
                  <td>{t.trainName}</td>
                  <td>{t.platformNumber}</td>
                  <td>{t.type}</td>
                  <td>{t.isActive ? "Yes" : "No"}</td>
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
              {bookings.map(b => (
                <tr key={b.bookingId}>
                  <td>{b.bookingId}</td>
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
              {peakHours.map(p => (
                <tr key={p.id || p.label}>
                  <td>{p.label}</td>
                  <td>{p.startTime} - {p.endTime}</td>
                  <td>{p.multiplier}x</td>
                  <td><button onClick={() => deletePeakHour(p.id || "")}>Delete</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {activeTab === "platforms" && (
        <section className="card">
          <h2>Platform Configuration</h2>
          <div className="grid">
            <label>ID<input value={newPlatform.platformId} onChange={e => setNewPlatform(prev => ({ ...prev, platformId: e.target.value }))} /></label>
            <label>Name<input value={newPlatform.platformName} onChange={e => setNewPlatform(prev => ({ ...prev, platformName: e.target.value }))} /></label>
            <label>Number<input value={newPlatform.platformNumber} onChange={e => setNewPlatform(prev => ({ ...prev, platformNumber: e.target.value }))} /></label>
          </div>
          <button className="cta" onClick={addPlatform}>Add Platform</button>
          <table>
            <thead><tr><th>ID</th><th>Name</th><th>Number</th><th>Actions</th></tr></thead>
            <tbody>
              {platforms.map(p => (
                <tr key={p.platformId}>
                  <td>{p.platformId}</td>
                  <td>{p.platformName}</td>
                  <td>{p.platformNumber}</td>
                  <td><button onClick={() => deletePlatform(p.platformId)}>Delete</button></td>
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
            <article><strong>{bookings.filter(b => b.rideStatus === "completed").length}</strong><span>Completed Rides</span></article>
            <article><strong>Rs {bookings.filter(b => b.rideStatus === "completed").reduce((sum, b) => sum + b.fare, 0)}</strong><span>Total Revenue</span></article>
            <article><strong>{bookings.filter(b => b.rideStatus === "cancelled").length}</strong><span>Cancellations</span></article>
          </div>
        </section>
      )}

      {status && <p className="status">{status}</p>}
    </div>
  );
}
