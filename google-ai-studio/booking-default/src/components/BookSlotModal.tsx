import React, { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import type { TimeSlot } from '../types';
import { formatDisplayDate } from '../utils/date';

interface BookSlotModalProps {
  slot: TimeSlot | null;
  submitting: boolean;
  error: string;
  onClose: () => void;
  onConfirm: (slotId: number, notes: string) => void;
}

export function BookSlotModal({ slot, submitting, error, onClose, onConfirm }: BookSlotModalProps) {
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (slot) {
      setNotes('');
    }
  }, [slot]);

  useEffect(() => {
    if (!slot) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [slot, onClose]);

  if (!slot) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onConfirm(slot.id, notes);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-[2px]"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="book-modal-title"
    >
      <div
        className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 border-b border-slate-100 pb-4">
          <div>
            <h2 id="book-modal-title" className="text-lg font-semibold text-slate-900">
              Confirm Appointment
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Review the time slot details and reserve your spot.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-4 space-y-2 border-b border-slate-100 pb-4 text-sm">
          <div className="flex items-baseline justify-between gap-4">
            <span className="text-slate-500">Appointment</span>
            <span className="font-medium text-slate-900">{slot.title}</span>
          </div>
          <div className="flex items-baseline justify-between gap-4">
            <span className="text-slate-500">Date</span>
            <span className="font-mono text-xs text-slate-900 tabular-nums">
              {formatDisplayDate(slot.slot_date)}
            </span>
          </div>
          <div className="flex items-baseline justify-between gap-4">
            <span className="text-slate-500">Time</span>
            <span className="font-mono text-xs text-slate-900 tabular-nums">
              {slot.start_time} – {slot.end_time}
            </span>
          </div>
          <div className="flex items-baseline justify-between gap-4">
            <span className="text-slate-500">Location</span>
            <span className="text-slate-900">{slot.location || 'Main Studio'}</span>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div>
            <label htmlFor="booking-notes" className="block text-xs font-medium text-slate-700">
              Notes for your session (optional)
            </label>
            <textarea
              id="booking-notes"
              rows={3}
              maxLength={500}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Topics to cover, preparation context, or questions..."
              className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/15"
            />
          </div>

          {error && (
            <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
              {error}
            </div>
          )}

          <div className="flex items-center justify-end gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 whitespace-nowrap"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-slate-800 disabled:opacity-60 whitespace-nowrap"
            >
              {submitting ? 'Booking...' : 'Confirm Booking'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
