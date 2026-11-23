import { useMemo, useState } from 'react';
import { Calendar, Clock, MapPin } from 'lucide-react';
import type { TimeSlot, User } from '../types';
import { formatDisplayDate, formatShortDate } from '../utils/date';

interface SlotsViewProps {
  slots: TimeSlot[];
  loading: boolean;
  user: User | null;
  onSelectSlot: (slot: TimeSlot) => void;
  onRequireAuth: () => void;
  onNavigateMyBookings: () => void;
}

export function SlotsView({
  slots,
  loading,
  user,
  onSelectSlot,
  onRequireAuth,
  onNavigateMyBookings,
}: SlotsViewProps) {
  const [selectedDate, setSelectedDate] = useState<string>('all');
  const [onlyAvailable, setOnlyAvailable] = useState<boolean>(false);

  const uniqueDates = useMemo(() => {
    const dates = Array.from(new Set(slots.map((s) => s.slot_date))).sort();
    return dates;
  }, [slots]);

  const filteredSlots = useMemo(() => {
    return slots.filter((slot) => {
      if (selectedDate !== 'all' && slot.slot_date !== selectedDate) return false;
      if (onlyAvailable && slot.is_booked) return false;
      return true;
    });
  }, [slots, selectedDate, onlyAvailable]);

  const groupedByDate = useMemo(() => {
    const map = new Map<string, TimeSlot[]>();
    for (const slot of filteredSlots) {
      const existing = map.get(slot.slot_date) || [];
      existing.push(slot);
      map.set(slot.slot_date, existing);
    }
    return Array.from(map.entries());
  }, [filteredSlots]);

  return (
    <section aria-label="Available time slots">
      <div className="flex flex-col gap-4 border-b border-slate-200 pb-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => setSelectedDate('all')}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
              selectedDate === 'all'
                ? 'bg-slate-900 text-white'
                : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50 hover:text-slate-900'
            }`}
          >
            All Dates
          </button>
          {uniqueDates.slice(0, 6).map((dateStr) => (
            <button
              key={dateStr}
              type="button"
              onClick={() => setSelectedDate(dateStr)}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 tabular-nums ${
                selectedDate === dateStr
                  ? 'bg-slate-900 text-white'
                  : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50 hover:text-slate-900'
              }`}
            >
              {formatShortDate(dateStr)}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-3">
          <label className="flex cursor-pointer items-center gap-2 text-xs font-medium text-slate-700 select-none whitespace-nowrap">
            <input
              type="checkbox"
              checked={onlyAvailable}
              onChange={(e) => setOnlyAvailable(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-900"
            />
            Show available only
          </label>
          <input
            type="date"
            aria-label="Filter by specific date"
            value={selectedDate === 'all' ? '' : selectedDate}
            onChange={(e) => setSelectedDate(e.target.value || 'all')}
            className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 font-mono text-xs text-slate-700 focus:border-blue-600 focus:outline-none"
          />
        </div>
      </div>

      {loading ? (
        <div className="mt-6 space-y-3">
          {[1, 2, 3, 4].map((row) => (
            <div
              key={row}
              className="h-16 animate-pulse rounded-xl border border-slate-200 bg-white"
            />
          ))}
        </div>
      ) : groupedByDate.length === 0 ? (
        <div className="mt-8 rounded-xl border border-slate-200 bg-white px-6 py-12 text-center">
          <Calendar className="mx-auto h-8 w-8 text-slate-400" />
          <h3 className="mt-3 text-base font-semibold text-slate-900">
            No matching time slots
          </h3>
          <p className="mt-1 text-sm text-slate-500">
            {onlyAvailable || selectedDate !== 'all'
              ? 'Try clearing your date or availability filters to see more appointments.'
              : 'No appointment slots have been published yet.'}
          </p>
          {(onlyAvailable || selectedDate !== 'all') && (
            <button
              type="button"
              onClick={() => {
                setSelectedDate('all');
                setOnlyAvailable(false);
              }}
              className="mt-4 rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
            >
              Reset Filters
            </button>
          )}
        </div>
      ) : (
        <div className="mt-6 space-y-8">
          {groupedByDate.map(([dateStr, daySlots]) => {
            const openCount = daySlots.filter((s) => !s.is_booked).length;
            return (
              <div key={dateStr}>
                <div className="mb-3 flex items-baseline justify-between gap-4">
                  <h2 className="text-sm font-semibold text-slate-900">
                    {formatDisplayDate(dateStr)}
                  </h2>
                  <span className="font-mono text-xs text-slate-500 tabular-nums">
                    {openCount} of {daySlots.length} open
                  </span>
                </div>

                <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                  <div className="divide-y divide-slate-100">
                    {daySlots.map((slot) => {
                      const canBook = !slot.is_booked;
                      return (
                        <div
                          key={slot.id}
                          className="flex flex-col gap-4 px-5 py-4 transition-colors hover:bg-slate-50/70 sm:flex-row sm:items-center sm:justify-between"
                        >
                          <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-6">
                            <div className="flex items-center gap-2 font-mono text-sm font-medium text-slate-900 tabular-nums sm:w-36 shrink-0">
                              <Clock className="h-3.5 w-3.5 text-slate-400" />
                              <span>
                                {slot.start_time} – {slot.end_time}
                              </span>
                            </div>

                            <div>
                              <div className="text-sm font-semibold text-slate-900">
                                {slot.title}
                              </div>
                              <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                                <span className="inline-flex items-center gap-1">
                                  <MapPin className="h-3 w-3 text-slate-400" />
                                  {slot.location || 'Main Studio'}
                                </span>
                                <span aria-hidden="true">·</span>
                                <span
                                  className={
                                    slot.booked_by_me
                                      ? 'font-medium text-blue-700'
                                      : slot.is_booked
                                        ? 'text-slate-500'
                                        : 'font-medium text-emerald-700'
                                  }
                                >
                                  {slot.booked_by_me
                                    ? 'Reserved by you'
                                    : slot.is_booked
                                      ? 'Unavailable'
                                      : 'Available'}
                                </span>
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center justify-end gap-3 shrink-0">
                            {slot.booked_by_me ? (
                              <button
                                type="button"
                                onClick={onNavigateMyBookings}
                                className="rounded-lg border border-blue-200 bg-blue-50/60 px-4 py-2 text-xs font-medium text-blue-700 transition-colors hover:bg-blue-100/70 whitespace-nowrap shrink-0"
                              >
                                View Booking
                              </button>
                            ) : canBook ? (
                              <button
                                type="button"
                                onClick={() => (user ? onSelectSlot(slot) : onRequireAuth())}
                                className="rounded-lg bg-slate-900 px-4 py-2 text-xs font-medium text-white transition-colors hover:bg-slate-800 whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900"
                              >
                                {user ? 'Book Slot' : 'Sign in to Book'}
                              </button>
                            ) : (
                              <span className="px-3 py-2 text-xs font-medium text-slate-400 whitespace-nowrap shrink-0">
                                Booked
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
