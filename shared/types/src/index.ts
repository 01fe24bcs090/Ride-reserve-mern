export type UserRole = "passenger" | "driver" | "admin";

export type BovStatus = "active" | "inactive" | "maintenance";
export type RideStatus =
  | "pending"
  | "confirmed"
  | "in-progress"
  | "completed"
  | "cancelled";

export type JourneyType = "arrival" | "departure";
export type LuggageType = "none" | "light" | "heavy";

export interface UserDoc {
  uid: string;
  name: string;
  email: string;
  phone: string;
  age: number | null;
  role: UserRole;
  assignedBovId: string | null;
  fcmToken: string | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
  lastLoginAt: string | null;
}

export interface LoginHistoryDoc {
  eventType: "signup" | "login";
  email: string;
  createdAt: string;
  userAgent: string;
}

export interface BovDoc {
  bovId: string;
  vehicleNumber: string;
  totalSeats: number;
  status: BovStatus;
  assignedDriverId: string | null;
  currentPlatform: string;
  createdAt: string;
}

export interface TrainDoc {
  trainNumber: string;
  trainName: string;
  type: "arriving" | "departing" | "both";
  scheduledArrival: string | null;
  scheduledDeparture: string | null;
  platformNumber: string;
  origin: string;
  destination: string;
  daysOfOperation: string[];
  isActive: boolean;
}

export interface PeakHourDoc {
  id?: string;
  label: string;
  startTime: string;
  endTime: string;
  multiplier: number;
}

export interface PlatformDoc {
  platformId: string;
  platformName: string;
  platformNumber: string;
}

export interface BookingDoc {
  bookingId: string;
  passengerId: string;
  passengerName: string;
  trainNumber: string;
  journeyType: JourneyType;
  isPriorityPassenger: boolean;
  luggageType: LuggageType;
  fromPlatform: string;
  toPlatform: string;
  pickupPoint: string | null;
  passengerCount: number;
  seats: number;
  seatNumbers: number[];
  bovId: string;
  bovVehicleNumber: string;
  rideStatus: RideStatus;
  scheduledTime: string;
  isPeakHour: boolean;
  fare: number;
  acceptedBy: string | null;
  createdAt: string;
}

export interface BookingCreateInput {
  trainNumber: string;
  seats: number;
  toPlatform: string;
  journeyType: JourneyType;
  pickupPoint?: string;
  luggageType: LuggageType;
  isPriorityPassenger: boolean;
  passengerCount: number;
}
