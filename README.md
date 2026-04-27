# Ride Reserve - SmartBOV Booking System

Monorepo scaffold for the Hubli Railway Station BOV booking platform, built from:
- `C:\Users\Shubhang R\Downloads\BOV_Booking_System_Requirements.md`
- `C:\Users\Shubhang R\Desktop\RIDE RESERVE\docs\passenger-booking-flow.md`
- `C:\Users\Shubhang R\Downloads\smartbov_color_palette.svg`

## Apps

- `apps/passenger-web`: Passenger booking flow with reservation and non-reservation branches, train lookup, fare estimate, and booking confirmation.
- `apps/driver-web`: Driver dashboard for allocated rides and status transitions.
- `apps/admin-web`: Admin console for BOV, driver, train, booking, peak-hour, platform, and analytics management.

## Backend

- `functions/src/bookings`: `onBookingCreate`, `getFareEstimate`, transaction-based seat allotment.
- `functions/src/trains`: `lookupTrain`, `importTrainsFromExcel`.
- `functions/src/users`: `createDriverAccount`.
- `functions/src/analytics`: `getDailyRideSummary` scheduled aggregation.
- `functions/src/notifications`: `onBovStatusChange` push notifications.

## Data and Security

- Firestore rules: `firestore.rules`
- Firestore indexes: `firestore.indexes.json`
- Shared schema types: `shared/types/src/index.ts`

## Train Import

Script:
- `scripts/importTrains.js`

Usage:

```bash
node scripts/importTrains.js --file=data/hubli_trains.xlsx --dry-run
node scripts/importTrains.js --file=data/hubli_trains.xlsx
```

## Run Locally

```bash
npm install
npm run dev:passenger
npm run dev:driver
npm run dev:admin
```

Functions build:

```bash
npm run build -w functions
```

## Notes

- `.env.example` includes required frontend Firebase variables and base fare config.
- Current UIs are production-oriented scaffolds with mock fallback behavior when Firebase env is not configured.
- Passenger flow includes PNR-first UX and train-number lookup path; booking payload persists `lookupType` for normalization.
