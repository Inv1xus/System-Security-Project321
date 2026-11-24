import { useMemo, useState } from 'react';
import { CalendarX } from 'lucide-react';
import type { Booking } from '../types';
import { formatDisplayDate, formatTimestamp } from '../utils/date';

interface MyBookingsViewProps {
  bookings: Booking[];
  loading: boolean;
  cancellingId: number | null;
  onCancelBooking: (bookingId: number) => Promise<void>;
  onBrowseSlots: () => void;
}

export function MyBookingsView({
  bookings,
  loading,
  cancellingId,
  onCancelBooking,
  onBrowseSlots,
}: MyBookingsViewProps) {
  const [filter, setFilter] = useState<'confirmed' | 'cancelled' | 'all'>('confirmed');
  const [confirmingId, setConfirmingId] = useState<number | null>(null);

  const filtered = useMemo(() => {
    if (filter === 'all') return bookings;
    return bookings.filter((b) => b.status === filter);
  }, [bookings, filter]);

  const confirmedCount = bookings.filter((b) => b.status === 'confirmed').length;
  const cancelledCount = bookings.filter((b) => b.status === 'cancelled').length;

  return (
    <section aria-label="My bookings">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-1">
          <button
            type="button"
            onClick={() => setFilter('confirmed')}
            className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
              filter === 'confirmed'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Confirmed ({confirmedCount})
          </button>
          <button
            type="button"
            onClick={() => setFilter('cancelled')}
            className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
              filter === 'cancelled'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Cancelled ({cancelledCount})
          </button>
          <button
            type="button"
            onClick={() => setFilter('all')}
            className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
              filter === 'all'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            All ({bookings.length})
          </button>
        </div>

        <button
          type="button"
          onClick={onBrowseSlots}
          className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 whitespace-nowrap"
        >
          Browse Available Slots
        </button>
      </div>

      {loading ? (
        <div className="mt-6 space-y-3">
          {[1, 2, 3].map((row) => (
            <div key={row} className="h-16 animate-pulse rounded-xl border border-slate-200 bg-white" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="mt-8 rounded-xl border border-slate-200 bg-white px-6 py-12 text-center">
          <CalendarX className="mx-auto h-8 w-8 text-slate-400" />
          <h3 className="mt-3 text-base font-semibold text-slate-900">
            {filter === 'confirmed'
              ? 'No confirmed appointments'
              : filter === 'cancelled'
                ? 'No cancelled appointments'
                : 'No bookings yet'}
          </h3>
          <p className="mt-1 text-sm text-slate-500">
            Select an available time slot to schedule your next appointment.
          </p>
          <button
            type="button"
            onClick={onBrowseSlots}
            className="mt-4 rounded-lg bg-slate-900 px-4 py-2 text-xs font-medium text-white hover:bg-slate-800"
          >
            View Available Slots
          </button>
        </div>
      ) : (
        <div className="mt-6 overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/80 text-xs font-medium text-slate-500">
                <th className="px-4 py-3">Ref</th>
                <th className="px-4 py-3">Appointment</th>
                <th className="px-4 py-3">Date & Time</th>
                <th className="px-4 py-3">Location</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((booking) => {
                const isConfirming = confirmingId === booking.id;
                const isBusy = cancellingId === booking.id;
                return (
                  <tr key={booking.id} className="hover:bg-slate-50/70">
                    <td className="px-4 py-3.5 font-mono text-xs text-slate-500 tabular-nums whitespace-nowrap">
                      #{String(booking.id).padStart(4, '0')}
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="font-medium text-slate-900">{booking.slot_title}</div>
                      {booking.notes && (
                        <div className="mt-0.5 max-w-xs truncate text-xs text-slate-500" title={booking.notes}>
                          {booking.notes}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3.5 whitespace-nowrap">
                      <div className="font-mono text-xs text-slate-900 tabular-nums">
                        {formatDisplayDate(booking.slot_date)}
                      </div>
                      <div className="mt-0.5 font-mono text-xs text-slate-500 tabular-nums">
                        {booking.start_time} – {booking.end_time}
                      </div>
                    </td>
                    <td className="px-4 py-3.5 text-xs text-slate-600 whitespace-nowrap">
                      {booking.location || 'Main Studio'}
                    </td>
                    <td className="px-4 py-3.5 whitespace-nowrap">
                      {booking.status === 'confirmed' ? (
                        <span className="text-xs font-medium text-emerald-700">Confirmed</span>
                      ) : (
                        <div>
                          <span className="text-xs font-medium text-slate-500">Cancelled</span>
                          {booking.cancelled_at && (
                            <div className="font-mono text-[11px] text-slate-400 tabular-nums">
                              {formatTimestamp(booking.cancelled_at)}
                            </div>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3.5 text-right whitespace-nowrap">
                      {booking.status === 'confirmed' ? (
                        isConfirming ? (
                          <div className="inline-flex items-center gap-2">
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={async () => {
                                await onCancelBooking(booking.id);
                                setConfirmingId(null);
                              }}
                              className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-red-700 disabled:opacity-60"
                            >
                              {isBusy ? 'Cancelling...' : 'Confirm Cancel'}
                            </button>
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => setConfirmingId(null)}
                              className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
                            >
                              Keep
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setConfirmingId(booking.id)}
                            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-red-700 transition-colors hover:border-red-200 hover:bg-red-50"
                          >
                            Cancel Booking
                          </button>
                        )
                      ) : (
                        <span className="text-xs text-slate-400">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
