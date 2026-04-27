import type { UserDoc } from "@ride-reserve/types";
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  type User,
} from "firebase/auth";
import {
  addDoc,
  collection,
  doc,
  getDoc,
  setDoc,
  updateDoc,
} from "firebase/firestore";
import { auth, db, firebaseReady } from "./firebase";

export interface PassengerProfile extends UserDoc {}

export interface PassengerSignUpInput {
  name: string;
  email: string;
  phone: string;
  age: number;
  password: string;
}

export interface PassengerSignInInput {
  email: string;
  password: string;
}

function requireFirebase() {
  if (!firebaseReady || !auth || !db) {
    throw new Error("Firebase is not configured for this app yet.");
  }
}

function isoNow() {
  return new Date().toISOString();
}

function userRef(uid: string) {
  requireFirebase();
  return doc(db!, "users", uid);
}

function normalizePassengerProfile(uid: string, data: Record<string, unknown>, fallbackEmail: string) {
  const role = data.role === "driver" || data.role === "admin" ? data.role : "passenger";
  return {
    uid,
    name: typeof data.name === "string" ? data.name : "Passenger",
    email: typeof data.email === "string" ? data.email : fallbackEmail,
    phone: typeof data.phone === "string" ? data.phone : "",
    age: typeof data.age === "number" ? data.age : null,
    role,
    assignedBovId: typeof data.assignedBovId === "string" ? data.assignedBovId : null,
    fcmToken: typeof data.fcmToken === "string" ? data.fcmToken : null,
    active: data.active === false ? false : true,
    createdAt: typeof data.createdAt === "string" ? data.createdAt : isoNow(),
    updatedAt: typeof data.updatedAt === "string" ? data.updatedAt : isoNow(),
    lastLoginAt: typeof data.lastLoginAt === "string" ? data.lastLoginAt : null,
  } satisfies PassengerProfile;
}

async function recordLoginEvent(uid: string, email: string, eventType: "signup" | "login") {
  requireFirebase();
  await addDoc(collection(db!, "users", uid, "loginHistory"), {
    eventType,
    email,
    createdAt: isoNow(),
    userAgent: window.navigator.userAgent,
  });
}

async function ensurePassengerProfile(user: User, seed?: Partial<PassengerProfile>) {
  const snapshot = await getDoc(userRef(user.uid));
  if (!snapshot.exists()) {
    const now = isoNow();
    const profile: PassengerProfile = {
      uid: user.uid,
      name: seed?.name ?? user.displayName ?? "Passenger",
      email: seed?.email ?? user.email ?? "",
      phone: seed?.phone ?? "",
      age: seed?.age ?? null,
      role: "passenger",
      assignedBovId: null,
      fcmToken: null,
      active: true,
      createdAt: now,
      updatedAt: now,
      lastLoginAt: now,
    };
    await setDoc(userRef(user.uid), profile, { merge: true });
    return profile;
  }

  return normalizePassengerProfile(user.uid, snapshot.data(), user.email ?? "");
}

export function subscribeToAuthChanges(callback: (user: User | null) => void) {
  if (!firebaseReady || !auth) {
    callback(null);
    return () => {};
  }

  return onAuthStateChanged(auth, callback);
}

export async function loadPassengerProfile(user: User) {
  const profile = await ensurePassengerProfile(user);
  if (profile.role !== "passenger") {
    throw new Error("This account belongs to a different portal. Use the matching driver or admin app.");
  }
  return profile;
}

export async function signUpPassenger(input: PassengerSignUpInput) {
  requireFirebase();

  const credential = await createUserWithEmailAndPassword(auth!, input.email, input.password);
  const now = isoNow();
  const profile: PassengerProfile = {
    uid: credential.user.uid,
    name: input.name.trim(),
    email: input.email.trim().toLowerCase(),
    phone: input.phone.trim(),
    age: input.age,
    role: "passenger",
    assignedBovId: null,
    fcmToken: null,
    active: true,
    createdAt: now,
    updatedAt: now,
    lastLoginAt: now,
  };

  await setDoc(userRef(credential.user.uid), profile, { merge: true });
  await recordLoginEvent(credential.user.uid, profile.email, "signup");
  return profile;
}

export async function signInPassenger(input: PassengerSignInInput) {
  requireFirebase();

  const credential = await signInWithEmailAndPassword(
    auth!,
    input.email.trim().toLowerCase(),
    input.password,
  );
  const profile = await ensurePassengerProfile(credential.user, {
    email: input.email.trim().toLowerCase(),
  });

  if (profile.role !== "passenger") {
    throw new Error("This account belongs to a different portal. Use the matching driver or admin app.");
  }

  const loginAt = isoNow();
  await updateDoc(userRef(credential.user.uid), {
    lastLoginAt: loginAt,
    updatedAt: loginAt,
  });
  await recordLoginEvent(credential.user.uid, profile.email, "login");

  return {
    ...profile,
    lastLoginAt: loginAt,
    updatedAt: loginAt,
  } satisfies PassengerProfile;
}

export async function signOutPassenger() {
  if (!auth) {
    return;
  }
  await signOut(auth);
}
