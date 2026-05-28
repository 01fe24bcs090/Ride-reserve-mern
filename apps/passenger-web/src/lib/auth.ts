import type { UserDoc } from "@ride-reserve/types";
import api from "../api/client";

export interface PassengerProfile extends UserDoc {}

export interface PassengerSignUpInput {
  name: string;
  email: string;
  phone: string;
  age: number;
  password: string;
}

export interface PassengerSignInInput {
  email: string;
  password: string;
}

export async function loadPassengerProfile(): Promise<PassengerProfile> {
  const { data } = await api.get('/auth/me');
  if (data.role !== "passenger") {
    throw new Error("This account belongs to a different portal. Use the matching driver or admin app.");
  }
  return data;
}

export async function signUpPassenger(input: PassengerSignUpInput): Promise<PassengerProfile> {
  const { data } = await api.post('/auth/register', { ...input, role: 'passenger' });
  localStorage.setItem('token', data.token);
  return data.user;
}

export async function signInPassenger(input: PassengerSignInInput): Promise<PassengerProfile> {
  const { data } = await api.post('/auth/login', input);
  if (data.user.role !== "passenger") {
    throw new Error("This account belongs to a different portal. Use the matching driver or admin app.");
  }
  localStorage.setItem('token', data.token);
  return data.user;
}

export async function signOutPassenger(): Promise<void> {
  localStorage.removeItem('token');
}
