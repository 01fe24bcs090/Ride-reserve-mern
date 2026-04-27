import { HttpsError, onCall } from "firebase-functions/v2/https";
import { Timestamp } from "firebase-admin/firestore";
import { adminAuth, db } from "../lib/firebase.js";
import { ensureRole } from "../lib/auth.js";

export const createDriverAccount = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Authentication is required");
  }
  await ensureRole(request.auth.uid, "admin");

  const data = request.data as Record<string, unknown>;
  const email = String(data.email ?? "").trim().toLowerCase();
  const password = String(data.password ?? "");
  const name = String(data.name ?? "").trim();
  const phone = String(data.phone ?? "").trim();
  const assignedBovId = data.assignedBovId ? String(data.assignedBovId) : null;

  if (!email || !password || !name) {
    throw new HttpsError("invalid-argument", "name, email and password are required");
  }

  const userRecord = await adminAuth.createUser({
    email,
    password,
    displayName: name,
    phoneNumber: phone || undefined,
    disabled: false,
  });

  await adminAuth.setCustomUserClaims(userRecord.uid, { role: "driver" });

  await db.collection("users").doc(userRecord.uid).set({
    uid: userRecord.uid,
    name,
    email,
    phone,
    role: "driver",
    assignedBovId,
    fcmToken: null,
    createdAt: Timestamp.now(),
  });

  if (assignedBovId) {
    await db.collection("bovs").doc(assignedBovId).set(
      {
        assignedDriverId: userRecord.uid,
      },
      { merge: true },
    );
  }

  return {
    uid: userRecord.uid,
    email,
    assignedBovId,
  };
});
