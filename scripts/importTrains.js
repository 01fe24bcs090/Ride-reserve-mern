#!/usr/bin/env node

/* eslint-disable no-console */
const fs = require("fs");
const path = require("path");
const csv = require("csv-parser");
const xlsx = require("xlsx");
const admin = require("firebase-admin");

function parseArgs(argv) {
  const flags = {};
  for (let i = 2; i < argv.length; i += 1) {
    const item = argv[i];
    if (!item.startsWith("--")) {
      continue;
    }
    const [key, inlineValue] = item.slice(2).split("=");
    if (inlineValue !== undefined) {
      flags[key] = inlineValue;
      continue;
    }
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) {
      flags[key] = true;
      continue;
    }
    flags[key] = next;
    i += 1;
  }
  return flags;
}

function pick(row, keys) {
  for (const key of keys) {
    const matched = Object.keys(row).find(
      (header) => header.trim().toLowerCase() === key.trim().toLowerCase(),
    );
    if (matched && row[matched] !== undefined && row[matched] !== null && row[matched] !== "") {
      return String(row[matched]).trim();
    }
  }
  return "";
}

function parseDays(value) {
  if (!value) {
    return [];
  }
  return String(value)
    .split(/[,/|]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseTrainType(value) {
  const clean = String(value || "").trim().toLowerCase();
  if (clean === "arriving") {
    return "arriving";
  }
  if (clean === "departing") {
    return "departing";
  }
  return "both";
}

function normalizeRow(row) {
  const rawTrainNumber = pick(row, ["Train Number", "Train No", "trainNumber", "Train_No"]);
  if (!rawTrainNumber) {
    return { skip: true, reason: "missing train number" };
  }
  const trainNumbers = rawTrainNumber.split(/[/,-]/).map((t) => t.trim()).filter(Boolean);

  const trainName = pick(row, ["Train Name", "trainName"]);
  const scheduledArrival = pick(row, ["Arrival Time", "Scheduled Arrival", "scheduledArrival"]) || null;
  const scheduledDeparture = pick(row, ["Departure Time", "Scheduled Departure", "scheduledDeparture"]) || null;
  const platformNumber = pick(row, ["Platform No.", "Platform No", "Platform", "platformNumber"]);
  const origin = pick(row, ["Origin", "From", "origin"]);
  const destination = pick(row, ["Destination", "To", "destination"]);
  const daysOfOperation = parseDays(pick(row, ["Days of Operation", "Days", "daysOfOperation"]));
  const type = parseTrainType(pick(row, ["Type", "type"]));

  const docs = trainNumbers.map((trainNumber) => ({
    trainNumber,
    trainName,
    scheduledArrival,
    scheduledDeparture,
    platformNumber,
    origin,
    destination,
    daysOfOperation,
    type,
    isActive: true,
    updatedAt: new Date().toISOString(),
  }));

  return {
    skip: false,
    docs,
  };
}

async function readCsvRows(filePath) {
  return new Promise((resolve, reject) => {
    const rows = [];
    fs.createReadStream(filePath)
      .pipe(csv())
      .on("data", (row) => rows.push(row))
      .on("end", () => resolve(rows))
      .on("error", reject);
  });
}

async function readInputRows(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".csv") {
    return readCsvRows(filePath);
  }
  const workbook = xlsx.readFile(filePath, { cellDates: false });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    throw new Error("No sheets found in Excel file");
  }
  const sheet = workbook.Sheets[sheetName];
  return xlsx.utils.sheet_to_json(sheet, { defval: "" });
}

async function upsertChunk(db, chunk) {
  const batch = db.batch();
  chunk.forEach((doc) => {
    batch.set(db.collection("trains").doc(doc.trainNumber), doc, { merge: true });
  });
  await batch.commit();
}

async function main() {
  const args = parseArgs(process.argv);
  const inputFile = args.file;
  const dryRun = Boolean(args["dry-run"] || args.dryRun);

  if (!inputFile) {
    throw new Error("Missing --file argument");
  }
  if (!fs.existsSync(inputFile)) {
    throw new Error(`Input file not found: ${inputFile}`);
  }

  const rows = await readInputRows(inputFile);
  const validDocs = [];
  let skipped = 0;

  rows.forEach((row, index) => {
    const normalized = normalizeRow(row);
    if (normalized.skip) {
      skipped += 1;
      console.warn(`Skipping row ${index + 2}: ${normalized.reason}`);
      return;
    }
    validDocs.push(...normalized.docs);
  });

  console.log(`Rows read: ${rows.length}`);
  console.log(`Valid trains: ${validDocs.length}`);
  console.log(`Skipped rows: ${skipped}`);

  if (dryRun) {
    console.log("Dry run mode: no writes will be performed.");
    console.log("Detected headers:", Object.keys(rows[0] || {}));
    console.log("Sample docs:", validDocs.slice(0, 3));
    return;
  }

  if (!admin.apps.length) {
    const serviceAccountPath = path.resolve(process.cwd(), "service-account.json");
    if (fs.existsSync(serviceAccountPath)) {
      console.log("Using service-account.json for authentication...");
      admin.initializeApp({
        credential: admin.credential.cert(require(serviceAccountPath)),
        projectId: "ride-reserve",
      });
    } else {
      console.log("Using Application Default Credentials...");
      admin.initializeApp({
        credential: admin.credential.applicationDefault(),
        projectId: "ride-reserve",
      });
    }
  }

  const db = admin.firestore();
  for (let i = 0; i < validDocs.length; i += 500) {
    const chunk = validDocs.slice(i, i + 500);
    await upsertChunk(db, chunk);
    console.log(`Committed ${Math.min(i + 500, validDocs.length)} / ${validDocs.length}`);
  }

  console.log("Train import completed successfully.");
}

main().catch((err) => {
  console.error("Import failed:", err.message);
  process.exit(1);
});
