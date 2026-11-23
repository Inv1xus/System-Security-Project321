import { useCallback, useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { CheckCircle2, Plus, RefreshCw, Search, Trash2, XCircle } from 'lucide-react';
import { ApiError, api } from '../api/client';
import type { AdminBooking, AdminSlot } from '../types';
import {
  formatBookingRef,
  formatDuration,
  formatShortDate,
  formatTimeRange,
  getTomorrowDateInput,
} from '../utils/format';

type AdminTab = 'bookings' | 'slots';
type BookingStatusFilter = 'all' | 'confirmed' | 'cancelled';

function addMinutesToTime(timeStr: string, minutes: number): string {
  const [h, m] = timeStr.split(':').map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return '10:00';
  const total = h * 60 + m + minutes;
  const clamped = Math.min(total, 23 * 60 + 59);
  const nextH = String(Math.floor(clamped / 60)).padStart(2, '0');
  const nextM = String(clamped % 60).padStart(2, '0');
  return `${nextH}:${nextM}`;
}

export function AdminPanel() {
  const [tab, setTab] = useState<AdminTab>('bookings');
  const [bookings, setBookings] = useState<AdminBooking[]>([]);
  const [slots, setSlots] = useState<AdminSlot[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Bookings filters & inline cancel
  const [bookingSearch, setBookingSearch] = useState('');
  const [bookingFilter, setBookingFilter] = useState<BookingStatusFilter>('all');
  const [confirmCancelBookingId, setConfirmCancelBookingId] = useState<number | null>(null);
  const [busyBookingId, setBusyBookingId] = useState<number | null>(null);

  // Add slot form
  const [slotTitle, setSlotTitle] = useState('');
  const [slotDate, setSlotDate] = useState(getTomorrowDateInput);
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('09:45');
  const [slotDescription, setSlotDescription] = useState('');
  const [creatingSlot, setCreatingSlot] = useState(false);
  const [slotFormError, setSlotFormError] = useState<string | null>(null);
  const [slotFormSuccess, setSlotFormSuccess] = useState<string | null>(null);

  // Slot deletion
  const [forceRemoveSlotId, setForceRemoveSlotId] = useState<number | null>(null);
  const [busySlotId, setBusySlotId] = useState<number | null>(null);
  const [slotActionError, setSlotActionError] = useState<string | null>(null);

  const loadAdminData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [bookingsRes, slotsRes] = await Promise.all([
        api.adminGetBookings(),
        api.adminGetSlots(),
      ]);
      setBookings(bookingsRes.bookings);
      setSlots(slotsRes.slots);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load admin workspace.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAdminData();
  }, [loadAdminData]);

  const metrics = useMemo(() => {
    const now = Date.now();
    const openUpcoming = slots.filter(
      (s) => !s.activeBookingId && Date.parse(s.startTime) > now
    ).length;
    const bookedUpcoming = slots.filter(
      (s) => Boolean(s.activeBookingId) && Date.parse(s.startTime) > now
    ).length;
    const confirmedTotal = bookings.filter((b) => b.status === 'confirmed').length;
    const cancelledTotal = bookings.filter((b) => b.status === 'cancelled').length;
    return { openUpcoming, bookedUpcoming, confirmedTotal, cancelledTotal };
  }, [slots, bookings]);

  const filteredBookings = useMemo(() => {
    const q = bookingSearch.trim().toLowerCase();
    return bookings.filter((b) => {
      if (bookingFilter !== 'all' && b.status !== bookingFilter) {
        return false;
      }
      if (
        q &&
        !b.userName.toLowerCase().includes(q) &&
        !b.userEmail.toLowerCase().includes(q) &&
        !b.slotTitle.toLowerCase().includes(q) &&
        !formatBookingRef(b.id).toLowerCase().includes(q)
      ) {
        return false;
      }
      return true;
    });
  }, [bookings, bookingSearch, bookingFilter]);

  const handleCreateSlot = async (e: FormEvent) => {
    e.preventDefault();
    setSlotFormError(null);
    setSlotFormSuccess(null);

    const startLocal = new Date(`${slotDate}T${startTime}:00`);
    const endLocal = new Date(`${slotDate}T${endTime}:00`);

    if (Number.isNaN(startLocal.getTime()) || Number.isNaN(endLocal.getTime())) {
      setSlotFormError('Please provide a valid date, start time, and end time.');
      return;
    }

    setCreatingSlot(true);
    try {
      await api.adminCreateSlot({
        title: slotTitle.trim(),
        description: slotDescription.trim(),
        startTime: startLocal.toISOString(),
        endTime: endLocal.toISOString(),
      });
      setSlotTitle('');
      setSlotDescription('');
      setSlotFormSuccess('Time slot added to the schedule.');
      await loadAdminData();
    } catch (err) {
      setSlotFormError(err instanceof ApiError ? err.message : 'Unable to create time slot.');
    } finally {
      setCreatingSlot(false);
    }
  };

  const handleRemoveSlot = async (slotId: number, force = false) => {
    setBusySlotId(slotId);
    setSlotActionError(null);
    try {
      await api.adminDeleteSlot(slotId, force);
      setForceRemoveSlotId(null);
      await loadAdminData();
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setForceRemoveSlotId(slotId);
      } else {
        setSlotActionError(err instanceof ApiError ? err.message : 'Unable to remove slot.');
      }
    } finally {
      setBusySlotId(null);
    }
  };

  const handleAdminCancelBooking = async (bookingId: number) => {
    setBusyBookingId(bookingId);
    setError(null);
    try {
      await api.adminCancelBooking(bookingId);
      setConfirmCancelBookingId(null);
      await loadAdminData();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Unable to cancel booking.');
    } finally {
      setBusyBookingId(null);
    }
  };

  return (
    <section aria-labelledby="admin-heading" className="space-y-6">
      <div className="flex flex-col gap-4 border-b border-slate-200 pb-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1
            id="admin-heading"
            className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl"
          >
            Administration
          </h1>
          <p className="mt-1.5 text-sm text-slate-600">
            Oversee all user bookings and configure available appointment time slots.
          </p>
        </div>

        <button
          type="button"
          onClick={loadAdminData}
          disabled={loading}
          className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60 whitespace-nowrap shrink-0"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh Data
        </button>
      </div>

      {/* 4-column summary strip */}
      <div className="grid grid-cols-2 divide-y divide-slate-200 overflow-hidden rounded-xl border border-slate-200 bg-white sm:grid-cols-4 sm:divide-x sm:divide-y-0">
        <div className="p-4">
          <div className="text-xs font-medium text-slate-500">Open Upcoming Slots</div>
          <div className="mt-1 font-mono text-2xl font-semibold text-slate-900 tabular-nums">
            {metrics.openUpcoming}
          </div>
        </div>
        <div className="p-4">
          <div className="text-xs font-medium text-slate-500">Booked Upcoming</div>
          <div className="mt-1 font-mono text-2xl font-semibold text-slate-900 tabular-nums">
            {metrics.bookedUpcoming}
          </div>
        </div>
        <div className="p-4">
          <div className="text-xs font-medium text-slate-500">Confirmed Bookings</div>
          <div className="mt-1 font-mono text-2xl font-semibold text-emerald-700 tabular-nums">
            {metrics.confirmedTotal}
          </div>
        </div>
        <div className="p-4">
          <div className="text-xs font-medium text-slate-500">Cancelled Bookings</div>
          <div className="mt-1 font-mono text-2xl font-semibold text-slate-600 tabular-nums">
            {metrics.cancelledTotal}
          </div>
        </div>
      </div>

      {/* Section switch */}
      <div className="flex items-center gap-1 self-start rounded-lg bg-slate-100 p-1 sm:inline-flex">
        <button
          type="button"
          onClick={() => setTab('bookings')}
          className={`flex-1 rounded-md px-4 py-2 text-sm font-medium transition-colors whitespace-nowrap sm:flex-none ${
            tab === 'bookings'
              ? 'bg-white text-slate-900 shadow-xs'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          All Bookings ({bookings.length})
        </button>
        <button
          type="button"
          onClick={() => setTab('slots')}
          className={`flex-1 rounded-md px-4 py-2 text-sm font-medium transition-colors whitespace-nowrap sm:flex-none ${
            tab === 'slots'
              ? 'bg-white text-slate-900 shadow-xs'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          Manage Time Slots ({slots.length})
        </button>
      </div>

      {error && (
        <div
          role="alert"
          className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800"
        >
          {error}
        </div>
      )}

      {tab === 'bookings' ? (
        <div className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative flex-1 max-w-md">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="search"
                value={bookingSearch}
                onChange={(e) => setBookingSearch(e.target.value)}
                placeholder="Search client name, email, reference, or session..."
                className="w-full rounded-lg border border-slate-300 bg-white py-2.5 pl-10 pr-4 text-sm text-slate-900 placeholder:text-slate-400 focus:border-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-900"
              />
            </div>

            <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-1">
              {(['all', 'confirmed', 'cancelled'] as const).map((status) => (
                <button
                  key={status}
                  type="button"
                  onClick={() => setBookingFilter(status)}
                  className={`rounded-md px-3 py-1.5 text-sm font-medium capitalize transition-colors whitespace-nowrap ${
                    bookingFilter === status
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {status}
                </button>
              ))}
            </div>
          </div>

          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
            <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
              <thead className="bg-slate-50 text-xs font-semibold text-slate-600">
                <tr>
                  <th className="px-4 py-3">Ref</th>
                  <th className="px-4 py-3">Client</th>
                  <th className="px-4 py-3">Session</th>
                  <th className="px-4 py-3">Date &amp; Time</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {loading ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                      Loading bookings...
                    </td>
                  </tr>
                ) : filteredBookings.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                      No bookings found matching the current filters.
                    </td>
                  </tr>
                ) : (
                  filteredBookings.map((b) => (
                    <tr key={b.id} className="hover:bg-slate-50/70">
                      <td className="px-4 py-3 font-mono text-xs font-medium text-slate-700 tabular-nums whitespace-nowrap">
                        {formatBookingRef(b.id)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-medium text-slate-900">{b.userName}</div>
                        <div className="text-xs text-slate-500">{b.userEmail}</div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-medium text-slate-900">{b.slotTitle}</div>
                        {b.notes && (
                          <div className="mt-0.5 max-w-xs truncate text-xs text-slate-500" title={b.notes}>
                            {b.notes}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="text-slate-900 tabular-nums">
                          {formatShortDate(b.startTime)}
                        </div>
                        <div className="font-mono text-xs text-slate-500 tabular-nums">
                          {formatTimeRange(b.startTime, b.endTime)}
                        </div>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {b.status === 'confirmed' ? (
                          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700">
                            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                            Confirmed
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500">
                            <XCircle className="h-3.5 w-3.5 text-slate-400" />
                            Cancelled
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        {b.status === 'confirmed' ? (
                          confirmCancelBookingId === b.id ? (
                            <div className="inline-flex items-center gap-2">
                              <button
                                type="button"
                                disabled={busyBookingId === b.id}
                                onClick={() => handleAdminCancelBooking(b.id)}
                                className="rounded-md bg-rose-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-rose-700 disabled:opacity-60"
                              >
                                {busyBookingId === b.id ? 'Cancelling...' : 'Confirm'}
                              </button>
                              <button
                                type="button"
                                onClick={() => setConfirmCancelBookingId(null)}
                                className="rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                              >
                                Keep
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setConfirmCancelBookingId(b.id)}
                              className="rounded-md border border-slate-300 bg-white px-3 py-1 text-xs font-medium text-slate-700 hover:border-rose-300 hover:bg-rose-50 hover:text-rose-700"
                            >
                              Cancel
                            </button>
                          )
                        ) : (
                          <span className="text-xs text-slate-400">—</span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 lg:items-start">
          {/* Add Time Slot form */}
          <div className="rounded-xl border border-slate-200 bg-white p-5 lg:col-span-4">
            <h2 className="text-base font-semibold text-slate-900">Add Time Slot</h2>
            <p className="mt-1 text-xs text-slate-600">
              Publish a new appointment opening for users to reserve.
            </p>

            <form onSubmit={handleCreateSlot} className="mt-4 space-y-4">
              <div>
                <label htmlFor="slot-title" className="block text-sm font-medium text-slate-800">
                  Session title
                </label>
                <input
                  id="slot-title"
                  type="text"
                  required
                  minLength={2}
                  maxLength={120}
                  value={slotTitle}
                  onChange={(e) => setSlotTitle(e.target.value)}
                  placeholder="e.g. Product Consultation"
                  className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-900"
                />
              </div>

              <div>
                <label htmlFor="slot-date" className="block text-sm font-medium text-slate-800">
                  Date
                </label>
                <input
                  id="slot-date"
                  type="date"
                  required
                  value={slotDate}
                  onChange={(e) => setSlotDate(e.target.value)}
                  className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 tabular-nums focus:border-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-900"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="slot-start" className="block text-sm font-medium text-slate-800">
                    Start time
                  </label>
                  <input
                    id="slot-start"
                    type="time"
                    required
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                    className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 font-mono tabular-nums focus:border-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-900"
                  />
                </div>
                <div>
                  <label htmlFor="slot-end" className="block text-sm font-medium text-slate-800">
                    End time
                  </label>
                  <input
                    id="slot-end"
                    type="time"
                    required
                    value={endTime}
                    onChange={(e) => setEndTime(e.target.value)}
                    className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 font-mono tabular-nums focus:border-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-900"
                  />
                </div>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-500">Quick duration:</span>
                {[30, 45, 60].map((mins) => (
                  <button
                    key={mins}
                    type="button"
                    onClick={() => setEndTime(addMinutesToTime(startTime, mins))}
                    className="rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100 tabular-nums"
                  >
                    {mins}m
                  </button>
                ))}
              </div>

              <div>
                <label htmlFor="slot-desc" className="block text-sm font-medium text-slate-800">
                  Description <span className="font-normal text-slate-500">(optional)</span>
                </label>
                <textarea
                  id="slot-desc"
                  rows={2}
                  maxLength={400}
                  value={slotDescription}
                  onChange={(e) => setSlotDescription(e.target.value)}
                  placeholder="Brief summary of the appointment..."
                  className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-900"
                />
              </div>

              {slotFormError && (
                <div
                  role="alert"
                  className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800"
                >
                  {slotFormError}
                </div>
              )}

              {slotFormSuccess && (
                <div
                  role="status"
                  className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800"
                >
                  {slotFormSuccess}
                </div>
              )}

              <button
                type="submit"
                disabled={creatingSlot}
                className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60"
              >
                <Plus className="h-4 w-4" />
                {creatingSlot ? 'Adding Slot...' : 'Add Time Slot'}
              </button>
            </form>
          </div>

          {/* Existing Slots Table */}
          <div className="space-y-3 lg:col-span-8">
            {slotActionError && (
              <div
                role="alert"
                className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800"
              >
                {slotActionError}
              </div>
            )}

            <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
              <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
                <thead className="bg-slate-50 text-xs font-semibold text-slate-600">
                  <tr>
                    <th className="px-4 py-3">Date &amp; Time</th>
                    <th className="px-4 py-3">Session</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {loading ? (
                    <tr>
                      <td colSpan={4} className="px-4 py-8 text-center text-slate-500">
                        Loading time slots...
                      </td>
                    </tr>
                  ) : slots.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-4 py-8 text-center text-slate-500">
                        No time slots created yet. Add one using the form.
                      </td>
                    </tr>
                  ) : (
                    slots.map((slot) => {
                      const isPast = Date.parse(slot.startTime) <= Date.now();
                      const isConfirmingForce = forceRemoveSlotId === slot.id;
                      const isBusy = busySlotId === slot.id;

                      return (
                        <tr key={slot.id} className="hover:bg-slate-50/70">
                          <td className="px-4 py-3 whitespace-nowrap">
                            <div className="font-medium text-slate-900 tabular-nums">
                              {formatShortDate(slot.startTime)}
                            </div>
                            <div className="font-mono text-xs text-slate-500 tabular-nums">
                              {formatTimeRange(slot.startTime, slot.endTime)} ·{' '}
                              {formatDuration(slot.startTime, slot.endTime)}
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <div className="font-medium text-slate-900">{slot.title}</div>
                            {slot.description && (
                              <div className="mt-0.5 max-w-xs truncate text-xs text-slate-500">
                                {slot.description}
                              </div>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            {slot.activeBookingId ? (
                              <div>
                                <div className="text-xs font-medium text-slate-900">
                                  Booked by {slot.bookedByName}
                                </div>
                                <div className="text-xs text-slate-500">{slot.bookedByEmail}</div>
                              </div>
                            ) : isPast ? (
                              <span className="text-xs text-slate-400">Expired (Unbooked)</span>
                            ) : (
                              <span className="text-xs font-medium text-emerald-700">Available</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-right whitespace-nowrap">
                            {isConfirmingForce ? (
                              <div className="inline-flex items-center gap-2">
                                <button
                                  type="button"
                                  disabled={isBusy}
                                  onClick={() => handleRemoveSlot(slot.id, true)}
                                  className="rounded-md bg-rose-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-rose-700 disabled:opacity-60"
                                >
                                  {isBusy ? 'Removing...' : 'Force Remove'}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setForceRemoveSlotId(null)}
                                  className="rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                                >
                                  Keep
                                </button>
                              </div>
                            ) : (
                              <button
                                type="button"
                                disabled={isBusy}
                                onClick={() => handleRemoveSlot(slot.id, false)}
                                className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-1 text-xs font-medium text-slate-700 hover:border-rose-300 hover:bg-rose-50 hover:text-rose-700 disabled:opacity-60"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                                Remove
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
