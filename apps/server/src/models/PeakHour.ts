import mongoose, { Schema, Document } from 'mongoose';

export interface IPeakHour extends Document {
  label: string;
  startTime: string; // HH:mm format
  endTime: string;   // HH:mm format
  multiplier: number;
}

const PeakHourSchema: Schema = new Schema(
  {
    label: { type: String, required: true },
    startTime: { type: String, required: true },
    endTime: { type: String, required: true },
    multiplier: { type: Number, required: true, default: 1.0 },
  },
  { timestamps: true }
);

export default mongoose.model<IPeakHour>('PeakHour', PeakHourSchema);
