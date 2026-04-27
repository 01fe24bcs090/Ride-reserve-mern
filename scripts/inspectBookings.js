const admin = require("firebase-admin");
const path = require("path");

const serviceAccountPath = path.resolve(process.cwd(), "service-account.json");
admin.initializeApp({
  credential: admin.credential.cert(require(serviceAccountPath)),
  projectId: "ride-reserve",
});

const db = admin.firestore();

async function listRecentBookings() {
  console.log("Fetching recent bookings...");
  const snapshot = await db.collection("bookings").orderBy("createdAt", "desc").limit(5).get();
  
  if (snapshot.empty) {
    console.log("No bookings found.");
    return;
  }

  snapshot.forEach(doc => {
    const data = doc.data();
    console.log(`Document ID: ${doc.id}`);
    console.log(`  Field bookingId: ${data.bookingId}`);
    console.log(`  rideStatus: ${data.rideStatus}`);
    console.log(`  passengerName: ${data.passengerName}`);
    console.log("-------------------");
  });
}

listRecentBookings().catch(console.error);
