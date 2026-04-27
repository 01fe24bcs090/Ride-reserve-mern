const admin = require("firebase-admin");
const path = require("path");
const fs = require("fs");

async function listUsers() {
  const serviceAccountPath = path.resolve(process.cwd(), "service-account.json");
  if (!fs.existsSync(serviceAccountPath)) {
    console.error("service-account.json not found");
    return;
  }

  admin.initializeApp({
    credential: admin.credential.cert(require(serviceAccountPath)),
    projectId: "ride-reserve",
  });

  const db = admin.firestore();
  const snapshot = await db.collection("users").get();

  if (snapshot.empty) {
    console.log("No users found in Firestore.");
  } else {
    console.log(`Found ${snapshot.size} users:`);
    snapshot.forEach(doc => {
      console.log(`- ${doc.id}: ${JSON.stringify(doc.data())}`);
    });
  }
}

listUsers().catch(console.error);
