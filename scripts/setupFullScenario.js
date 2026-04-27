#!/usr/bin/env node
/**
 * Sets up the complete end-to-end scenario:
 * 1. Creates 3 accounts: passenger, admin, driver (if not existing)
 * 2. Creates 6 BOVs — one per platform 1-6 (skips duplicates)
 * 3. Assigns driver to BOV-P1 (platform 1)
 * 4. Creates platforms 1-6 in Firestore (skips duplicates)
 */
const admin = require("firebase-admin");
const path = require("path");

const serviceAccountPath = path.resolve(process.cwd(), "service-account.json");
admin.initializeApp({
  credential: admin.credential.cert(require(serviceAccountPath)),
  projectId: "ride-reserve",
});

const db = admin.firestore();

// ─── Account definitions ─────────────────────────────────────────────
const ACCOUNTS = [
  { email: "admin@ridereserve.com",     password: "Admin@123",     name: "Admin User",     role: "admin",     phone: "9999999999" },
  { email: "driver@ridereserve.com",    password: "Driver@123",    name: "Driver User",    role: "driver",    phone: "8888888888" },
  { email: "passenger@ridereserve.com", password: "Passenger@123", name: "Passenger User", role: "passenger", phone: "7777777777" },
];

// ─── BOV definitions (one per platform 1-6) ──────────────────────────
const BOVS = [
  { bovId: "BOV-P1", vehicleNumber: "KA-25-EV-0001", totalSeats: 8, currentPlatform: "1" },
  { bovId: "BOV-P2", vehicleNumber: "KA-25-EV-0002", totalSeats: 8, currentPlatform: "2" },
  { bovId: "BOV-P3", vehicleNumber: "KA-25-EV-0003", totalSeats: 8, currentPlatform: "3" },
  { bovId: "BOV-P4", vehicleNumber: "KA-25-EV-0004", totalSeats: 8, currentPlatform: "4" },
  { bovId: "BOV-P5", vehicleNumber: "KA-25-EV-0005", totalSeats: 8, currentPlatform: "5" },
  { bovId: "BOV-P6", vehicleNumber: "KA-25-EV-0006", totalSeats: 8, currentPlatform: "6" },
];

// ─── Platform definitions ────────────────────────────────────────────
const PLATFORMS = [
  { platformId: "PLAT-1", platformName: "Platform 1", platformNumber: "1" },
  { platformId: "PLAT-2", platformName: "Platform 2", platformNumber: "2" },
  { platformId: "PLAT-3", platformName: "Platform 3", platformNumber: "3" },
  { platformId: "PLAT-4", platformName: "Platform 4", platformNumber: "4" },
  { platformId: "PLAT-5", platformName: "Platform 5", platformNumber: "5" },
  { platformId: "PLAT-6", platformName: "Platform 6", platformNumber: "6" },
];

async function ensureAccount(acc) {
  let userRecord;
  try {
    userRecord = await admin.auth().getUserByEmail(acc.email);
    console.log(`  ✓ Auth account exists: ${acc.email} (${userRecord.uid})`);
  } catch {
    userRecord = await admin.auth().createUser({
      email: acc.email,
      password: acc.password,
      displayName: acc.name,
      emailVerified: true,
    });
    console.log(`  ✚ Created auth account: ${acc.email} (${userRecord.uid})`);
  }

  // Set custom claims
  await admin.auth().setCustomUserClaims(userRecord.uid, { role: acc.role });

  // Upsert Firestore doc
  const docRef = db.collection("users").doc(userRecord.uid);
  const docSnap = await docRef.get();
  if (!docSnap.exists) {
    await docRef.set({
      uid: userRecord.uid,
      name: acc.name,
      email: acc.email,
      phone: acc.phone,
      age: null,
      role: acc.role,
      assignedBovId: null,
      fcmToken: null,
      active: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      lastLoginAt: null,
    });
    console.log(`  ✚ Created Firestore user doc for ${acc.email}`);
  } else {
    // Ensure role is correct
    await docRef.update({ role: acc.role, updatedAt: new Date().toISOString() });
    console.log(`  ✓ Firestore user doc exists for ${acc.email}`);
  }

  return userRecord.uid;
}

