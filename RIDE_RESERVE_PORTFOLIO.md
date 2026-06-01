# 🏎️ Ride Reserve - SmartBOV Booking Platform

> **A High-Performance, Real-Time MERN Monorepo for Smart Battery Operated Vehicle (BOV) Dispatch, Queue Management, and Dynamic Seat Pooling.**

---

## 🌟 Executive Summary

**Ride Reserve** is a state-of-the-art transit-hub mobility platform designed specifically for railway stations (pioneered for Hubli Railway Station) to manage and dispatch electric buggies—known as Battery Operated Vehicles (BOVs). 

The platform bridges the gap between limited station mobility assets and vulnerable passengers (elderly, pregnant, and Persons with Disabilities - PwD) by offering a seamless, priority-driven booking system. Built using a robust MERN (MongoDB, Express, React, Node.js) monorepo structure, the system orchestrates real-time passenger booking, automated seat allocation, peak-hour dynamic pricing, dynamic seat pooling, and driver dashboard workflows over instant WebSocket (Socket.io) channels.

---

## 🚀 Key Innovation Features

### 1. 👥 Dynamic Seat Sharing Optimizer (Carpooling Engine)
To maximize vehicle efficiency, the backend implements an automatic seat-sharing algorithm. When a booking is requested:
* The system checks for compatible pending bookings on the same train, platform, and journey path.
* If a match is found where the combined seats do not exceed a 4-passenger limit, the rides are merged into a unified `sharedPoolId`.
* This doubles vehicle throughput, minimizes passenger wait times, and reduces buggy congestion.

### 2. ⏱️ Active Queue Estimator
A dynamic queue-management engine tracks all pending bookings. By calculating active buggies against pending rides, the system calculates and displays:
* The exact **Queue Position** of a booking in real-time.
* A live **Estimated Wait Time** (in minutes) dynamically updated as drivers accept and complete rides.

### 3. 🎫 Dual Lookup Verification (PNR-First UX)
Catering to both reserved and unreserved passengers:
* **Reserved Path:** Passengers enter their 10-digit PNR. The system extracts their exact coach, platform, and train details automatically, minimizing manual data-entry errors.
* **Unreserved Path:** Passengers enter their train number, and the platform utilizes custom lookup indexes to fetch active timetables, with manual fallback options.

### 4. 🔒 Driver-Passenger Secure Handshake (OTP Verification)
To ensure the correct passenger is boarded:
* A unique, randomly generated 4-digit PIN (`startPin`) is created on the passenger’s ticket screen upon booking creation.
* The driver must physically meet the passenger and enter this verification PIN on their terminal to transition the ride state to `in-progress`.

### 5. 💰 Server-Side Secure Fare Engine & Dynamic Peak Pricing
Fares are computed securely on the backend using database configuration rules:
* Prevents client-side price tampering.
* Integrates a **Peak-Hour Multiplier** that automatically checks scheduled train arrivals/departures against configurable rush-hour tables in MongoDB.
* Automatically includes luggage weight surcharges (e.g., extra heavy luggage counts).

### 6. 🚨 Live Emergency SOS Broadcast
A real-time safety layer using WebSockets:
* Passengers or drivers can trigger an **SOS Emergency Alert** instantly from their interfaces.
* Immediately broadcasts geo-platform coordinates to all active admin dashboards via a persistent WebSocket stream with high-priority audio-visual signals.

---

## 🛠️ Architecture & Monorepo Structure

```mermaid
flowchart TD
    subgraph Client Apps (Vite + React + TS)
        P[Passenger Web Client]
        D[Driver Web Client]
        A[Admin Operations Console]
    end

    subgraph API & WebSocket Layer
        Gateway[Express REST API Gateway]
        WS[Socket.io Real-Time Server]
    end

    subgraph Core Engine
        AuthMid[JWT Authentication Middleware]
        FareEng[Secure Fare Engine & Peak-Hour Multiplier]
        PoolEng[Dynamic Seat Pooling Engine]
        QueueEng[Active Queue Manager]
    end

    subgraph Database Layer (MongoDB)
        DB[(Mongoose Models)]
    end

    P -->|REST API / HTTP| Gateway
    D -->|REST API / HTTP| Gateway
    A -->|REST API / HTTP| Gateway

    P <-->|WebSockets| WS
    D <-->|WebSockets| WS
    A <-->|WebSockets| WS

    Gateway --> AuthMid
    Gateway --> FareEng
    Gateway --> PoolEng
    Gateway --> QueueEng

    FareEng --> DB
    PoolEng --> DB
    QueueEng --> DB
    AuthMid --> DB
```

The codebase is engineered as a unified monorepo leveraging **npm workspaces** to allow seamless local type sharing:
* `apps/passenger-web`: Elegant customer portal for seat booking, train checks, active ride-status tracking, and PIN showcase.
* `apps/driver-web`: Driver utility console tracking allocated tasks, passenger check-ins, and ride lifecycle.
* `apps/admin-web`: Power panel showing real-time SOS indicators, live queue streams, active BOV allocations, train timetable uploads, and analytics charts.
* `apps/server`: Express backend gateway powered by MongoDB/Mongoose, holding full REST routes and the WebSocket host.
* `shared/types`: A centralized library keeping interface typings consistent across frontend UIs and backend servers.

