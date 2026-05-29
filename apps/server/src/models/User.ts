import mongoose, { Schema, Document } from 'mongoose';
import { UserRole } from '@ride-reserve/types';

export interface IUser extends Document {
  uid: string; // Keep for backwards compatibility or use _id
  name: string;
  email: string;
  password?: string; // New field for local auth
  phone: string;
  aadharNumber?: string;
  age: number | null;
  role: UserRole;
  assignedBovId: string | null;
  fcmToken: string | null;
  active: boolean;
  lastLoginAt: Date | null;
  emailVerified: boolean;
}

const UserSchema: Schema = new Schema(
  {
    uid: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String },
    phone: { type: String, required: true },
    aadharNumber: { type: String, default: null },
    age: { type: Number, default: null },
    role: { type: String, enum: ['passenger', 'driver', 'admin'], required: true },
    assignedBovId: { type: String, default: null },
    fcmToken: { type: String, default: null },
    active: { type: Boolean, default: true },
    lastLoginAt: { type: Date, default: null },
    emailVerified: { type: Boolean, default: false },
  },
  { timestamps: true }
);

export default mongoose.model<IUser>('User', UserSchema);

