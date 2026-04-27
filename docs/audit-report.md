# Ride Reserve System Audit & Improvement Plan

This document outlines security vulnerabilities, performance bottlenecks, and structural improvements for the Ride Reserve platform.

## 1. Security & Data Privacy (Critical)

### 🚨 Firestore Rule Leaks
Currently, any signed-in user can read all documents in the `bookings` collection and create bookings directly in Firestore.

*   **Problem**: A malicious passenger could use the Firebase Console or a script to view every other passenger's name, route, and time.
*   **Problem**: Allowing direct `create` on `bookings` bypasses the `allocateBooking` Cloud Function. This allows users to book seats without paying the correct fare or following seat limits.
*   **Fix**:
    *   Disable direct `create` on `bookings` for non-admin users.
    *   Restrict `read` on `bookings` so passengers only see their own rides, and drivers only see "pending" rides or rides they have accepted.

### 🔐 Role Management
Roles are currently stored in the Firestore `users` document and checked there.
*   **Improvement**: While the current rules check the Custom Claims (`request.auth.token.role`) first, the Cloud Functions only check the Firestore document.
*   **Fix**: Update Cloud Functions to verify the role from `request.auth.token` for better performance and security.

---

## 2. Scalability & Performance (High Priority)

### 📈 Analytics Function Bottleneck
The `getDailyRideSummary` function currently performs a broad `get()` on all bookings with active statuses.
*   **Problem**: As the system history grows, this query will become increasingly slow and expensive, eventually hitting the 10MB limit or timing out.
*   **Fix**: Add a date filter to only fetch bookings created or scheduled within the last 24-48 hours.

### 🚕 Driver Marketplace Query
The driver app fetches all pending, confirmed, and in-progress rides and filters them in React.
*   **Problem**: A driver in one station doesn't need to see rides in progress at another station.
*   **Fix**: Add a filter for `fromPlatform` (once assigned to a BOV) and use a more efficient query.

### ⚡ Seat Allocation Efficiency
The `allocateBooking` function fetches every BOV at a platform and then performs a separate query for each BOV to count seats.
*   **Problem**: If there are 10 BOVs at a platform, that's 10 extra round-trips to the database.
*   **Fix**: Fetch all concurrent bookings for the entire platform in a single query and perform the seat logic in memory.

---

## 3. Implementation Plan

### Phase 1: Security Hardening (Immediate)
1.  Update `firestore.rules` to restrict `bookings` read/create access.
2.  Update `onBookingCreate` to enforce stricter validation.

### Phase 2: Scalability Fixes
1.  Optimize `getDailyRideSummary` with date filters.
2.  Refactor `allocateBooking` to use a single platform-wide query instead of per-BOV queries.

### Phase 3: UI & UX Smoothness
1.  Refactor `useDriverRides` to use server-side filtering where possible.
2.  Add a "Refresh" capability to the Admin dashboard analytics (currently only nightly).

---

## 4. Proposed Firestore Rules Update

```javascript
match /bookings/{bookingId} {
  // Only the Cloud Function (Admin SDK) should create bookings to ensure allocation logic is followed
  allow create: if false; 
  
  allow read: if signedIn() && (
    isAdmin() 
    || (resource != null && resource.data.passengerId == request.auth.uid)
    || (resource != null && resource.data.acceptedBy == request.auth.uid)
    || (isDriver() && resource.data.rideStatus == "pending")
  );
  
  allow update: if signedIn() && (
    isAdmin() 
    || (isDriver() && request.resource.data.diff(resource.data).affectedKeys().hasOnly(["rideStatus", "acceptedBy", "bovId", "bovVehicleNumber"]))
    || (resource.data.passengerId == request.auth.uid && request.resource.data.rideStatus == "cancelled" && request.resource.data.diff(resource.data).affectedKeys().hasOnly(["rideStatus"]))
  );
}
```

> [!IMPORTANT]
> The current `.gitignore` correctly handles `service-account.json`. Ensure this file is never removed from the ignore list.
