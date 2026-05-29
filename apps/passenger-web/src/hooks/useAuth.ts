import { useState, useEffect } from "react";
import { 
  loadPassengerProfile, 
  signInPassenger, 
  signUpPassenger, 
  signOutPassenger,
  PassengerProfile,
  PassengerSignInInput,
  PassengerSignUpInput
} from "../lib/auth";

export function useAuth() {
  const [passengerProfile, setPassengerProfile] = useState<PassengerProfile | null>(null);
  const [sessionReady, setSessionReady] = useState(false);
  const [authResolved, setAuthResolved] = useState(false);
  const [busy, setBusy] = useState(true);
  const [status, setStatus] = useState("");

  useEffect(() => {
    const initAuth = async () => {
      const token = localStorage.getItem('token');
      if (!token) {
        setPassengerProfile(null);
        setSessionReady(false);
        setAuthResolved(true);
        setBusy(false);
        return;
      }

      try {
        const liveProfile = await loadPassengerProfile();
        setPassengerProfile(liveProfile);
        setSessionReady(liveProfile.role === "passenger");
      } catch (error) {
        setPassengerProfile(null);
        setSessionReady(false);
        localStorage.removeItem('token');
        setStatus(error instanceof Error ? error.message : "Unable to load profile.");
      } finally {
        setAuthResolved(true);
        setBusy(false);
      }
    };

    initAuth();
  }, []);

  const login = async (input: PassengerSignInInput) => {
    setBusy(true);
    setStatus("Signing you in...");
    try {
      const profile = await signInPassenger(input);
      setPassengerProfile(profile);
      setSessionReady(true);
      setStatus("Login successful.");
      return profile;
    } catch (error: any) {
      const msg = error.response?.data?.error || error.message || "Authentication failed.";
      setStatus(msg);
      throw error;
    } finally {
      setBusy(false);
    }
  };

  const signup = async (input: PassengerSignUpInput) => {
    setBusy(true);
    setStatus("Creating account...");
    try {
      const result = await signUpPassenger(input);
      if (result && result.message === 'otp_sent') {
        setStatus("Verification code sent to your email.");
        return result;
      }
      setPassengerProfile(result);
      setSessionReady(true);
      setStatus("Account created successfully.");
      return result;
    } catch (error: any) {
      const msg = error.response?.data?.error || error.message || "Signup failed.";
      setStatus(msg);
      throw error;
    } finally {
      setBusy(false);
    }
  };

  const logout = async () => {
    setBusy(true);
    try {
      await signOutPassenger();
      setPassengerProfile(null);
      setSessionReady(false);
      setStatus("Signed out.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Sign out failed.");
    } finally {
      setBusy(false);
    }
  };

  return {
    passengerProfile,
    sessionReady,
    authResolved,
    busy,
    status,
    setStatus,
    login,
    signup,
    logout
  };
}
