import { useState, useEffect } from "react";
import { User } from "firebase/auth";
import { 
  subscribeToAuthChanges, 
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
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");

  useEffect(() => {
    const unsubscribe = subscribeToAuthChanges(async (user: User | null) => {
      if (!user) {
        setPassengerProfile(null);
        setSessionReady(false);
        setAuthResolved(true);
        return;
      }

      try {
        const liveProfile = await loadPassengerProfile(user);
        setPassengerProfile(liveProfile);
        setSessionReady(liveProfile.role === "passenger");
      } catch (error) {
        setPassengerProfile(null);
        setSessionReady(false);
        setStatus(error instanceof Error ? error.message : "Unable to load profile.");
      } finally {
        setAuthResolved(true);
      }
    });

    return unsubscribe;
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
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Authentication failed.";
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
      const profile = await signUpPassenger(input);
      setPassengerProfile(profile);
      setSessionReady(true);
      setStatus("Account created successfully.");
      return profile;
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Signup failed.";
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
