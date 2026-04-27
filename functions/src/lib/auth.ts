import { HttpsError } from "firebase-functions/v2/https";
import { db } from "./firebase.js";

export async function ensureRole(uid: string, expectedRole: "admin" | "driver" | "passenger") {
  const userSnapshot = await db.collection("users").doc(uid).get();
  if (!userSnapshot.exists) {
    throw new HttpsError("failed-precondition", "User profile not found");
  }
  const user = userSnapshot.data() as { role?: string };
  if (user.role !== expectedRole) {
    throw new HttpsError(
      "permission-denied",
      `Only ${expectedRole} can perform this action`,
    );
  }
  return userSnapshot.data() as Record<string, unknown>;
}

export async function ensureAnyRole(
  uid: string,
  allowedRoles: Array<"admin" | "driver" | "passenger">,
) {
  const userSnapshot = await db.collection("users").doc(uid).get();
  if (!userSnapshot.exists) {
    throw new HttpsError("failed-precondition", "User profile not found");
  }
  const user = userSnapshot.data() as { role?: string };
  if (!allowedRoles.includes((user.role ?? "") as "admin" | "driver" | "passenger")) {
    throw new HttpsError("permission-denied", "Insufficient permissions");
  }
  return userSnapshot.data() as Record<string, unknown>;
}
