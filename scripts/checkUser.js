const admin = require("firebase-admin");
const path = require("path");
const fs = require("fs");

async function checkUser(email) {
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
  const snapshot = await db.collection("users").where("email", "==", email.toLowerCase()).get();

  if (snapshot.empty) {
    console.log(`No user found with email: ${email}`);
    return;
  }

  const userDoc = snapshot.docs[0];
  console.log("User Document Data:", JSON.stringify(userDoc.data(), null, 2));

  const userAuth = await admin.auth().getUserByEmail(email.toLowerCase());
  console.log("User Auth Custom Claims:", JSON.stringify(userAuth.customClaims, null, 2));
}

const email = process.argv[2] || "test_admin@example.com";
checkUser(email).catch(console.error);
