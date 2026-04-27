#!/usr/bin/env node

const admin = require("firebase-admin");
const path = require("path");
const fs = require("fs");

async function main() {
  const email = process.argv[2];
  if (!email) {
    console.error("Usage: node scripts/promoteToAdmin.js <email>");
    process.exit(1);
  }

  const serviceAccountPath = path.resolve(process.cwd(), "service-account.json");
  if (!fs.existsSync(serviceAccountPath)) {
    console.error("service-account.json not found in root directory.");
    process.exit(1);
  }

  admin.initializeApp({
    credential: admin.credential.cert(require(serviceAccountPath)),
    projectId: "ride-reserve",
  });

  const db = admin.firestore();
  const usersRef = db.collection("users");
  const snapshot = await usersRef.where("email", "==", email.toLowerCase()).get();

  if (snapshot.empty) {
    console.error(`No user found with email: ${email}`);
    console.log("Tip: Make sure you have signed up as a passenger on the website first.");
    process.exit(1);
  }

  const userDoc = snapshot.docs[0];
  const uid = userDoc.id;

  await userDoc.ref.update({
    role: "admin",
    updatedAt: new Date().toISOString()
  });

  // Also set custom claims so the rules can pick it up from the token
  await admin.auth().setCustomUserClaims(uid, { role: "admin" });

  console.log(`Success! User ${email} has been promoted to ADMIN.`);
  console.log("You can now login at https://ride-reserve-admin.web.app");
}

main().catch(err => {
  console.error("Error:", err.message);
  process.exit(1);
});
