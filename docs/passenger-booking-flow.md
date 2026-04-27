# Passenger BOV Booking Flow (Passenger POV)

Source references:
- `C:\Users\Shubhang R\Downloads\Passenger.png`
- `C:\Users\Shubhang R\Downloads\BOV_Booking_System_Requirements.md`

## Flowchart (as shown in Passenger.png)

```mermaid
flowchart TD
    A["Login / Register<br/>(Phone number + OTP)<br/>Profile: Name, Phone, Age"] --> B["Book BOV"]
    B --> C["Number of Passengers?"]
    C --> D["Any Elderly / PwD?<br/>Yes or No"]
    D --> E["Journey Type?<br/>Arrival or Departure"]

    E -->|Arrival| F["Enter Your PNR<br/>(auto-fetch: platform, coach, train name)"]
    F --> G["Luggage?<br/>None / Light / Heavy"]

    E -->|Departure| H["Do you have a reservation?<br/>Yes or No"]
    H -->|Yes| I["Enter Your PNR<br/>(auto-fetch: platform, coach, train name)"]
    H -->|No| J["Enter Train No.<br/>(manual platform selection shown)"]
    I --> K["Select Pickup Point<br/>Point A / Point B / Point C / Point D"]
    J --> K
    K --> L["Luggage?<br/>None / Light / Heavy"]

    G --> M["Confirmation Screen<br/>Summary: passengers, priority flag, journey type,<br/>platform/pickup, train details, luggage type<br/>Action: Confirm Booking"]
    L --> M

    M --> N["Later: Booking confirmed<br/>Token generated (example: HHBL-047)<br/>Driver and station staff notified"]
    N --> O["Ride complete and rating"]
```

## Screen-level input map

1. Login/Register: `phoneOtp`, `name`, `age`
2. Trip basics: `passengerCount`, `isPriorityPassenger`, `journeyType`
3. Arrival path: `pnr`, `luggageType`
4. Departure path:
   - Reservation yes: `pnr`, `pickupPoint`, `luggageType`
   - Reservation no: `trainNumber`, `pickupPoint`, `luggageType`
5. Confirmation: all fields + fetched train metadata + final submit

## Alignment note with requirements doc

The requirements file currently defines primary lookup by `trainNumber`.  
This passenger flow introduces a PNR-first option for reserved passengers.  
Recommended unified rule:

1. If PNR is available, fetch train and coach details from PNR first.
2. If PNR is unavailable, fallback to train number + manual platform/pickup selection.
3. Persist both `lookupType` (`pnr` or `trainNumber`) and normalized train/platform fields in booking data.
