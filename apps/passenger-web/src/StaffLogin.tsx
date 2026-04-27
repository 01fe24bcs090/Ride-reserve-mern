import { useState, FormEvent } from "react";
import { signInWithEmailAndPassword, signOut, createUserWithEmailAndPassword } from "firebase/auth";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { auth, db } from "./lib/firebase";

type StaffRole = "admin" | "driver";

export default function StaffLogin() {
  const [activeTab, setActiveTab] = useState<StaffRole>("admin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [isSignup, setIsSignup] = useState(false);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleLogin(e: FormEvent) {
    e.preventDefault();
    if (!auth || !db) return;

    setBusy(true);
    setStatus(`Authenticating as ${activeTab}...`);
    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;

      // Verify role in Firestore
      const userDoc = await getDoc(doc(db, "users", user.uid));
      const userData = userDoc.data();

      if (!userDoc.exists() || !userData) {
        await signOut(auth);
        throw new Error("No staff profile found for this account.");
      }

      const userRole = userData.role;

      // Verify the user has the correct role for the tab they selected
      if (userRole !== activeTab) {
        await signOut(auth);
        throw new Error(
          userRole === "admin" || userRole === "driver"
            ? `This account is registered as "${userRole}", not "${activeTab}". Please switch to the ${userRole === "admin" ? "Admin" : "Driver"} tab.`
            : "Access denied. This portal is for authorized staff only."
        );
      }

      setStatus(`Welcome, ${userData.name || "Staff"}! Redirecting to ${activeTab} dashboard...`);

      const isLocal = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";

      const targetMap: Record<string, string> = {
        admin: isLocal ? "http://localhost:5175" : "https://ride-reserve-admin.web.app",
        driver: isLocal ? "http://localhost:5174" : "https://ride-reserve-driver.web.app",
      };

      // Sign out from passenger-web domain (staff shouldn't stay logged in here)
      await signOut(auth);

      // Pass credentials to target app for cross-domain auth
      const targetUrl = `${targetMap[activeTab]}?e=${encodeURIComponent(email)}&p=${encodeURIComponent(password)}`;

      setTimeout(() => {
        window.location.href = targetUrl;
      }, 1200);

    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Login failed.");
    } finally {
      setBusy(false);
    }
  }

  async function handleSignup(e: FormEvent) {
    e.preventDefault();
    if (!auth || !db) return;
    if (!name.trim()) {
      setStatus("Please enter your name.");
      return;
    }

    setBusy(true);
    setStatus(`Creating driver account...`);
    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;

      // Create driver document in Firestore
      await setDoc(doc(db, "users", user.uid), {
        uid: user.uid,
        name: name.trim(),
        email: email,
        role: "driver",
        active: true,
        assignedBovId: null,
        createdAt: new Date().toISOString()
      });

      setStatus("Driver account created successfully! Redirecting...");
      
      const isLocal = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
      const targetUrl = isLocal ? "http://localhost:5174" : "https://ride-reserve-driver.web.app";
      
      // Sign out and redirect
      await signOut(auth);
      
      const redirectUrl = `${targetUrl}?e=${encodeURIComponent(email)}&p=${encodeURIComponent(password)}`;
      setTimeout(() => {
        window.location.href = redirectUrl;
      }, 1500);

    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Signup failed.");
    } finally {
      setBusy(false);
    }
  }

  const isAdmin = activeTab === "admin";

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

          {/* Role Tabs */}
          <div className="staff-role-tabs">
            <button
              type="button"
              className={`staff-role-tab ${isAdmin ? 'active' : ''}`}
              onClick={() => { setActiveTab("admin"); setStatus(""); }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="7" height="7"/>
                <rect x="14" y="3" width="7" height="7"/>
                <rect x="14" y="14" width="7" height="7"/>
                <rect x="3" y="14" width="7" height="7"/>
              </svg>
              <span>Admin</span>
              <small>System management</small>
            </button>
            <button
              type="button"
              className={`staff-role-tab ${!isAdmin ? 'active' : ''}`}
              onClick={() => { setActiveTab("driver"); setStatus(""); setIsSignup(false); }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10"/>
                <polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76"/>
              </svg>
              <span>Driver</span>
              <small>BOV ride operations</small>
            </button>
          </div>

          {/* Form */}
          <div className="staff-form-area">
            <div className="staff-active-role-badge">
              <span className={`staff-role-dot ${isAdmin ? 'admin' : 'driver'}`}></span>
              {isSignup ? 'Creating Driver Account' : `Logging in as ${isAdmin ? 'Administrator' : 'Driver'}`}
            </div>

            <form className="auth-form" onSubmit={isSignup ? handleSignup : handleLogin} style={{ marginTop: '16px' }}>
              {isSignup && (
                <label>
                  Full Name
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Arjun Sharma"
                    required
                  />
                </label>
              )}
              <label>
                {isAdmin ? 'Admin' : 'Driver'} Email
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder={isAdmin ? "admin@ridereserve.com" : "driver@ridereserve.com"}
                  required
                />
              </label>
              <label>
                Password
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                />
              </label>

              <button className="cta auth-submit" type="submit" disabled={busy}
                style={{
                  background: isAdmin
                    ? 'linear-gradient(135deg, #1a3a6b, #2d6cb5)'
                    : 'linear-gradient(135deg, #e65100, #ff6f1d)',
                }}>
                {busy
                  ? (isSignup ? "Creating account..." : "Verifying credentials...")
                  : (isSignup 
                      ? "Create Driver Account" 
                      : (isAdmin ? "Login to Admin Dashboard" : "Login to Driver Dashboard"))
                }
              </button>

              {!isAdmin && (
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
              )}

              {status && <p className="status auth-status">{status}</p>}
            </form>

            <div className="staff-info-box">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10"/>
                <line x1="12" y1="16" x2="12" y2="12"/>
                <line x1="12" y1="8" x2="12.01" y2="8"/>
              </svg>
              <span>
                {isAdmin
                  ? "Admin accounts manage BOVs, trains, bookings, peak hours, and analytics."
                  : "Driver accounts handle ride status updates and BOV operations."
                }
              </span>
            </div>
          </div>

          {/* Footer */}
          <div className="staff-footer">
            <p className="auth-footer-note" style={{ margin: 0 }}>
              Not a staff member?{' '}
              <button type="button" className="link-btn" onClick={() => window.location.href = '/'}>
                Back to Passenger Booking
              </button>
            </p>
          </div>
        </section>
      </section>
    </div>
  );
}
