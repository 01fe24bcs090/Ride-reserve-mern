#!/usr/bin/env node

const admin = require("firebase-admin");
const path = require("path");
const fs = require("fs");

// ─── CONFIG: New accounts to create ─────────────────────────────────────────
const NEW_ADMIN = {
  email: "admin@ridereserve.com",
  password: "Admin@123",
  name: "Admin User",
  phone: "9999999999",
};

const NEW_DRIVER = {
  email: "driver@ridereserve.com",
  password: "Driver@123",
  name: "Driver User",
  phone: "8888888888",
};
// ─────────────────────────────────────────────────────────────────────────────

async function main() {
  // 1. Initialize Admin SDK
  const serviceAccountPath = path.resolve(process.cwd(), "service-account.json");
  if (!fs.existsSync(serviceAccountPath)) {
    console.error("❌ service-account.json not found in root directory.");
    process.exit(1);
  }

  admin.initializeApp({
    credential: admin.credential.cert(require(serviceAccountPath)),
    projectId: "ride-reserve",
  });

  const db = admin.firestore();

  // ── STEP 1: Delete ALL Firebase Auth users ──────────────────────────────
  console.log("\n🗑️  STEP 1: Deleting all Firebase Auth users...");
  let deletedAuthCount = 0;
  let nextPageToken;
  do {
    const listResult = await admin.auth().listUsers(1000, nextPageToken);
    const uids = listResult.users.map((u) => u.uid);
    if (uids.length > 0) {
      const result = await admin.auth().deleteUsers(uids);
      deletedAuthCount += result.successCount;
      if (result.failureCount > 0) {
        console.warn(`  ⚠️  ${result.failureCount} auth deletions failed.`);
        result.errors.forEach((e) => console.warn(`    - ${e.error.message}`));
      }
    }
    nextPageToken = listResult.pageToken;
  } while (nextPageToken);
  console.log(`  ✅ Deleted ${deletedAuthCount} auth accounts.`);

  // ── STEP 2: Delete ALL Firestore /users documents ───────────────────────
  console.log("\n🗑️  STEP 2: Deleting all Firestore /users documents...");
  let deletedDocsCount = 0;
  const usersSnapshot = await db.collection("users").get();
  if (!usersSnapshot.empty) {
    const batch = db.batch();
    usersSnapshot.forEach((doc) => {
      batch.delete(doc.ref);
      deletedDocsCount++;
    });
    await batch.commit();
  }
  console.log(`  ✅ Deleted ${deletedDocsCount} user documents.`);

  // ── STEP 3: Create new Admin account ────────────────────────────────────
  console.log("\n🆕 STEP 3: Creating new Admin account...");
  const adminUser = await admin.auth().createUser({
    email: NEW_ADMIN.email,
    password: NEW_ADMIN.password,
    displayName: NEW_ADMIN.name,
    emailVerified: true,
  });

  // Set custom claims
  await admin.auth().setCustomUserClaims(adminUser.uid, { role: "admin" });

  // Create Firestore document
  await db.collection("users").doc(adminUser.uid).set({
    uid: adminUser.uid,
    name: NEW_ADMIN.name,
    email: NEW_ADMIN.email,
    phone: NEW_ADMIN.phone,
    age: null,
    role: "admin",
    assignedBovId: null,
    fcmToken: null,
    active: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    lastLoginAt: null,
  });

  console.log(`  ✅ Admin created: ${NEW_ADMIN.email} / ${NEW_ADMIN.password}`);

  // ── STEP 4: Create new Driver account ───────────────────────────────────
  console.log("\n🆕 STEP 4: Creating new Driver account...");
  const driverUser = await admin.auth().createUser({
    email: NEW_DRIVER.email,
    password: NEW_DRIVER.password,
    displayName: NEW_DRIVER.name,
    emailVerified: true,
  });

  // Set custom claims
  await admin.auth().setCustomUserClaims(driverUser.uid, { role: "driver" });

  // Create Firestore document
  await db.collection("users").doc(driverUser.uid).set({
    uid: driverUser.uid,
    name: NEW_DRIVER.name,
    email: NEW_DRIVER.email,
    phone: NEW_DRIVER.phone,
    age: null,
    role: "driver",
    assignedBovId: null,
    fcmToken: null,
    active: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    lastLoginAt: null,
  });

  console.log(`  ✅ Driver created: ${NEW_DRIVER.email} / ${NEW_DRIVER.password}`);

  // ── Summary ─────────────────────────────────────────────────────────────
  console.log("\n" + "═".repeat(55));
  console.log("  🎉 ACCOUNT RESET COMPLETE");
  console.log("═".repeat(55));
  console.log(`  Deleted ${deletedAuthCount} auth accounts`);
  console.log(`  Deleted ${deletedDocsCount} Firestore user docs`);
  console.log("");
  console.log("  NEW ACCOUNTS:");
  console.log(`  ┌──────────┬───────────────────────────┬─────────────┐`);
  console.log(`  │ Role     │ Email                     │ Password    │`);
  console.log(`  ├──────────┼───────────────────────────┼─────────────┤`);
  console.log(`  │ Admin    │ ${NEW_ADMIN.email.padEnd(25)} │ ${NEW_ADMIN.password.padEnd(11)} │`);
  console.log(`  │ Driver   │ ${NEW_DRIVER.email.padEnd(25)} │ ${NEW_DRIVER.password.padEnd(11)} │`);
  console.log(`  └──────────┴───────────────────────────┴─────────────┘`);
  console.log("");
}

main().catch((err) => {
  console.error("❌ Fatal error:", err.message);
  process.exit(1);
});
