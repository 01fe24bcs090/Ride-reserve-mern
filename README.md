# Ride Reserve - SmartBOV Booking System

Monorepo scaffold for the Hubli Railway Station BOV booking platform.

## Architecture & Workspaces

This is a monorepo utilizing npm workspaces:
- `apps/server`: Express + MongoDB backend with socket.io support.
- `apps/passenger-web`: Vite-based React frontend for Passenger booking flow (reservation & non-reservation, train lookup, fare estimation).
- `apps/driver-web`: Vite-based React frontend driver dashboard.
- `apps/admin-web`: Vite-based React frontend admin console.
- `shared/types`: Shared TypeScript definitions across frontend and backend.

---

## Local Setup Guide

Follow these steps to run the Ride Reserve system locally on your machine.

### Prerequisites
- **Node.js**: Version `>=20`
- **MongoDB**: Local MongoDB instance (running on `mongodb://127.0.0.1:27017`) or a MongoDB Atlas connection string.

---

### Step 1: Environment Configuration

Before running the application, you need to create the `.env` configuration files for each workspace. Template `.env.example` files are provided in each folder.

1. **Root Configuration**:
   Copy `.env.example` in the root folder to `.env`:
   ```bash
   cp .env.example .env
   ```

2. **Server Workspace (`apps/server/.env`)**:
   Create `apps/server/.env` based on `apps/server/.env.example`:
   ```bash
   cp apps/server/.env.example apps/server/.env
   ```
   *Make sure `MONGO_URI` matches your local database or your Atlas URI.*

3. **Passenger Web Workspace (`apps/passenger-web/.env`)**:
   ```bash
   cp apps/passenger-web/.env.example apps/passenger-web/.env
   ```

4. **Driver Web Workspace (`apps/driver-web/.env`)**:
   ```bash
   cp apps/driver-web/.env.example apps/driver-web/.env
   ```

5. **Admin Web Workspace (`apps/admin-web/.env`)**:
   ```bash
   cp apps/admin-web/.env.example apps/admin-web/.env
   ```

---

### Step 2: Installation

Install all dependencies for all workspaces from the root of the project:
```bash
npm install
```

---

### Step 3: Seed the Database

A seeding script is provided to populate the MongoDB database with default drivers, BOVs, trains, peak hour fare configurations, and default users.

To seed the database, run:
```bash
npm run seed -w @ride-reserve/server
```

---

### Step 4: Import Train Timings (Optional)

You can import real train schedule data from the root `TRAIN_TIMINGS.csv` file into MongoDB by running:
```bash
npm run import-trains -w @ride-reserve/server
```

---

### Step 5: Running the Applications

You can start the entire stack (backend server + all 3 frontends) concurrently using:
```bash
npm run dev
```

Alternatively, you can run individual workspaces:
- **Server**: `npm run dev:server`
- **Passenger Web**: `npm run dev:passenger`
- **Driver Web**: `npm run dev:driver`
- **Admin Web**: `npm run dev:admin`

Once running:
- Server runs on: `http://localhost:5000`
- Passenger Web runs on: `http://localhost:5173` (or the next available port)
- Driver Web runs on: `http://localhost:5174` (or the next available port)
- Admin Web runs on: `http://localhost:5175` (or the next available port)

---

## Logins and Testing Accounts

After running the database seed script, you can log in to the respective portals using the following pre-configured credentials:

### 1. Admin Portal (`apps/admin-web`)
* **Email**: `admin@ridereserve.com`
* **Password**: `Shubhang#15#2006`

### 2. Driver Dashboard (`apps/driver-web`)
* **Driver 1 Email**: `driver1@ridereserve.com`
* **Driver 2 Email**: `driver2@ridereserve.com`
* **Password**: `password123`

### 3. Passenger Portal (`apps/passenger-web`)
* **Email**: `rahul@example.com`
* **Password**: `password123`

*Note: For the registration/OTP flow, since SMTP credentials might not be configured locally, the verification OTP is printed directly in the backend terminal logs when triggered.*
