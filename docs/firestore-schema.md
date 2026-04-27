# Firestore Schema

This project uses two Firebase storage layers:

- Firebase Authentication stores secure login credentials such as email and password.
- Cloud Firestore stores application data such as passengers, drivers, BOVs, trains, bookings, and analytics.

Passwords should never be stored in Firestore.

## Core Collections

### `users/{uid}`

Used for passenger, driver, and admin profile data.

```json
{
  "uid": "firebase-auth-uid",
  "name": "Shubhang",
  "email": "name@example.com",
  "phone": "+91...",
  "age": 22,
  "role": "passenger",
  "assignedBovId": null,
  "fcmToken": null,
  "active": true,
  "createdAt": "2026-04-18T12:30:00.000Z",
  "updatedAt": "2026-04-18T12:30:00.000Z",
  "lastLoginAt": "2026-04-18T12:30:00.000Z"
}
```

### `users/{uid}/loginHistory/{entryId}`

Stores a lightweight audit trail for each login and signup event.

```json
{
  "eventType": "login",
  "email": "name@example.com",
  "createdAt": "2026-04-18T12:45:00.000Z",
  "userAgent": "Mozilla/5.0 ..."
}
```

### `bookings/{bookingId}`

Stores every passenger ride booking and current ride status.

```json
{
  "bookingId": "abc123",
  "passengerId": "firebase-auth-uid",
  "passengerName": "Shubhang",
  "trainNumber": "16590",
  "lookupType": "pnr",
  "pnr": "1234567890",
  "journeyType": "arrival",
  "isPriorityPassenger": false,
  "luggageType": "light",
  "fromPlatform": "4",
  "toPlatform": "2",
  "pickupPoint": null,
  "passengerCount": 2,
  "seats": 2,
  "seatNumbers": [1, 2],
  "bovId": "BOV-01",
  "bovVehicleNumber": "KA-25-EV-2044",
  "rideStatus": "confirmed",
  "scheduledTime": "Firestore Timestamp",
  "isPeakHour": true,
  "fare": 45,
  "createdAt": "Firestore Timestamp"
}
```

### `bovs/{bovId}`

Stores vehicle and assignment data.

```json
{
  "bovId": "BOV-01",
  "vehicleNumber": "KA-25-EV-2044",
  "totalSeats": 8,
  "status": "active",
  "assignedDriverId": "driver-uid",
  "currentPlatform": "2",
  "driverFcmToken": null
}
```

### `trains/{trainNumber}`

Stores train lookup and platform allocation data.

### `platforms/{platformId}`

Stores station platform definitions.

### `peakHours/{peakHourId}`

Stores surge pricing windows.

### `analytics/daily/summaries/{dateKey}`

Stores daily aggregate ride counts and revenue summaries.

## What Is Live After This Change

- Passenger signup creates a Firebase Auth account.
- Passenger profile data is saved to `users/{uid}`.
- Every signup and login is recorded in `users/{uid}/loginHistory`.
- Every confirmed ride is stored in `bookings/{bookingId}` by the booking function.
- Passenger booking history is read back from Firestore instead of local state.

## Still Managed Elsewhere

- Secure credentials such as passwords stay in Firebase Authentication.
- Driver and admin creation should still happen through privileged admin flows or Cloud Functions.
