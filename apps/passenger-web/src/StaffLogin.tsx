import { useState, FormEvent } from "react";
import api from "./api/client";

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
    setBusy(true);
    setStatus(`Authenticating as ${activeTab}...`);
    try {
      const { data } = await api.post('/auth/login', { email, password });
      const userRole = data.user.role;

      if (userRole !== activeTab) {
        throw new Error(
          userRole === "admin" || userRole === "driver"
            ? `This account is registered as "${userRole}", not "${activeTab}". Please switch to the ${userRole === "admin" ? "Admin" : "Driver"} tab.`
            : "Access denied. This portal is for authorized staff only."
        );
      }

      setStatus(`Welcome, ${data.user.name || "Staff"}! Redirecting to ${activeTab} dashboard...`);

      const isLocal = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";

      const targetMap: Record<string, string> = {
        admin: import.meta.env.VITE_ADMIN_URL || (isLocal ? "http://localhost:5175" : "https://ride-reserve-mern-admin-web.vercel.app/"),
        driver: import.meta.env.VITE_DRIVER_URL || (isLocal ? "http://localhost:5174" : "https://ride-reserve-mern-driver-web.vercel.app/"),
      };

      const targetUrl = `${targetMap[activeTab]}?e=${encodeURIComponent(email)}&p=${encodeURIComponent(password)}`;

      setTimeout(() => {
        window.location.href = targetUrl;
      }, 1200);

    } catch (error: any) {
      setStatus(error.response?.data?.error || error.message || "Login failed.");
    } finally {
      setBusy(false);
    }
  }

  async function handleSignup(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setStatus("Please enter your name.");
      return;
    }

    setBusy(true);
    setStatus(`Creating driver account...`);
    try {
      await api.post('/auth/register', { 
        name: name.trim(), 
        email, 
        password,
        role: "driver" 
      });

      setStatus("Driver account created successfully! Redirecting...");
      
      const isLocal = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
      const targetUrl = import.meta.env.VITE_DRIVER_URL || (isLocal ? "http://localhost:5174" : "https://ride-reserve-mern-driver-web.vercel.app/");
      
      const redirectUrl = `${targetUrl}?e=${encodeURIComponent(email)}&p=${encodeURIComponent(password)}`;
      setTimeout(() => {
        window.location.href = redirectUrl;
      }, 1500);

    } catch (error: any) {
      setStatus(error.response?.data?.error || error.message || "Signup failed.");
    } finally {
      setBusy(false);
    }
  }

  const isAdmin = activeTab === "admin";

  return (
    <div className="page page-auth bg-background font-body-lg text-on-surface antialiased">
      <main>
        {/* Full Screen Centered Glassmorphism Section */}
        <section className="relative min-h-screen flex items-center justify-center overflow-hidden">
          {/* Background Image */}
          <div className="absolute inset-0 z-0">
            <img alt="Hubballi Junction Station" className="w-full h-full object-cover" src="/bg_train_new.jpg" />
          </div>

          <div className="relative z-10 w-full p-4 flex justify-center items-center">
            {/* Solid High-Contrast Card */}
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
              {/* Logo Placeholder */}
              <div style={{ height: '56px', margin: '0 auto 16px auto' }} />

              <h1 style={{ fontSize: '2.1rem', fontWeight: '800', color: '#0f172a', margin: '0 0 4px 0', letterSpacing: '-0.75px', textAlign: 'center', fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
                Hubballi BOV Transit
              </h1>
              <p style={{ fontSize: '0.95rem', fontWeight: '700', color: '#ff7700', margin: '0 0 10px 0', textAlign: 'center', letterSpacing: '0.5px' }}>
                Welcome to SSS Hubballi Junction.
              </p>
              <p style={{ fontSize: '0.88rem', color: '#475569', margin: '0 0 24px 0', lineHeight: '1.5', textAlign: 'center' }}>
                Secure staff access for Administrators and Drivers managing BOV operations.
              </p>

              {/* Main Role Toggle */}
              <div style={{
                display: 'flex',
                background: '#f1f5f9',
                border: '1px solid #cbd5e1',
                borderRadius: '99px',
                padding: '3px',
                marginBottom: '20px'
              }}>
                <button
                  type="button"
                  onClick={() => { setActiveTab("admin"); setStatus(""); }}
                  style={{
                    flex: 1,
                    padding: '10px 0',
                    borderRadius: '99px',
                    border: 'none',
                    background: isAdmin ? '#ffffff' : 'transparent',
                    color: isAdmin ? '#0f172a' : '#64748b',
                    fontWeight: 'bold',
                    fontSize: '0.88rem',
                    cursor: 'pointer',
                    boxShadow: isAdmin ? '0 2px 6px rgba(15, 23, 42, 0.08)' : 'none',
                    transition: 'all 0.2s'
                  }}
                >
                  🔧 Admin Portal
                </button>
                <button
                  type="button"
                  onClick={() => { setActiveTab("driver"); setStatus(""); setIsSignup(false); }}
                  style={{
                    flex: 1,
                    padding: '10px 0',
                    borderRadius: '99px',
                    border: 'none',
                    background: !isAdmin ? '#ffffff' : 'transparent',
                    color: !isAdmin ? '#0f172a' : '#64748b',
                    fontWeight: 'bold',
                    fontSize: '0.88rem',
                    cursor: 'pointer',
                    boxShadow: !isAdmin ? '0 2px 6px rgba(15, 23, 42, 0.08)' : 'none',
                    transition: 'all 0.2s'
                  }}
                >
                  🚗 Driver Portal
                </button>
              </div>

              {/* Secondary Driver SignUp/LogIn Toggle */}
              {!isAdmin && (
                <div style={{
                  display: 'flex',
                  background: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  borderRadius: '99px',
                  padding: '2px',
                  marginBottom: '20px',
                  maxWidth: '240px',
                  margin: '0 auto 20px auto'
                }}>
                  <button
                    type="button"
                    onClick={() => { setIsSignup(false); setStatus(""); }}
                    style={{
                      flex: 1,
                      padding: '6px 0',
                      borderRadius: '99px',
                      border: 'none',
                      background: !isSignup ? '#ffffff' : 'transparent',
                      color: !isSignup ? '#0f172a' : '#64748b',
                      fontWeight: 'bold',
                      fontSize: '0.78rem',
                      cursor: 'pointer',
                      boxShadow: !isSignup ? '0 1px 4px rgba(15, 23, 42, 0.05)' : 'none',
                      transition: 'all 0.15s'
                    }}
                  >
                    Login
                  </button>
                  <button
                    type="button"
                    onClick={() => { setIsSignup(true); setStatus(""); }}
                    style={{
                      flex: 1,
                      padding: '6px 0',
                      borderRadius: '99px',
                      border: 'none',
                      background: isSignup ? '#ffffff' : 'transparent',
                      color: isSignup ? '#0f172a' : '#64748b',
                      fontWeight: 'bold',
                      fontSize: '0.78rem',
                      cursor: 'pointer',
                      boxShadow: isSignup ? '0 1px 4px rgba(15, 23, 42, 0.05)' : 'none',
                      transition: 'all 0.15s'
                    }}
                  >
                    Sign up
                  </button>
                </div>
              )}

              {/* Form */}
              <form onSubmit={isSignup ? handleSignup : handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {isSignup && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <label style={{ fontSize: '0.85rem', fontWeight: '600', color: '#334155' }}>Full Name</label>
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
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
                )}

                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontSize: '0.85rem', fontWeight: '600', color: '#334155' }}>
                    {isAdmin ? 'Admin' : 'Driver'} Email
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder={isAdmin ? "Enter Admin Email" : "Enter Driver Email"}
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
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
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
                  disabled={busy}
                  style={{
                    width: '100%',
                    padding: '14px 0',
                    borderRadius: '12px',
                    border: 'none',
                    background: isAdmin
                      ? 'linear-gradient(135deg, #1e3a8a, #2563eb)'
                      : 'linear-gradient(135deg, #ff7700, #fe7200)',
                    color: '#ffffff',
                    fontWeight: 'bold',
                    fontSize: '1rem',
                    cursor: 'pointer',
                    boxShadow: isAdmin
                      ? '0 8px 24px -4px rgba(30, 58, 138, 0.4)'
                      : '0 8px 24px -4px rgba(131, 79, 36, 0.4)',
                    transition: 'all 0.2s',
                    marginTop: '8px'
                  }}
                  onMouseOver={(e) => { e.currentTarget.style.transform = 'translateY(-1px)'; }}
                  onMouseOut={(e) => { e.currentTarget.style.transform = 'none'; }}
                >
                  {busy
                    ? (isSignup ? 'Creating account...' : 'Authenticating...')
                    : (isSignup 
                        ? 'Create Driver Account' 
                        : (isAdmin ? 'Login as Administrator' : 'Login as Driver'))
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

              {/* Back Link */}
              <div style={{ textAlign: 'center', marginTop: '24px', paddingTop: '16px', borderTop: '1px solid #e2e8f0' }}>
                <button
                  type="button"
                  onClick={() => window.location.href = '/'}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#64748b',
                    fontSize: '0.88rem',
                    fontWeight: '600',
                    cursor: 'pointer',
                    textDecoration: 'underline',
                    padding: 0
                  }}
                >
                  Back to Passenger Booking
                </button>
              </div>

            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
