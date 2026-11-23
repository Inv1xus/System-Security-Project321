import React, { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import type { TimeSlot } from '../types';
import { formatDisplayDate, getTodayIsoDate } from '../utils/date';

interface AdminSlotsViewProps {
  slots: TimeSlot[];
  loading: boolean;
  onCreateSlot: (payload: {
    title: string;
    slot_date: string;
    start_time: string;
    end_time: string;
    location: string;
  }) => Promise<void>;
  onDeleteSlot: (slotId: number, force?: boolean) => Promise<void>;
}

export function AdminSlotsView({
  slots,
  loading,
  onCreateSlot,
  onDeleteSlot,
}: AdminSlotsViewProps) {
  const [title, setTitle] = useState('');
  const [slotDate, setSlotDate] = useState(getTodayIsoDate());
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('09:45');
  const [location, setLocation] = useState('Main Studio');
  const [formError, setFormError] = useState('');
  const [creating, setCreating] = useState(false);

  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    if (endTime <= startTime) {
      setFormError('End time must be later than start time.');
      return;
    }

    setCreating(true);
    try {
      await onCreateSlot({
        title: title.trim(),
        slot_date: slotDate,
        start_time: startTime,
        end_time: endTime,
        location: location.trim() || 'Main Studio',
      });
      setTitle('');
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Unable to add time slot.');
    } finally {
      setCreating(false);
    }
  };

  const handleRemove = async (slot: TimeSlot) => {
    setDeletingId(slot.id);
    try {
      await onDeleteSlot(slot.id, slot.is_booked);
      setConfirmDeleteId(null);
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <section aria-label="Manage time slots" className="grid grid-cols-1 gap-8 lg:grid-cols-12">
      <div className="lg:col-span-4">
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="text-base font-semibold text-slate-900">Add Time Slot</h2>
          <p className="mt-1 text-xs text-slate-500">
            Publish a new appointment window for clients to reserve.
          </p>

          <form onSubmit={handleSubmit} className="mt-4 space-y-4">
            <div>
              <label htmlFor="slot-title" className="block text-xs font-medium text-slate-700">
                Appointment Title
              </label>
              <input
                id="slot-title"
                type="text"
                required
                minLength={2}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g., Strategy Consultation"
                className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/15"
              />
            </div>

            <div>
              <label htmlFor="slot-date" className="block text-xs font-medium text-slate-700">
                Date
              </label>
              <input
                id="slot-date"
                type="date"
                required
                value={slotDate}
                onChange={(e) => setSlotDate(e.target.value)}
                className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-sm text-slate-900 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/15"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="slot-start" className="block text-xs font-medium text-slate-700">
                  Start Time
                </label>
                <input
                  id="slot-start"
                  type="time"
                  required
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-sm text-slate-900 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/15"
                />
              </div>
              <div>
                <label htmlFor="slot-end" className="block text-xs font-medium text-slate-700">
                  End Time
                </label>
                <input
                  id="slot-end"
                  type="time"
                  required
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                  className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-sm text-slate-900 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/15"
                />
              </div>
            </div>

            <div>
              <label htmlFor="slot-location" className="block text-xs font-medium text-slate-700">
                Location / Format
              </label>
              <input
                id="slot-location"
                type="text"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="Room 204 or Video Call"
                className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/15"
              />
            </div>

            {formError && (
              <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                {formError}
              </div>
            )}

            <button
              type="submit"
              disabled={creating}
              className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-slate-800 disabled:opacity-60"
            >
              <Plus className="h-4 w-4" />
              {creating ? 'Adding Slot...' : 'Add Time Slot'}
            </button>
          </form>
        </div>
      </div>

      <div className="lg:col-span-8">
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="text-base font-semibold text-slate-900">Published Time Slots</h2>
          <span className="font-mono text-xs text-slate-500 tabular-nums">
            {slots.length} total
          </span>
        </div>

        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((row) => (
              <div key={row} className="h-14 animate-pulse rounded-xl border border-slate-200 bg-white" />
            ))}
          </div>
        ) : slots.length === 0 ? (
          <div className="rounded-xl border border-slate-200 bg-white px-6 py-12 text-center text-sm text-slate-500">
            No time slots created yet. Use the form to add your first appointment window.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
            <table className="w-full border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/80 text-xs font-medium text-slate-500">
                  <th className="px-4 py-3">Date & Time</th>
                  <th className="px-4 py-3">Appointment</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Remove</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {slots.map((slot) => {
                  const isConfirming = confirmDeleteId === slot.id;
                  const isBusy = deletingId === slot.id;
                  return (
                    <tr key={slot.id} className="hover:bg-slate-50/70">
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="font-mono text-xs text-slate-900 tabular-nums">
                          {formatDisplayDate(slot.slot_date)}
                        </div>
                        <div className="font-mono text-xs text-slate-500 tabular-nums">
                          {slot.start_time} – {slot.end_time}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-medium text-slate-900">{slot.title}</div>
                        <div className="text-xs text-slate-500">{slot.location || 'Main Studio'}</div>
                      </td>
                      <td className="px-4 py-3">
                        {slot.is_booked ? (
                          <div>
                            <div className="text-xs font-medium text-amber-700">
                              Booked by {slot.booked_by_name || 'Client'}
                            </div>
                            {slot.booked_by_email && (
                              <div className="text-[11px] text-slate-500">{slot.booked_by_email}</div>
                            )}
                          </div>
                        ) : (
                          <span className="text-xs font-medium text-emerald-700">Available</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        {isConfirming ? (
                          <div className="inline-flex items-center gap-2">
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => handleRemove(slot)}
                              className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-60"
                            >
                              {isBusy
                                ? 'Removing...'
                                : slot.is_booked
                                  ? 'Cancel Booking & Remove'
                                  : 'Confirm Remove'}
                            </button>
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => setConfirmDeleteId(null)}
                              className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
                            >
                              Keep
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteId(slot.id)}
                            aria-label={`Remove ${slot.title} slot`}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-red-700 transition-colors hover:border-red-200 hover:bg-red-50"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            Remove
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
