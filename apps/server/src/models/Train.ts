import mongoose, { Schema, Document } from 'mongoose';

export interface ITrain extends Document {
  trainNumber: string;
  trainName: string;
  type: 'arriving' | 'departing' | 'both';
  scheduledArrival: string | null;
  scheduledDeparture: string | null;
  platformNumber: string;
  origin: string;
  destination: string;
  daysOfOperation: string[];
  isActive: boolean;
}

const TrainSchema: Schema = new Schema(
  {
    trainNumber: { type: String, required: true, unique: true },
    trainName: { type: String, required: true },
    type: { type: String, enum: ['arriving', 'departing', 'both'], required: true },
    scheduledArrival: { type: String, default: null },
    scheduledDeparture: { type: String, default: null },
    platformNumber: { type: String, required: true },
    origin: { type: String, required: true },
    destination: { type: String, required: true },
    daysOfOperation: [{ type: String }],
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export default mongoose.model<ITrain>('Train', TrainSchema);
