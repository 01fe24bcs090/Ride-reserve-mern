import { useState, useEffect } from "react";
import { collection, doc, updateDoc, where, getDoc, runTransaction, query, orderBy, onSnapshot, setDoc } from "firebase/firestore";
import { signInWithEmailAndPassword, onAuthStateChanged, signOut, User, createUserWithEmailAndPassword } from "firebase/auth";
import { db, firebaseReady, auth } from "./lib/firebase";
import { BookingDoc as Ride, RideStatus } from "@ride-reserve/types";
import { useDriverRides } from "./hooks/useDriverRides";

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [authResolved, setAuthResolved] = useState(false);
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authName, setAuthName] = useState("");
  const [authBusy, setAuthBusy] = useState(false);
  const [isSignup, setIsSignup] = useState(false);
  const [status, setStatus] = useState("");

  const { rides, loading: ridesLoading, error: ridesError } = useDriverRides(user?.uid);

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

    const unsub = onAuthStateChanged(auth, async (u) => {
      if (u && db) {
        try {
          const userDoc = await getDoc(doc(db, "users", u.uid));
          const userData = userDoc.data();
          if (userData?.role === "driver") {
            setUser(u);
          } else {
            await signOut(auth!);
            setStatus("Access denied. Drivers only.");
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
    return unsub;
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

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault();
    if (!auth || !db) return;
    setAuthBusy(true);
    setStatus("Creating account...");
    try {
      const cred = await createUserWithEmailAndPassword(auth, authEmail, authPassword);
      await setDoc(doc(db!, "users", cred.user.uid), {
        uid: cred.user.uid,
        name: authName,
        email: authEmail,
        role: "driver",
        active: true,
        assignedBovId: null,
        createdAt: new Date().toISOString()
      });
      setStatus("Signup successful.");
    } catch (e) {
      setStatus("Signup failed: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setAuthBusy(false);
    }
  }

  async function handleLogout() {
    await signOut(auth!);
    setUser(null);
    setStatus("Signed out.");
  }

  async function acceptRide(docId: string) {
    if (!db || !user) return;
    setStatus(`Accepting ride...`);
    try {
      await runTransaction(db!, async (transaction) => {
        const rideRef = doc(db!, "bookings", docId);
        const rideSnap = await transaction.get(rideRef);
        if (!rideSnap.exists()) throw new Error("Ride not found.");
        const data = rideSnap.data();
        if (data.rideStatus !== "pending") throw new Error("Ride already taken.");

        const driverDoc = await transaction.get(doc(db!, "users", user.uid));
        const bovId = driverDoc.data()?.assignedBovId;
        if (!bovId) throw new Error("You must be assigned to a BOV to accept rides.");

        const bovDoc = await transaction.get(doc(db!, "bovs", bovId));
        const bovData = bovDoc.data();

        transaction.update(rideRef, {
          rideStatus: "confirmed",
          acceptedBy: user.uid,
          bovId: bovId,
          bovVehicleNumber: bovData?.vehicleNumber || "Unknown",
        });
      });
      setStatus("Ride accepted!");
    } catch (e) { setStatus("Error: " + (e instanceof Error ? e.message : e)); }
  }

  async function updateStatus(docId: string, newStatus: RideStatus) {
    if (!db) return;
    try {
      await updateDoc(doc(db!, "bookings", docId), { rideStatus: newStatus });
      setStatus(`Status updated to ${newStatus}.`);
    } catch (e) { setStatus("Error: " + e); }
  }

  if (!authResolved) return <div className="page">Initializing Driver Portal...</div>;

  if (!user) {
    return (
      <div className="page page-auth">
        <section className="auth-shell" style={{ gridTemplateColumns: '1fr', maxWidth: '460px', margin: '0 auto' }}>
          <form className="auth-card" onSubmit={isSignup ? handleSignup : handleLogin}>
            <h2>{isSignup ? "Driver Signup" : "Driver Login"}</h2>
            <p>{isSignup ? "Create your driver account." : "Access your assigned rides."}</p>
            {isSignup && (
              <label>Name<input type="text" value={authName} onChange={e => setAuthName(e.target.value)} required /></label>
            )}
            <label>Email<input type="email" value={authEmail} onChange={e => setAuthEmail(e.target.value)} required /></label>
            <label>Password<input type="password" value={authPassword} onChange={e => setAuthPassword(e.target.value)} required /></label>
            <button className="cta auth-submit" type="submit" disabled={authBusy}>
              {authBusy ? "Processing..." : (isSignup ? "Sign Up" : "Login")}
            </button>
            <p className="auth-footer-note">
              <button type="button" className="link-btn" onClick={() => setIsSignup(!isSignup)}>
                {isSignup ? "Already have an account? Login" : "Need an account? Sign up"}
              </button>
            </p>
            {status && <p className="status">{status}</p>}
          </form>
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
        <article className="metric"><h2>{rides.filter(r => r.acceptedBy === user.uid).length}</h2><p>My Active Rides</p></article>
        <article className="metric"><h2>{rides.filter(r => r.rideStatus === "pending").length}</h2><p>Available in Market</p></article>
      </div>

      <section className="table-card">
        <h2>Ride Queue</h2>
        {ridesError && <p className="status error" style={{ color: '#ff4d4f' }}>Error loading rides: {ridesError}</p>}
        {ridesLoading ? <p>Loading rides...</p> : (
          <table>
            <thead><tr><th>ID</th><th>Passenger</th><th>Route</th><th>Seats</th><th>Status</th><th>Actions</th></tr></thead>
            <tbody>
              {rides.map(r => (
                <tr key={(r as any).docId}>
                  <td>{r.bookingId}</td>
                  <td>{r.passengerName}</td>
                  <td>{r.fromPlatform} → {r.toPlatform}</td>
                  <td>{r.seats}</td>
                  <td><span className={statusClass(r.rideStatus)}>{r.rideStatus}</span></td>
                  <td className="actions">
                    {r.rideStatus === "pending" ? (
                      <button className="action-start" onClick={() => acceptRide((r as any).docId)}>Accept</button>
                    ) : r.rideStatus === "confirmed" ? (
                      <button className="action-start" onClick={() => updateStatus((r as any).docId, "in-progress")}>Start</button>
                    ) : r.rideStatus === "in-progress" ? (
                      <button className="action-complete" onClick={() => updateStatus((r as any).docId, "completed")}>Complete</button>
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
