# 📐 Ride Reserve - Platform System Architecture Models

This document outlines the **Context**, **Interaction**, **Behavioral**, and **Structural** design models of the **Ride Reserve - SmartBOV Platform** to establish a textbook-grade professional software architecture blueprint.

---

## 1. 🌐 Context Model (DFD Level 0)

The system context diagram illustrates the high-level boundary of the **Ride Reserve System** and its interaction with the surrounding external entities (Passenger, Driver, Station Admin, and Database), detailing the flow of input and output data.

### 🖼️ Visual Context Model Preview
![System Context Model](C:\Users\Shubhang R\.gemini\antigravity-ide\brain\62511ec3-fe1c-4b6b-be2a-7ef72675777d\uml_professional_context_model_1780175443619.png)


```mermaid
graph TD
    %% Define System Center
    subgraph System_Boundary ["System Boundary"]
        Core["Ride Reserve Server<br/>(Express API & Socket.io Gateway)"]
    end

    %% Define External Entities
    Passenger["👤 Passenger App Client"]
    Driver["🚕 Driver App Client"]
    Admin["⚙️ Station Admin Console"]
    LocalDB["🗄️ MongoDB Database"]

    %% Data Flows: Passenger
    Passenger -->|1. Create Booking Request & OTP validation| Core
    Core -->|2. Return Booking Summary, Queue Wait Time, Boarding PIN| Passenger
    Passenger -->|3. Trigger Emergency SOS| Core

    %% Data Flows: Driver
    Driver -->|4. Duty Status Toggle & Location Coordinates| Core
    Core -->|5. Dispatch Available Bookings Feed & Passenger Platform details| Driver
    Driver -->|6. Submit Boarding Verification PIN| Core

    %% Data Flows: Admin
    Admin -->|7. Configure Peak-Hour pricing tables & upload Train Timetables| Core
    Core -->|8. Push Real-time Queue Dashboard, Active Fleet, & SOS Alarms| Admin

    %% Data Flows: Database
    Core <-->|9. Fetch schedules / Create Booking logs| LocalDB
```

---

## 2. 🔄 Interaction Model: Sequence of Events

The sequence diagram below describes the real-time interaction flow of creating a booking, matching a driver, executing the secure boarding PIN handshake, and completing the trip.

### 🖼️ Visual Sequence Diagram Preview
![UML Sequence Diagram](C:\Users\Shubhang R\.gemini\antigravity-ide\brain\62511ec3-fe1c-4b6b-be2a-7ef72675777d\uml_professional_sequence_model_1780175464817.png)


```mermaid
sequenceDiagram
    autonumber
    actor Passenger as Passenger
    participant PassClient as Passenger React App
    participant Server as Express Gateway & API
    participant DB as MongoDB (Mongoose)
    participant Socket as Socket.io Server
    participant DrivClient as Driver React App
    actor Driver as Driver

    %% Phase 1: Booking Creation
    Passenger->>PassClient: Selects train & passengers, enters PNR/Train details
    PassClient->>Server: POST /api/bookings (Create Request payload)
    
    rect rgb(240, 240, 245)
        Note over Server, DB: Server-Side Processing Engine
        Server->>DB: Find active Train & check Peak-Hour tables
        DB-->>Server: Return active timetables & pricing rules
        Server->>Server: Calculate secure Fare (Base + Peak Multiplier + Surcharge)
        Server->>Server: Run Seat Sharing Optimizer (Pool compatibility check)
        Server->>Server: Generate unique 4-digit boarding startPin & bookingId
        Server->>DB: Save new Booking document (Status: pending)
        DB-->>Server: Success acknowledgement
    end
    
    Server-->>PassClient: Return confirmed booking details (including startPin)
    Server->>Socket: Emit 'new_booking_pending' (Payload)
    Socket-->>DrivClient: Broadcast new pending booking to all on-duty drivers
    PassClient->>Passenger: Display ticket summary & boarding OTP PIN

    %% Phase 2: Acceptance & Match
    Driver->>DrivClient: Select booking and tap Accept
    DrivClient->>Server: PATCH /api/bookings/:id/status (status: 'confirmed')
    Server->>DB: Update rideStatus='confirmed', acceptedBy=driverId, assign BOV
    DB-->>Server: Success acknowledgement
    Server->>Socket: Emit `booking_update_${bookingId}`
    Socket-->>PassClient: Broadcast ride accepted (Show driver & vehicle info)
    Server-->>DrivClient: Confirm acceptance success

    %% Phase 3: Physical Pickup & Verification PIN Handshake
    Driver->>Passenger: Driver arrives at platform and meets passenger
    Driver->>Passenger: Request 4-digit boarding PIN
    Passenger-->>Driver: Verbally provides startPin from screen
    Driver->>DrivClient: Enter PIN & tap Start Ride
    DrivClient->>Server: PATCH /api/bookings/:id/status (status: 'in-progress', pin)
    
    rect rgb(255, 240, 240)
        Note over Server, DB: Boarding Validation Handshake
        Server->>DB: Fetch booking by ID
        DB-->>Server: Return booking document
        Server->>Server: Validate: request.pin == booking.startPin
    end
    
    Server->>DB: Update rideStatus='in-progress'
    DB-->>Server: Success acknowledgement
    Server->>Socket: Emit `booking_update_${bookingId}` (status: 'in-progress')
    Socket-->>PassClient: Broadcast ride is in-progress (trip started)
    Server-->>DrivClient: Return start success
    
    %% Phase 4: Trip Completion
    Driver->>DrivClient: Complete trip and drop off passenger
    DrivClient->>Server: PATCH /api/bookings/:id/status (status: 'completed')
    Server->>DB: Update rideStatus='completed'
    DB-->>Server: Success acknowledgement
    Server->>Socket: Emit `booking_update_${bookingId}` (status: 'completed')
    Socket-->>PassClient: Broadcast ride completed (Show ratings screen)
    Server-->>DrivClient: Complete transaction
```

