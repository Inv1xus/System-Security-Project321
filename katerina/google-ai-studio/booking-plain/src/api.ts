import type { Booking, TimeSlot, User } from './types';

async function request<T>(url: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(url, {
    ...options,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = typeof data?.error === 'string' ? data.error : `Request failed (${response.status})`;
    const err = new Error(message) as Error & { status?: number; hasActiveBooking?: boolean };
    err.status = response.status;
    err.hasActiveBooking = Boolean(data?.hasActiveBooking);
    throw err;
  }

  return data as T;
}

export const api = {
  getMe: () => request<{ user: User }>('/api/auth/me'),

  signup: (payload: { name: string; email: string; password: string }) =>
    request<{ user: User }>('/api/auth/signup', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  login: (payload: { email: string; password: string }) =>
    request<{ user: User }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  logout: () =>
    request<{ ok: boolean }>('/api/auth/logout', {
      method: 'POST',
    }),

  getSlots: (date?: string) => {
    const qs = date ? `?date=${encodeURIComponent(date)}` : '';
    return request<{ slots: TimeSlot[] }>(`/api/slots${qs}`);
  },

  createSlot: (payload: {
    title: string;
    slot_date: string;
    start_time: string;
    end_time: string;
    location: string;
  }) =>
    request<{ slot: TimeSlot }>('/api/slots', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  deleteSlot: (slotId: number, force = false) =>
    request<{ ok: boolean }>(`/api/slots/${slotId}${force ? '?force=true' : ''}`, {
      method: 'DELETE',
    }),

  getBookings: () => request<{ bookings: Booking[] }>('/api/bookings'),

  createBooking: (payload: { slot_id: number; notes: string }) =>
    request<{ booking: Booking }>('/api/bookings', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  cancelBooking: (bookingId: number) =>
    request<{ ok: boolean; cancelled_at: string }>(`/api/bookings/${bookingId}/cancel`, {
      method: 'PATCH',
    }),
};
