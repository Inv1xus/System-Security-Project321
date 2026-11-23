import { useCallback, useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { Calendar, Clock, RefreshCw, Search, X } from 'lucide-react';
import { ApiError, api } from '../api/client';
import type { Booking, TimeSlot, User } from '../types';
import {
  formatDayHeading,
  formatDuration,
  formatTimeRange,
  toLocalDateKey,
} from '../utils/format';

interface AvailableSlotsProps {
  user: User | null;
  pendingSlotToBook: TimeSlot | null;
  onClearPendingSlot: () => void;
  onRequireAuthForSlot: (slot: TimeSlot) => void;
  onBookingCreated: (booking: Booking) => void;
}

export function AvailableSlots({
  user,
  pendingSlotToBook,
  onClearPendingSlot,
  onRequireAuthForSlot,
  onBookingCreated,
}: AvailableSlotsProps) {
  const [slots, setSlots] = useState<TimeSlot[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [selectedDate, setSelectedDate] = useState('');

  const [confirmSlot, setConfirmSlot] = useState<TimeSlot | null>(null);
  const [notes, setNotes] = useState('');
  const [bookingError, setBookingError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const loadSlots = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.getAvailableSlots();
      setSlots(data.slots);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load available time slots.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSlots();
  }, [loadSlots]);

  useEffect(() => {
    if (user && pendingSlotToBook) {
      setConfirmSlot(pendingSlotToBook);
      setNotes('');
      setBookingError(null);
      onClearPendingSlot();
    }
  }, [user, pendingSlotToBook, onClearPendingSlot]);

  useEffect(() => {
    if (!confirmSlot) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setConfirmSlot(null);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [confirmSlot]);

  const filteredSlots = useMemo(() => {
    const q = search.trim().toLowerCase();
    return slots.filter((slot) => {
      if (selectedDate && toLocalDateKey(slot.startTime) !== selectedDate) {
        return false;
      }
      if (
        q &&
        !slot.title.toLowerCase().includes(q) &&
        !slot.description.toLowerCase().includes(q)
      ) {
        return false;
      }
      return true;
    });
  }, [slots, search, selectedDate]);

  const groupedDays = useMemo(() => {
    const groups = new Map<string, { label: string; items: TimeSlot[] }>();
    for (const slot of filteredSlots) {
      const key = toLocalDateKey(slot.startTime);
      const existing = groups.get(key);
      if (existing) {
        existing.items.push(slot);
      } else {
        groups.set(key, {
          label: formatDayHeading(slot.startTime),
          items: [slot],
        });
      }
    }
    return Array.from(groups.entries());
  }, [filteredSlots]);

  const handleBookClick = (slot: TimeSlot) => {
    if (!user) {
      onRequireAuthForSlot(slot);
      return;
    }
    setConfirmSlot(slot);
    setNotes('');
    setBookingError(null);
  };

  const handleConfirmBooking = async (e: FormEvent) => {
    e.preventDefault();
    if (!confirmSlot) return;

    setSubmitting(true);
    setBookingError(null);

    try {
      const res = await api.createBooking({
        slotId: confirmSlot.id,
        notes: notes.trim(),
      });
      setSlots((prev) => prev.filter((s) => s.id !== confirmSlot.id));
      setConfirmSlot(null);
      setNotes('');
      onBookingCreated(res.booking);
    } catch (err) {
      if (err instanceof ApiError) {
        setBookingError(err.message);
        if (err.status === 409) {
          loadSlots();
        }
      } else {
        setBookingError('Failed to confirm booking. Please try again.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section aria-labelledby="slots-heading" className="space-y-6">
      <div className="flex flex-col gap-4 border-b border-slate-200 pb-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1
            id="slots-heading"
            className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl"
          >
            Available Appointments
          </h1>
          <p className="mt-1.5 text-sm text-slate-600">
            Select an open time slot below to reserve your session. All times are shown in your
            local timezone.
          </p>
        </div>

        <button
          type="button"
          onClick={loadSlots}
          disabled={loading}
          className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-60 whitespace-nowrap shrink-0"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* Filter toolbar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter by session title or topic..."
            aria-label="Filter appointments"
            className="w-full rounded-lg border border-slate-300 bg-white py-2.5 pl-10 pr-4 text-sm text-slate-900 placeholder:text-slate-400 focus:border-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-900"
          />
        </div>

        <div className="flex items-center gap-2">
          <div className="relative">
            <Calendar className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              aria-label="Filter by date"
              className="rounded-lg border border-slate-300 bg-white py-2.5 pl-9 pr-3 text-sm text-slate-900 tabular-nums focus:border-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-900"
            />
          </div>
          {(selectedDate || search) && (
            <button
              type="button"
              onClick={() => {
                setSelectedDate('');
                setSearch('');
              }}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50 hover:text-slate-900 whitespace-nowrap shrink-0"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Content states */}
      {loading ? (
        <div className="space-y-3" aria-busy="true" aria-label="Loading available time slots">
          {[1, 2, 3, 4].map((row) => (
            <div
              key={row}
              className="h-20 animate-pulse rounded-xl border border-slate-200 bg-white"
            />
          ))}
        </div>
      ) : error ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-6 text-center">
          <p className="text-sm font-medium text-rose-900">{error}</p>
          <button
            type="button"
            onClick={loadSlots}
            className="mt-3 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
          >
            Try Again
          </button>
        </div>
      ) : groupedDays.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white px-6 py-12 text-center">
          <Clock className="mx-auto h-8 w-8 text-slate-400" />
          <h2 className="mt-3 text-base font-semibold text-slate-900">
            No open time slots match your view
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            {search || selectedDate
              ? 'Try clearing your date or keyword filters to see all upcoming openings.'
              : 'All upcoming sessions are currently booked. Check back soon as new slots open.'}
          </p>
          {(search || selectedDate) && (
            <button
              type="button"
              onClick={() => {
                setSelectedDate('');
                setSearch('');
              }}
              className="mt-4 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50"
            >
              Reset Filters
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-8">
          {groupedDays.map(([dayKey, group]) => (
            <div key={dayKey} className="space-y-3">
              <div className="flex items-baseline justify-between border-b border-slate-200 pb-2">
                <h2 className="text-base font-semibold text-slate-900">{group.label}</h2>
                <span className="text-xs font-medium text-slate-500 tabular-nums">
                  {group.items.length} {group.items.length === 1 ? 'opening' : 'openings'}
                </span>
              </div>

              <div className="divide-y divide-slate-200 overflow-hidden rounded-xl border border-slate-200 bg-white">
                {group.items.map((slot) => (
                  <div
                    key={slot.id}
                    className="flex flex-col gap-4 px-5 py-4 transition-colors hover:bg-slate-50/70 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-6">
                      <div className="w-36 shrink-0">
                        <div className="font-mono text-sm font-medium text-slate-900 tabular-nums">
                          {formatTimeRange(slot.startTime, slot.endTime)}
                        </div>
                        <div className="mt-0.5 text-xs text-slate-500 tabular-nums">
                          {formatDuration(slot.startTime, slot.endTime)}
                        </div>
                      </div>

                      <div className="min-w-0">
                        <h3 className="text-sm font-semibold text-slate-900">{slot.title}</h3>
                        {slot.description && (
                          <p className="mt-0.5 text-sm text-slate-600">{slot.description}</p>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center justify-end shrink-0">
                      <button
                        type="button"
                        onClick={() => handleBookClick(slot)}
                        className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-slate-800 whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900"
                      >
                        Book Slot
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Booking Confirmation Modal */}
      {confirmSlot && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-[2px]"
          role="dialog"
          aria-modal="true"
          aria-labelledby="book-modal-title"
          onClick={(e) => {
            if (e.target === e.currentTarget && !submitting) setConfirmSlot(null);
          }}
        >
          <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-lg">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 id="book-modal-title" className="text-lg font-semibold text-slate-900">
                  Confirm appointment
                </h2>
                <p className="mt-1 text-sm text-slate-600">
                  Review your selected slot details below.
                </p>
              </div>
              <button
                type="button"
                disabled={submitting}
                onClick={() => setConfirmSlot(null)}
                aria-label="Close booking dialog"
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-5 border-y border-slate-200 py-4 space-y-2 text-sm">
              <div className="font-semibold text-slate-900">{confirmSlot.title}</div>
              <div className="flex flex-wrap items-center gap-2 text-slate-600 tabular-nums">
                <span>{formatDayHeading(confirmSlot.startTime)}</span>
                <span aria-hidden="true">·</span>
                <span className="font-mono text-slate-900">
                  {formatTimeRange(confirmSlot.startTime, confirmSlot.endTime)}
                </span>
                <span aria-hidden="true">·</span>
                <span>{formatDuration(confirmSlot.startTime, confirmSlot.endTime)}</span>
              </div>
              {confirmSlot.description && (
                <p className="text-slate-600">{confirmSlot.description}</p>
              )}
            </div>

            <form onSubmit={handleConfirmBooking} className="mt-5 space-y-4">
              <div>
                <label htmlFor="booking-notes" className="block text-sm font-medium text-slate-800">
                  Session notes <span className="font-normal text-slate-500">(optional)</span>
                </label>
                <textarea
                  id="booking-notes"
                  rows={3}
                  maxLength={500}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Share topics, questions, or preparation context..."
                  className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-900"
                />
              </div>

              {bookingError && (
                <div
                  role="alert"
                  className="rounded-lg border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-sm text-rose-800"
                >
                  {bookingError}
                </div>
              )}

              <div className="flex items-center justify-end gap-3 pt-1">
                <button
                  type="button"
                  disabled={submitting}
                  onClick={() => setConfirmSlot(null)}
                  className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60"
                >
                  {submitting ? 'Booking...' : 'Confirm Booking'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  );
}