---

## 🗄️ Database Schema & Data Models

The data layer is modeled using **Mongoose** for MongoDB with strong indexing:

### 1. Booking Schema (`Booking.ts`)
Tracks ride status, allocation details, pooling indicators, and secure PIN parameters.
```typescript
interface IBooking extends Document {
  bookingId: string;
  passengerId: string;
  passengerName: string;
  trainNumber: string;
  journeyType: 'arrival' | 'departure';
  isPriorityPassenger: boolean;
  lightLuggageCount: number;
  heavyLuggageCount: number;
  luggageWeight?: number;
  fromPlatform: string;
  toPlatform: string;
  pickupPoint: string | null;
  passengerCount: number;
  passengerAges: number[];
  seats: number;
  bovId: string;
  bovVehicleNumber: string;
  rideStatus: 'pending' | 'confirmed' | 'in-progress' | 'completed' | 'cancelled';
  scheduledTime: Date;
  isPeakHour: boolean;
  fare: number;
  acceptedBy: string | null;
  isSharedRide: boolean;
  sharedPoolId: string;
  startPin: string;
}
```

### 2. Battery Operated Vehicle (BOV) Schema (`Bov.ts`)
```typescript
interface IBov extends Document {
  bovId: string;
  vehicleNumber: string;
  totalSeats: number;
  status: 'active' | 'inactive' | 'maintenance';
  assignedDriverId: string | null;
  currentPlatform: string;
}
```

### 3. Peak Hour Rule Schema (`PeakHour.ts`)
```typescript
interface IPeakHour extends Document {
  label: string;
  startTime: string; // HH:mm format
  endTime: string;   // HH:mm format
  multiplier: number;
}
```

---

## 💻 Tech Stack & Dependencies

| Layer | Technology | Key Capabilities Used |
| :--- | :--- | :--- |
| **Frontend** | **React 18, TypeScript, Vite** | Fast build speeds, robust compilation types, modular design system, responsive Vanilla CSS layout |
| **Backend** | **Node.js, Express** | Modular controller/routing pipeline, environment configurations |
| **Database** | **MongoDB & Mongoose** | Document modeling, atomic updates (`$lte`, `$gte`), schema level validations |
| **Real-time** | **Socket.io** | Two-way events, SOS emergency broadcast streams, real-time driver positioning coordinates |
| **Utilities** | **XLSX, CSV-Parser** | Background scripts to parse and seed bulk train timetables directly into MongoDB |
| **Execution**| **Npm Workspaces, Concurrently**| Single-command local developer environments running all micro-apps simultaneously |

---

## ⚡ Setup & Installation

### Prerequisites
* Node.js (version 20 or higher recommended)
* MongoDB Local Instance or MongoDB Atlas URI

### 1. Clone & Install Dependencies
From the monorepo root directory:
```bash
npm install
```

### 2. Configure Environment Variables
Create an `.env` file inside `apps/server/.env`:
```env
PORT=5000
MONGO_URI=mongodb://127.0.0.1:27017/ride-reserve
JWT_SECRET=your_super_secure_jwt_token_secret
BASE_FARE=20
```

Configure React client connection environments as required by `.env` blueprints in their respective application directories.

### 3. Timetable Schedule Seeding (Optional)
To import train schedules from bulk spreadsheets into your database:
```bash
npm run seed -w @ride-reserve/server
```

### 4. Run the Dev Environment
To spin up all four workspaces (Express API, Passenger Web, Driver Web, and Admin Web) in parallel:
```bash
npm run dev
```

---

## 🛡️ Security Audit & Hardening

* **Authentication Integration:** Leverages custom JSON Web Token (JWT) credentials securely attached to user logins, preventing anonymous data mining.
* **Role-Based Access Control (RBAC):** Backend route middleware explicitly checks tokens for `admin`, `driver`, or `passenger` scopes, denying illegal actions (e.g., passengers modifying vehicle statuses or assigning drivers).
* **Data Privacy Isolation:** Restricts bookings lookups (`/me` endpoint) to the authorized `passengerId`, ensuring passengers only access their individual profiles.
* **Safe Fare Enforcement:** Strips user-supplied fare parameters upon REST request and triggers a read-only MongoDB aggregation pipeline to compute costs server-side based on actual railway schedules.

---

## 💎 Portfolio Highlights & Focus Points

When demonstrating this project to potential employers or clients, highlight the following:
* **The Monorepo Architecture:** Demonstrates your capability in orchestrating modern workspace architectures, sharing static typings between frontend layouts and backend controllers.
* **Enterprise WebSocket Integration:** Highlights familiarity with real-time architectures, illustrating how standard transactional actions (bookings) naturally cascade into dynamic events (live driver views, instant admin queues, SOS alerts).
* **Complex Backend Algorithms:** The dynamic seat-sharing optimizer and peak-hour fare calculation engine prove strong technical coding and algorithmic capabilities.
* **Production-Grade Security Hygiene:** Shows an understanding of software security audits, illustrating how server validations protect API endpoints from common threats.
