export interface User {
  id: number;
  name: string;
  email: string;
  role: 'user' | 'admin';
}

export interface TimeSlot {
  id: number;
  title: string;
  slot_date: string;
  start_time: string;
  end_time: string;
  location: string;
  created_at: string;
  is_booked: boolean;
  booked_by_me: boolean;
  active_booking_id: number | null;
  booked_by_name: string | null;
  booked_by_email: string | null;
  booking_notes: string | null;
}

export interface Booking {
  id: number;
  slot_id: number;
  user_id: number;
  notes: string;
  status: 'confirmed' | 'cancelled';
  created_at: string;
  cancelled_at: string | null;
  slot_title: string;
  slot_date: string;
  start_time: string;
  end_time: string;
  location: string;
  user_name?: string;
  user_email?: string;
}

export type AppView = 'slots' | 'my-bookings' | 'admin-bookings' | 'admin-slots';
