import { useMemo, useState } from 'react';
import { Search, Users } from 'lucide-react';
import type { Booking } from '../types';
import { formatDisplayDate, formatTimestamp } from '../utils/date';

interface AdminBookingsViewProps {
  bookings: Booking[];
  loading: boolean;
  cancellingId: number | null;
  onCancelBooking: (bookingId: number) => Promise<void>;
}

export function AdminBookingsView({
  bookings,
  loading,
  cancellingId,
  onCancelBooking,
}: AdminBookingsViewProps) {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'confirmed' | 'cancelled'>('all');
  const [confirmingId, setConfirmingId] = useState<number | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return bookings.filter((b) => {
      if (statusFilter !== 'all' && b.status !== statusFilter) return false;
      if (!q) return true;
      return (
        (b.user_name || '').toLowerCase().includes(q) ||
        (b.user_email || '').toLowerCase().includes(q) ||
        b.slot_title.toLowerCase().includes(q) ||
        b.slot_date.includes(q)
      );
    });
  }, [bookings, search, statusFilter]);

  return (
    <section aria-label="All bookings administrator view">
      <div className="flex flex-col gap-3 border-b border-slate-200 pb-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search client name, email, or appointment..."
            className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-xs text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none"
          />
        </div>

        <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-1 self-start sm:self-auto">
          {(['all', 'confirmed', 'cancelled'] as const).map((status) => (
            <button
              key={status}
              type="button"
              onClick={() => setStatusFilter(status)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium capitalize transition-colors whitespace-nowrap ${
                statusFilter === status
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {status}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="mt-6 space-y-3">
          {[1, 2, 3, 4].map((row) => (
            <div key={row} className="h-14 animate-pulse rounded-xl border border-slate-200 bg-white" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="mt-8 rounded-xl border border-slate-200 bg-white px-6 py-12 text-center">
          <Users className="mx-auto h-8 w-8 text-slate-400" />
          <h3 className="mt-3 text-base font-semibold text-slate-900">No bookings match</h3>
          <p className="mt-1 text-sm text-slate-500">
            {search || statusFilter !== 'all'
              ? 'Adjust your search query or status filter to see more records.'
              : 'No user appointments have been booked yet.'}
          </p>
        </div>
      ) : (
        <div className="mt-6 overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/80 text-xs font-medium text-slate-500">
                <th className="px-4 py-3">Ref</th>
                <th className="px-4 py-3">Client</th>
                <th className="px-4 py-3">Appointment</th>
                <th className="px-4 py-3">Slot Date & Time</th>
                <th className="px-4 py-3">Booked At</th>
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
                    <td className="px-4 py-3 font-mono text-xs text-slate-500 tabular-nums whitespace-nowrap">
                      #{String(booking.id).padStart(4, '0')}
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-900">{booking.user_name || 'Client'}</div>
                      <div className="text-xs text-slate-500">{booking.user_email}</div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-900">{booking.slot_title}</div>
                      <div className="text-xs text-slate-500">
                        {booking.location || 'Main Studio'}
                        {booking.notes ? ` · ${booking.notes}` : ''}
                      </div>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="font-mono text-xs text-slate-900 tabular-nums">
                        {formatDisplayDate(booking.slot_date)}
                      </div>
                      <div className="font-mono text-xs text-slate-500 tabular-nums">
                        {booking.start_time} – {booking.end_time}
                      </div>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-500 tabular-nums whitespace-nowrap">
                      {formatTimestamp(booking.created_at)}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span
                        className={`text-xs font-medium ${
                          booking.status === 'confirmed' ? 'text-emerald-700' : 'text-slate-500'
                        }`}
                      >
                        {booking.status === 'confirmed' ? 'Confirmed' : 'Cancelled'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
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
                              className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-60"
                            >
                              {isBusy ? 'Cancelling...' : 'Confirm'}
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
                            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-red-700 hover:border-red-200 hover:bg-red-50"
                          >
                            Cancel
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