---

## 3. 🚦 Behavioral Model: Booking State Machine

This state chart outlines the lifecycle states of a Booking document, showcasing valid state transitions, triggers, and guards (such as PIN verification).

### 🖼️ Visual State Machine Preview
![UML Booking State Machine](C:\Users\Shubhang R\.gemini\antigravity-ide\brain\62511ec3-fe1c-4b6b-be2a-7ef72675777d\uml_professional_state_machine_1780175478677.png)


```mermaid
stateDiagram-v2
    [*] --> Pending : Passenger submits booking request (POST /api/bookings)
    
    state Pending {
        [*] --> Unpooled : No compatible concurrent booking found
        [*] --> Pooled : Grouped with compatible ride (seats sum <= 4)
    }

    Pending --> Cancelled : Passenger cancels ride (status='cancelled')
    Pending --> Confirmed : Driver accepts ride (status='confirmed')
    
    state Confirmed {
        Note right of Confirmed: Driver & BOV allocated, boarding PIN generated
    }

    Confirmed --> Cancelled : Passenger or Admin cancels ride
    
    Confirmed --> InProgress : Driver verifies 4-digit PIN (PATCH status='in-progress', pin == startPin)
    
    state InProgress {
        Note right of InProgress: Active ride, Emergency SOS trigger active
    }

    InProgress --> Completed : Driver drops passenger at destination (status='completed')
    
    Completed --> [*]
    Cancelled --> [*]
```

---

## 🗄️ 4. Structural Model: Mongoose Database Schemas (UML Class Diagram)

This class diagram represents the logical structural schemas in MongoDB modeled via Mongoose, illustrating their properties, data types, and collection associations.

### 🖼️ Visual Class Diagram Preview
![Mongoose Class Diagram](C:\Users\Shubhang R\.gemini\antigravity-ide\brain\62511ec3-fe1c-4b6b-be2a-7ef72675777d\uml_professional_class_model_1780175492025.png)


```mermaid
classDiagram
    class User {
        +String uid (PK)
        +String name
        +String email
        +String password (Optional)
        +String phone
        +String aadharNumber
        +Number age
        +UserRole role (passenger|driver|admin)
        +String assignedBovId
        +Boolean active
        +Date lastLoginAt
        +Boolean emailVerified
    }

    class Booking {
        +String bookingId (PK)
        +String passengerId (FK)
        +String passengerName
        +String trainNumber (FK)
        +JourneyType journeyType (arrival|departure)
        +Boolean isPriorityPassenger
        +Number lightLuggageCount
        +Number heavyLuggageCount
        +Number luggageWeight
        +String fromPlatform
        +String toPlatform
        +String pickupPoint
        +Number passengerCount
        +Number[] passengerAges
        +Number seats
        +Number[] seatNumbers
        +String bovId (FK)
        +String bovVehicleNumber
        +RideStatus rideStatus (pending|confirmed|in-progress|completed|cancelled)
        +Date scheduledTime
        +Boolean isPeakHour
        +Number fare
        +String acceptedBy (FK)
        +Boolean isSharedRide
        +String sharedPoolId
        +String startPin
    }

    class Bov {
        +String bovId (PK)
        +String vehicleNumber
        +Number totalSeats
        +BovStatus status (active|inactive|maintenance)
        +String assignedDriverId (FK)
        +String currentPlatform
    }

    class Train {
        +String trainNumber (PK)
        +String trainName
        +String type (arriving|departing|both)
        +String scheduledArrival
        +String scheduledDeparture
        +String platformNumber
        +String origin
        +String destination
        +String[] daysOfOperation
        +Boolean isActive
    }

    class PeakHour {
        +String label
        +String startTime (HH:mm)
        +String endTime (HH:mm)
        +Number multiplier
    }

    %% Associations and Relationships
    User "1" --> "0..*" Booking : books (passengerId)
    User "1" --> "0..*" Booking : accepts (acceptedBy)
    Bov "1" --> "0..*" Booking : services (bovId)
    Train "1" --> "0..*" Booking : references (trainNumber)
    Bov "1" --> "0..1" User : assigned to (assignedDriverId)
    User "1" --> "0..1" Bov : drives (assignedBovId)
```
