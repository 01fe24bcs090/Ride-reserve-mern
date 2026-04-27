import { onSchedule } from "firebase-functions/v2/scheduler";
import { Timestamp } from "firebase-admin/firestore";
import { db } from "../lib/firebase.js";

function toDateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export const getDailyRideSummary = onSchedule("59 23 * * *", async () => {
  const today = new Date();
  const dateKey = toDateKey(today);

  const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);
  const yesterdayTimestamp = Timestamp.fromDate(yesterday);

  const snapshot = await db
    .collection("bookings")
    .where("rideStatus", "in", ["confirmed", "in-progress", "completed"])
    .where("createdAt", ">=", yesterdayTimestamp)
    .get();

  let totalRides = 0;
  let totalRevenue = 0;
  let peakRides = 0;
  const byBov: Record<string, number> = {};
  const routeHeatmap: Record<string, number> = {};

  snapshot.docs.forEach((doc) => {
    const booking = doc.data() as Record<string, unknown>;
    totalRides += 1;
    totalRevenue += Number(booking.fare ?? 0);
    if (booking.isPeakHour) {
      peakRides += 1;
    }
    const bovId = String(booking.bovId ?? "unassigned");
    byBov[bovId] = (byBov[bovId] ?? 0) + 1;
    const routeKey = `${booking.fromPlatform ?? "?"}->${booking.toPlatform ?? "?"}`;
    routeHeatmap[routeKey] = (routeHeatmap[routeKey] ?? 0) + 1;
  });

  await db
    .collection("analytics")
    .doc("daily")
    .collection("summaries")
    .doc(dateKey)
    .set({
      date: dateKey,
      totalRides,
      totalRevenue,
      peakRides,
      offPeakRides: totalRides - peakRides,
      ridesPerBov: byBov,
      popularRoutes: routeHeatmap,
      generatedAt: Timestamp.now(),
    });
});
