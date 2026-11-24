import { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarDays, CheckCircle2, RefreshCw, XCircle } from 'lucide-react';
import { ApiError, api } from '../api/client';
import type { Booking, User } from '../types';
import {
  formatBookingRef,
  formatDuration,
  formatShortDate,
  formatTimeRange,
} from '../utils/format';

interface MyBookingsProps {
  user: User | null;
  onOpenAuth: () => void;
  onBrowseSlots: () => void;
}

type BookingFilter = 'upcoming' | 'all' | 'cancelled';

export function MyBookings({ user, onOpenAuth, onBrowseSlots }: MyBookingsProps) {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<BookingFilter>('upcoming');
  const [confirmCancelId, setConfirmCancelId] = useState<number | null>(null);
  const [cancellingId, setCancellingId] = useState<number | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const loadBookings = useCallback(async () => {
    if (!user) {
      setBookings([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const data = await api.getMyBookings();
      setBookings(data.bookings);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load your bookings.');
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    loadBookings();
  }, [loadBookings]);

  const filteredBookings = useMemo(() => {
    const now = Date.now();
    return bookings.filter((b) => {
      if (filter === 'upcoming') {
        return b.status === 'confirmed' && Date.parse(b.endTime) > now;
      }
      if (filter === 'cancelled') {
        return b.status === 'cancelled';
      }
      return true;
    });
  }, [bookings, filter]);

  const handleCancel = async (bookingId: number) => {
    setCancellingId(bookingId);
    setActionError(null);
    try {
      const res = await api.cancelBooking(bookingId);
      setBookings((prev) => prev.map((b) => (b.id === bookingId ? res.booking : b)));
      setConfirmCancelId(null);
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'Unable to cancel booking.');
    } finally {
      setCancellingId(null);
    }
  };

  if (!user) {
    return (
      <section className="rounded-xl border border-slate-200 bg-white px-6 py-14 text-center">
        <CalendarDays className="mx-auto h-9 w-9 text-slate-400" />
        <h1 className="mt-4 text-xl font-semibold text-slate-900">Sign in to view your bookings</h1>
        <p className="mx-auto mt-1.5 max-w-md text-sm text-slate-600">
          Review upcoming appointments, read session notes, or cancel a reservation anytime before
          it begins.
        </p>
        <button
          type="button"
          onClick={onOpenAuth}
          className="mt-5 rounded-lg bg-slate-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-slate-800"
        >
          Sign In
        </button>
      </section>
    );
  }

  return (
    <section aria-labelledby="my-bookings-heading" className="space-y-6">
      <div className="flex flex-col gap-4 border-b border-slate-200 pb-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1
            id="my-bookings-heading"
            className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl"
          >
            My Bookings
          </h1>
          <p className="mt-1.5 text-sm text-slate-600">
            Manage your upcoming appointments and view booking history.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-1">
            {(['upcoming', 'all', 'cancelled'] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setFilter(tab)}
                className={`rounded-md px-3 py-1.5 text-sm font-medium capitalize transition-colors whitespace-nowrap ${
                  filter === tab
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {tab}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={loadBookings}
            disabled={loading}
            aria-label="Refresh bookings"
            className="rounded-lg border border-slate-300 bg-white p-2.5 text-slate-700 hover:bg-slate-50 disabled:opacity-60"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {actionError && (
        <div
          role="alert"
          className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800"
        >
          {actionError}
        </div>
      )}

      {loading ? (
        <div className="space-y-3" aria-busy="true">
          {[1, 2, 3].map((n) => (
            <div
              key={n}
              className="h-24 animate-pulse rounded-xl border border-slate-200 bg-white"
            />
          ))}
        </div>
      ) : error ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-6 text-center">
          <p className="text-sm font-medium text-rose-900">{error}</p>
          <button
            type="button"
            onClick={loadBookings}
            className="mt-3 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
          >
            Retry
          </button>
        </div>
      ) : filteredBookings.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white px-6 py-12 text-center">
          <CalendarDays className="mx-auto h-8 w-8 text-slate-400" />
          <h2 className="mt-3 text-base font-semibold text-slate-900">
            {filter === 'upcoming'
              ? 'No upcoming appointments'
              : filter === 'cancelled'
                ? 'No cancelled bookings'
                : 'No bookings yet'}
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            {filter === 'upcoming'
              ? 'Reserve an open time slot to schedule your next appointment.'
              : 'Your booking history will appear here.'}
          </p>
          <button
            type="button"
            onClick={onBrowseSlots}
            className="mt-4 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
          >
            Browse Available Slots
          </button>
        </div>
      ) : (
        <div className="divide-y divide-slate-200 overflow-hidden rounded-xl border border-slate-200 bg-white">
          {filteredBookings.map((booking) => {
            const isUpcoming = Date.parse(booking.startTime) > Date.now();
            const canCancel = booking.status === 'confirmed' && isUpcoming;
            const isConfirming = confirmCancelId === booking.id;
            const isBusy = cancellingId === booking.id;

            return (
              <div
                key={booking.id}
                className="flex flex-col gap-4 px-5 py-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                    <span className="font-mono font-medium text-slate-700 tabular-nums">
                      {formatBookingRef(booking.id)}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span className="tabular-nums">{formatShortDate(booking.startTime)}</span>
                    <span aria-hidden="true">·</span>
                    <span className="font-mono text-slate-800 tabular-nums">
                      {formatTimeRange(booking.startTime, booking.endTime)}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span className="tabular-nums">
                      {formatDuration(booking.startTime, booking.endTime)}
                    </span>
                  </div>

                  <h3 className="text-base font-semibold text-slate-900">{booking.slotTitle}</h3>

                  {booking.notes && (
                    <p className="text-sm text-slate-600">
                      <span className="font-medium text-slate-700">Notes:</span> {booking.notes}
                    </p>
                  )}

                  <div className="flex items-center gap-1.5 text-xs font-medium">
                    {booking.status === 'confirmed' ? (
                      <>
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                        <span className="text-emerald-700">
                          {isUpcoming ? 'Confirmed' : 'Completed'}
                        </span>
                      </>
                    ) : (
                      <>
                        <XCircle className="h-3.5 w-3.5 text-slate-400" />
                        <span className="text-slate-500">Cancelled</span>
                      </>
                    )}
                  </div>
                </div>

                {canCancel && (
                  <div className="flex items-center justify-end gap-2 shrink-0">
                    {isConfirming ? (
                      <>
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => handleCancel(booking.id)}
                          className="rounded-lg bg-rose-600 px-3.5 py-2 text-sm font-medium text-white hover:bg-rose-700 disabled:opacity-60 whitespace-nowrap"
                        >
                          {isBusy ? 'Cancelling...' : 'Confirm Cancel'}
                        </button>
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => setConfirmCancelId(null)}
                          className="rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap"
                        >
                          Keep
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          setConfirmCancelId(booking.id);
                          setActionError(null);
                        }}
                        className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:border-rose-300 hover:bg-rose-50 hover:text-rose-700 whitespace-nowrap"
                      >
                        Cancel Booking
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
