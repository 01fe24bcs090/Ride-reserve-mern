const admin = require("firebase-admin");
const path = require("path");
const fs = require("fs");

async function listAuthUsers() {
  const serviceAccountPath = path.resolve(process.cwd(), "service-account.json");
  if (!fs.existsSync(serviceAccountPath)) {
    console.error("service-account.json not found");
    return;
  }

  admin.initializeApp({
    credential: admin.credential.cert(require(serviceAccountPath)),
    projectId: "ride-reserve",
  });

  const listUsersResult = await admin.auth().listUsers(1000);
  listUsersResult.users.forEach((userRecord) => {
    console.log(`- ${userRecord.uid}: ${userRecord.email} (Claims: ${JSON.stringify(userRecord.customClaims)})`);
  });
}

listAuthUsers().catch(console.error);
