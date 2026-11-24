import type { AdminBooking, AdminSlot, Booking, TimeSlot, User } from '../types';

export class ApiError extends Error {
  status: number;
  data?: Record<string, unknown>;

  constructor(message: string, status: number, data?: Record<string, unknown>) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.data = data;
  }
}

async function request<T>(url: string, options: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string> | undefined),
  };

  if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }

  const res = await fetch(url, {
    ...options,
    credentials: 'same-origin',
    headers,
  });

  const payload = (await res.json().catch(() => ({}))) as Record<string, unknown>;

  if (!res.ok) {
    const message =
      typeof payload.error === 'string' ? payload.error : `Request failed (${res.status})`;
    throw new ApiError(message, res.status, payload);
  }

  return payload as T;
}

export const api = {
  getMe: () => request<{ user: User | null; needsAdminSetup: boolean }>('/api/auth/me'),

  signup: (body: { name: string; email: string; password: string }) =>
    request<{ user: User }>('/api/auth/signup', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  login: (body: { email: string; password: string }) =>
    request<{ user: User }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  setupAdmin: (body: { name: string; email: string; password: string }) =>
    request<{ user: User }>('/api/auth/setup-admin', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  logout: () =>
    request<{ ok: boolean }>('/api/auth/logout', {
      method: 'POST',
    }),

  getAvailableSlots: (params?: { q?: string; date?: string }) => {
    const search = new URLSearchParams();
    if (params?.q) search.set('q', params.q);
    if (params?.date) search.set('date', params.date);
    const qs = search.toString();
    return request<{ slots: TimeSlot[] }>(`/api/slots${qs ? `?${qs}` : ''}`);
  },

  getMyBookings: () => request<{ bookings: Booking[] }>('/api/bookings/mine'),

  createBooking: (body: { slotId: number; notes?: string }) =>
    request<{ booking: Booking }>('/api/bookings', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  cancelBooking: (bookingId: number) =>
    request<{ booking: Booking }>(`/api/bookings/${bookingId}/cancel`, {
      method: 'POST',
    }),

  adminGetBookings: () => request<{ bookings: AdminBooking[] }>('/api/admin/bookings'),

  adminCancelBooking: (bookingId: number) =>
    request<{ ok: boolean }>(`/api/admin/bookings/${bookingId}/cancel`, {
      method: 'POST',
    }),

  adminGetSlots: () => request<{ slots: AdminSlot[] }>('/api/admin/slots'),

  adminCreateSlot: (body: {
    title: string;
    description?: string;
    startTime: string;
    endTime: string;
  }) =>
    request<{ slot: TimeSlot }>('/api/admin/slots', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  adminDeleteSlot: (slotId: number, force = false) =>
    request<{ ok: boolean }>(`/api/admin/slots/${slotId}${force ? '?force=true' : ''}`, {
      method: 'DELETE',
    }),
};
