# 📊 Passenger App - Use Case Diagram & Specification

This document presents a comprehensive **Use Case Diagram** and detailed specifications for the Passenger web portal of the **Ride Reserve - SmartBOV Platform**.

## 🖼️ Visual Use Case Diagram

![Passenger Use Case Diagram](C:\Users\Shubhang R\.gemini\antigravity-ide\brain\62511ec3-fe1c-4b6b-be2a-7ef72675777d\passenger_uml_professional_1780174013078.png)

---


## 🗺️ Use Case Diagram (Mermaid)

The diagram below represents the interaction between the **Passenger** (Primary Actor), the **Station Staff/Driver** (Secondary Actor), the **Admin** (Secondary Actor), and the various systems within the Passenger Portal boundary.

```mermaid
flowchart LR
    %% Define Primary Actor
    Passenger((icon:user Passenger))
    
    %% Define System Boundary
    subgraph Passenger_Portal ["Passenger Web Application Boundary"]
        %% Authentication Use Cases
        UC_Auth["Login / Register<br/>(Phone & OTP Verification)"]
        UC_Profile["Setup/Manage Profile<br/>(Name, Phone, Age)"]
        
        %% Booking Use Cases
        UC_Book["Book SmartBOV Ride"]
        UC_Lookup_PNR["PNR Auto-Fetch<br/>(Train, Coach, Platform)"]
        UC_Lookup_Train["Train Number Lookup<br/>(Manual Fallback)"]
        UC_Select_Pickup["Select Station Pickup/Drop Point"]
        UC_Select_Luggage["Specify Luggage Tier<br/>(Light / Heavy Surcharge)"]
        
        %% Ride Tracking Use Cases
        UC_Track["Track Real-time Ride Status"]
        UC_Queue["View Live Queue Position & Wait Time"]
        UC_PIN["Verify Boarding PIN<br/>(Secure Handshake)"]
        UC_Cancel["Cancel Pending Booking"]
        
        %% Safety & Feedback Use Cases
        UC_SOS["🚨 Trigger Emergency SOS Alert"]
        UC_History["View Ride History"]
        UC_Rate["Rate Completed Ride"]
    end
    
    %% Define Secondary Actors & Systems
    Driver((Driver / BOV))
    Admin((Station Admin))

    %% Connections for Authentication
    Passenger --> UC_Auth
    Passenger --> UC_Profile

    %% Connections for Booking
    Passenger --> UC_Book
    UC_Book -.->|"<<include>>"| UC_Select_Pickup
    UC_Book -.->|"<<include>>"| UC_Select_Luggage
    UC_Book -.->|"<<extend>> (If Reserved)"| UC_Lookup_PNR
    UC_Book -.->|"<<extend>> (If Unreserved)"| UC_Lookup_Train
    
    %% Connections for Ride Lifecycle
    Passenger --> UC_Track
    UC_Track -.->|"<<include>>"| UC_Queue
    UC_Track -.->|"<<include>>"| UC_PIN
    Passenger --> UC_Cancel
    
    %% Connections for Verification Handshake
    UC_PIN <-->|OTP Exchange| Driver
    
    %% Connections for Safety & Feedback
    Passenger --> UC_SOS
    Passenger --> UC_History
    Passenger --> UC_Rate
    
    UC_SOS --> Admin
    UC_SOS --> Driver
```

---

## 📝 Use Case Specifications

### 1. Account Lifecycle
* **Login / Register:**
  * **Actor:** Passenger.
  * **Flow:** Passenger inputs phone number -> receives mock/production OTP -> verifies OTP -> enters system.
  * **Post-condition:** A JSON Web Token (JWT) is assigned for secure session validation.
* **Setup/Manage Profile:**
  * **Actor:** Passenger.
  * **Flow:** Input details such as Name, Phone, and Age.
  * **Business Rule:** Age parameter triggers the priority passenger criteria if they are classified as elderly or PwD (Persons with Disabilities).

---

### 2. The Booking Engine (Core Flow)
* **Book SmartBOV Ride:**
  * **Actor:** Passenger.
  * **Details:** The main wizard flow that aggregates inputs for a BOV seat allocation.
* **PNR Auto-Fetch (Optional):**
  * **Actor:** Passenger.
  * **Flow:** When selecting "Arrival" or "Departure with Reservation", the user inputs a 10-digit PNR. The local database automatically resolves and matches the coach, platform, and train details.
* **Train Number Lookup (Fallback):**
  * **Actor:** Passenger.
  * **Flow:** If booking without a reservation, the user enters the Train Number. The local timetable database matches the train, letting the user manually select their station pickup point.
* **Specify Luggage Tier:**
  * **Actor:** Passenger.
  * **Flow:** User selects luggage quantity/weight category (`None`, `Light`, or `Heavy`). Heavy luggage automatically triggers a secure backend surcharge (+₹10).

---

### 3. Queue & Ride Security Handshake
* **View Live Queue Position & Wait Time:**
  * **Actor:** Passenger.
  * **Details:** As soon as a booking is confirmed as `pending`, the database calculates active buggies on duty and pending queues. The passenger gets continuous live feedback on their estimated arrival time.
* **Verify Boarding PIN:**
  * **Actor:** Passenger & Driver.
  * **Security Rule:** Prevents drivers from misallocating seats. The passenger displays their unique 4-digit `startPin`. The driver must physically input this PIN on their device to change the booking status to `in-progress`.
* **Cancel Pending Booking:**
  * **Actor:** Passenger.
  * **Rule:** A passenger can cancel a booking, but only if its status is still `pending` or `confirmed` (before boarding starts).

---

### 4. Safety & Feedback
* **🚨 Trigger Emergency SOS Alert:**
  * **Actor:** Passenger.
  * **Details:** Available throughout the active ride. When pressed, it broadcasts coordinates instantly over Socket.io, lighting up the admin dashboards with visual and audio SOS alarms.
* **Rate Completed Ride:**
  * **Actor:** Passenger.
  * **Details:** Allows passenger to leave rating scores for the driver to maintain quality control.