async function main() {
  console.log("\n═══════════════════════════════════════════════════════════");
  console.log("  🔧 RIDE RESERVE — FULL SCENARIO SETUP");
  console.log("═══════════════════════════════════════════════════════════\n");

  // ── STEP 1: Accounts ──────────────────────────────────────────
  console.log("📋 STEP 1: Ensuring all accounts exist...");
  const uids = {};
  for (const acc of ACCOUNTS) {
    uids[acc.role] = await ensureAccount(acc);
  }

  // ── STEP 2: Clean old BOVs ─────────────────────────────────────
  console.log("\n🗑️  STEP 2: Cleaning old BOVs with stale driver references...");
  const oldBovs = await db.collection("bovs").get();
  let cleaned = 0;
  for (const d of oldBovs.docs) {
    const id = d.id;
    // Keep our new BOV-P* entries, delete old ones
    if (!id.startsWith("BOV-P")) {
      await d.ref.delete();
      cleaned++;
      console.log(`  🗑️ Deleted old BOV: ${id}`);
    }
  }
  if (cleaned === 0) console.log("  ✓ No stale BOVs to clean.");

  // ── STEP 3: BOVs ──────────────────────────────────────────────
  console.log("\n🚐 STEP 3: Ensuring BOVs (one per platform)...");
  for (const bov of BOVS) {
    const docRef = db.collection("bovs").doc(bov.bovId);
    const existing = await docRef.get();
    if (existing.exists) {
      console.log(`  ✓ ${bov.bovId} already exists at platform ${bov.currentPlatform}`);
      // Update the driver assignment for ALL BOVs to the driver user
      await docRef.update({ assignedDriverId: uids.driver, status: "active" });
    } else {
      await docRef.set({
        bovId: bov.bovId,
        vehicleNumber: bov.vehicleNumber,
        totalSeats: bov.totalSeats,
        status: "active",
        currentPlatform: bov.currentPlatform,
        assignedDriverId: uids.driver,
      });
      console.log(`  ✚ Created ${bov.bovId} — ${bov.vehicleNumber} at platform ${bov.currentPlatform}`);
    }
  }

  // ── STEP 4: Link driver to their first BOV ────────────────────
  console.log("\n👤 STEP 4: Linking driver account to BOV-P1...");
  await db.collection("users").doc(uids.driver).update({
    assignedBovId: "BOV-P1",
    updatedAt: new Date().toISOString(),
  });
  console.log(`  ✓ Driver ${uids.driver} → BOV-P1`);

  // ── STEP 5: Platforms ──────────────────────────────────────────
  console.log("\n🏗️  STEP 5: Ensuring platforms 1-6...");
  // Delete old platform docs to avoid duplicates
  const oldPlatforms = await db.collection("platforms").get();
  for (const d of oldPlatforms.docs) {
    await d.ref.delete();
  }
  for (const plat of PLATFORMS) {
    await db.collection("platforms").doc(plat.platformId).set(plat);
    console.log(`  ✚ ${plat.platformName}`);
  }

  // ── STEP 6: Ensure a peak hour window ─────────────────────────
  console.log("\n⏰ STEP 6: Ensuring peak hours...");
  const peakSnap = await db.collection("peakHours").get();
  if (peakSnap.empty) {
    await db.collection("peakHours").doc("PEAK-MORNING").set({
      id: "PEAK-MORNING",
      label: "Morning Rush",
      startTime: "08:00",
      endTime: "10:30",
      multiplier: 1.5,
    });
    console.log("  ✚ Added Morning Rush peak hour (08:00-10:30, 1.5x)");
  } else {
    console.log(`  ✓ ${peakSnap.size} peak hour(s) already exist.`);
  }

  // ── Summary ────────────────────────────────────────────────────
  console.log("\n═══════════════════════════════════════════════════════════");
  console.log("  🎉 SETUP COMPLETE!");
  console.log("═══════════════════════════════════════════════════════════");
  console.log("");
  console.log("  ACCOUNTS:");
  console.log("  ┌────────────┬───────────────────────────────┬─────────────────┐");
  console.log("  │ Role       │ Email                         │ Password        │");
  console.log("  ├────────────┼───────────────────────────────┼─────────────────┤");
  for (const acc of ACCOUNTS) {
    console.log(`  │ ${acc.role.padEnd(10)} │ ${acc.email.padEnd(29)} │ ${acc.password.padEnd(15)} │`);
  }
  console.log("  └────────────┴───────────────────────────────┴─────────────────┘");
  console.log("");
  console.log("  BOVs: 6 (one per platform 1-6), all assigned to driver");
  console.log("  Driver UID:", uids.driver);
  console.log("");
  console.log("  SUCCESS SCENARIO:");
  console.log("  1. Login as passenger@ridereserve.com on http://localhost:5173");
  console.log("  2. Look up a train (e.g. 06919 on Platform 4)");
  console.log("  3. Book a ride → gets assigned to BOV-P4");
  console.log("  4. Login as driver@ridereserve.com on http://localhost:5174");
  console.log("  5. Driver sees the ride → Start → Complete");
  console.log("");
}

main().catch((err) => {
  console.error("❌ Fatal:", err.message);
  process.exit(1);
});
