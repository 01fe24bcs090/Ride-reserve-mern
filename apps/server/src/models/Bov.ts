import mongoose, { Schema, Document } from 'mongoose';
import { BovStatus } from '@ride-reserve/types';

export interface IBov extends Document {
  bovId: string;
  vehicleNumber: string;
  totalSeats: number;
  status: BovStatus;
  assignedDriverId: string | null;
  currentPlatform: string;
}

const BovSchema: Schema = new Schema(
  {
    bovId: { type: String, required: true, unique: true },
    vehicleNumber: { type: String, required: true, unique: true },
    totalSeats: { type: Number, required: true },
    status: { type: String, enum: ['active', 'inactive', 'maintenance'], required: true },
    assignedDriverId: { type: String, default: null },
    currentPlatform: { type: String, required: true },
  },
  { timestamps: true }
);

export default mongoose.model<IBov>('Bov', BovSchema);
