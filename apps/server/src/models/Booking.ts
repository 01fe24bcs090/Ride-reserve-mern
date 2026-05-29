import mongoose, { Schema, Document } from 'mongoose';
import { JourneyType, RideStatus } from '@ride-reserve/types';

export interface IBooking extends Document {
  bookingId: string;
  passengerId: string;
  passengerName: string;
  trainNumber: string;
  journeyType: JourneyType;
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
  seatNumbers: number[];
  bovId: string;
  bovVehicleNumber: string;
  rideStatus: RideStatus;
  scheduledTime: Date;
  isPeakHour: boolean;
  fare: number;
  acceptedBy: string | null;
  isSharedRide: boolean;
  sharedPoolId: string;
  startPin: string;
}

const BookingSchema: Schema = new Schema(
  {
    bookingId: { type: String, required: true, unique: true },
    passengerId: { type: String, required: true },
    passengerName: { type: String, required: true },
    trainNumber: { type: String, required: true },
    journeyType: { type: String, enum: ['arrival', 'departure'], required: true },
    isPriorityPassenger: { type: Boolean, default: false },
    lightLuggageCount: { type: Number, default: 0 },
    heavyLuggageCount: { type: Number, default: 0 },
    luggageWeight: { type: Number, default: 0 },
    fromPlatform: { type: String, required: true },
    toPlatform: { type: String, required: true },
    pickupPoint: { type: String, default: null },
    passengerCount: { type: Number, required: true },
    passengerAges: [{ type: Number }],
    seats: { type: Number, required: true },
    seatNumbers: [{ type: Number }],
    bovId: { type: String, default: '' },
    bovVehicleNumber: { type: String, default: '' },
    rideStatus: { 
      type: String, 
      enum: ['pending', 'confirmed', 'in-progress', 'completed', 'cancelled'], 
      default: 'pending' 
    },
    scheduledTime: { type: Date, required: true },
    isPeakHour: { type: Boolean, default: false },
    fare: { type: Number, required: true },
    acceptedBy: { type: String, default: null },
    isSharedRide: { type: Boolean, default: false },
    sharedPoolId: { type: String, default: '' },
    startPin: { type: String, default: '' },
  },
  { timestamps: true }
);

export default mongoose.model<IBooking>('Booking', BookingSchema);
