export type UserRole = 'user' | 'admin';

export interface User {
  id: number;
  name: string;
  email: string;
  role: UserRole;
  createdAt: string;
}

export interface TimeSlot {
  id: number;
  title: string;
  description: string;
  startTime: string;
  endTime: string;
  createdAt: string;
}

export interface Booking {
  id: number;
  slotId: number;
  userId: number;
  notes: string;
  status: 'confirmed' | 'cancelled';
  createdAt: string;
  cancelledAt: string | null;
  slotTitle: string;
  slotDescription: string;
  startTime: string;
  endTime: string;
}

export interface AdminBooking extends Booking {
  userName: string;
  userEmail: string;
}

export interface AdminSlot extends TimeSlot {
  activeBookingId: number | null;
  activeBookingNotes: string | null;
  bookedByName: string | null;
  bookedByEmail: string | null;
}

export type ActiveView = 'slots' | 'bookings' | 'admin';
