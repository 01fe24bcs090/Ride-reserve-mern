import { HttpsError, onCall } from "firebase-functions/v2/https";
import { db } from "../lib/firebase.js";
import { ensureAnyRole, ensureRole } from "../lib/auth.js";
function parseDays(value) {
    if (Array.isArray(value)) {
        return value.map((item) => String(item).trim()).filter(Boolean);
    }
    if (typeof value === "string") {
        return value
            .split(/[,/|]/)
            .map((item) => item.trim())
            .filter(Boolean);
    }
    return [];
}
function normalizeType(value) {
    const clean = String(value ?? "").trim().toLowerCase();
    if (clean === "arriving") {
        return "arriving";
    }
    if (clean === "departing") {
        return "departing";
    }
    return "both";
}
function normalizeTrainRow(row) {
    const rawTrainNumber = String(row.trainNumber ?? "").trim();
    if (!rawTrainNumber) {
        throw new HttpsError("invalid-argument", "trainNumber is required");
    }
    const trainNumbers = rawTrainNumber.split(/[/,-]/).map((t) => t.trim()).filter(Boolean);
    const trainName = String(row.trainName ?? "").trim();
    const scheduledArrival = row.scheduledArrival ? String(row.scheduledArrival).trim() : null;
    const scheduledDeparture = row.scheduledDeparture ? String(row.scheduledDeparture).trim() : null;
    const platformNumber = String(row.platformNumber ?? "").trim();
    const origin = String(row.origin ?? "").trim();
    const destination = String(row.destination ?? "").trim();
    const daysOfOperation = parseDays(row.daysOfOperation);
    const type = normalizeType(row.type);
    const isActive = row.isActive === undefined ? true : Boolean(row.isActive);
    const updatedAt = new Date().toISOString();
    return trainNumbers.map((trainNumber) => ({
        trainNumber,
        trainName,
        scheduledArrival,
        scheduledDeparture,
        platformNumber,
        origin,
        destination,
        daysOfOperation,
        type,
        isActive,
        updatedAt,
    }));
}
export const lookupTrain = onCall(async (request) => {
    if (!request.auth) {
        throw new HttpsError("unauthenticated", "Authentication is required");
    }
    await ensureAnyRole(request.auth.uid, ["passenger", "driver", "admin"]);
    const trainNumber = String(request.data.trainNumber ?? "").trim();
    if (!trainNumber) {
        throw new HttpsError("invalid-argument", "trainNumber is required");
    }
    const trainSnapshot = await db.collection("trains").doc(trainNumber).get();
    if (!trainSnapshot.exists) {
        throw new HttpsError("not-found", "Train not found");
    }
    const train = trainSnapshot.data();
    if (!train.isActive) {
        throw new HttpsError("failed-precondition", "This train is currently not available for BOV booking");
    }
    return train;
});
export const importTrainsFromExcel = onCall(async (request) => {
    if (!request.auth) {
        throw new HttpsError("unauthenticated", "Authentication is required");
    }
    await ensureRole(request.auth.uid, "admin");
    const payload = request.data;
    const rows = Array.isArray(payload.rows) ? payload.rows : [];
    if (rows.length === 0) {
        throw new HttpsError("invalid-argument", "rows[] payload is required");
    }
    const dryRun = Boolean(payload.dryRun);
    const normalized = rows.flatMap((row, idx) => {
        if (!row || typeof row !== "object") {
            throw new HttpsError("invalid-argument", `Invalid row at index ${idx}`);
        }
        return normalizeTrainRow(row);
    });
    if (dryRun) {
        return {
            dryRun: true,
            processed: normalized.length,
            sample: normalized.slice(0, 5),
        };
    }
    let processed = 0;
    for (let i = 0; i < normalized.length; i += 500) {
        const chunk = normalized.slice(i, i + 500);
        const batch = db.batch();
        chunk.forEach((train) => {
            batch.set(db.collection("trains").doc(train.trainNumber), train, { merge: true });
            processed += 1;
        });
        await batch.commit();
    }
    return {
        processed,
        skipped: 0,
    };
});
