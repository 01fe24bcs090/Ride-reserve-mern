import { HttpsError } from "firebase-functions/v2/https";
import { db } from "./firebase.js";
export async function ensureRole(uid, expectedRole) {
    const userSnapshot = await db.collection("users").doc(uid).get();
    if (!userSnapshot.exists) {
        throw new HttpsError("failed-precondition", "User profile not found");
    }
    const user = userSnapshot.data();
    if (user.role !== expectedRole) {
        throw new HttpsError("permission-denied", `Only ${expectedRole} can perform this action`);
    }
    return userSnapshot.data();
}
export async function ensureAnyRole(uid, allowedRoles) {
    const userSnapshot = await db.collection("users").doc(uid).get();
    if (!userSnapshot.exists) {
        throw new HttpsError("failed-precondition", "User profile not found");
    }
    const user = userSnapshot.data();
    if (!allowedRoles.includes((user.role ?? ""))) {
        throw new HttpsError("permission-denied", "Insufficient permissions");
    }
    return userSnapshot.data();
}
