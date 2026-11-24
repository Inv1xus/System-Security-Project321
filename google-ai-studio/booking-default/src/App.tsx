import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from './api';
import type { AppView, Booking, TimeSlot, User } from './types';
import { AuthModal } from './components/AuthModal';
import { BookSlotModal } from './components/BookSlotModal';
import { SlotsView } from './components/SlotsView';
import { MyBookingsView } from './components/MyBookingsView';
import { AdminBookingsView } from './components/AdminBookingsView';
import { AdminSlotsView } from './components/AdminSlotsView';
import { formatShortDate } from './utils/date';

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [view, setView] = useState<AppView>('slots');

  const [slots, setSlots] = useState<TimeSlot[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(true);

  const [bookings, setBookings] = useState<Booking[]>([]);
  const [bookingsLoading, setBookingsLoading] = useState(false);

  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authModalMode, setAuthModalMode] = useState<'login' | 'signup'>('login');

  const [selectedSlot, setSelectedSlot] = useState<TimeSlot | null>(null);
  const [bookingSubmitting, setBookingSubmitting] = useState(false);
  const [bookingError, setBookingError] = useState('');
  const [cancellingId, setCancellingId] = useState<number | null>(null);

  const [notice, setNotice] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const showNotice = useCallback((type: 'success' | 'error', message: string) => {
    setNotice({ type, message });
  }, []);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), 4500);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const loadSlots = useCallback(async () => {
    setSlotsLoading(true);
    try {
      const data = await api.getSlots();
      setSlots(data.slots);
    } catch (err) {
      showNotice('error', err instanceof Error ? err.message : 'Unable to load time slots.');
    } finally {
      setSlotsLoading(false);
    }
  }, [showNotice]);

  const loadBookings = useCallback(async () => {
    setBookingsLoading(true);
    try {
      const data = await api.getBookings();
      setBookings(data.bookings);
    } catch (err) {
      showNotice('error', err instanceof Error ? err.message : 'Unable to load bookings.');
    } finally {
      setBookingsLoading(false);
    }
  }, [showNotice]);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await api.getMe();
        if (active) {
          setUser(res.user);
        }
      } catch {
        if (active) {
          setUser(null);
        }
      } finally {
        if (active) {
          setAuthChecked(true);
        }
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    loadSlots();
  }, [loadSlots, user]);

  useEffect(() => {
    if (user) {
      loadBookings();
    } else {
      setBookings([]);
    }
  }, [user, loadBookings]);

  const handleAuthSuccess = (loggedInUser: User) => {
    setUser(loggedInUser);
    showNotice('success', `Signed in as ${loggedInUser.name}.`);
  };

  const handleLogout = async () => {
    try {
      await api.logout();
      setUser(null);
      setBookings([]);
      setView('slots');
      showNotice('success', 'You have signed out.');
    } catch {
      showNotice('error', 'Failed to sign out.');
    }
  };

  const handleConfirmBooking = async (slotId: number, notes: string) => {
    setBookingSubmitting(true);
    setBookingError('');
    try {
      await api.createBooking({ slot_id: slotId, notes });
      setSelectedSlot(null);
      await Promise.all([loadSlots(), loadBookings()]);
      showNotice('success', 'Appointment booked and confirmed.');
    } catch (err) {
      setBookingError(err instanceof Error ? err.message : 'Booking failed.');
    } finally {
      setBookingSubmitting(false);
    }
  };

  const handleCancelBooking = async (bookingId: number) => {
    setCancellingId(bookingId);
    try {
      await api.cancelBooking(bookingId);
      await Promise.all([loadSlots(), loadBookings()]);
      showNotice('success', 'Booking cancelled. The time slot is now available again.');
    } catch (err) {
      showNotice('error', err instanceof Error ? err.message : 'Could not cancel booking.');
    } finally {
      setCancellingId(null);
    }
  };

  const handleCreateSlot = async (payload: {
    title: string;
    slot_date: string;
    start_time: string;
    end_time: string;
    location: string;
  }) => {
    await api.createSlot(payload);
    await loadSlots();
    showNotice('success', 'New time slot published to the schedule.');
  };

  const handleDeleteSlot = async (slotId: number, force = false) => {
    try {
      await api.deleteSlot(slotId, force);
      await Promise.all([loadSlots(), loadBookings()]);
      showNotice('success', 'Time slot removed from schedule.');
    } catch (err) {
      showNotice('error', err instanceof Error ? err.message : 'Unable to remove time slot.');
    }
  };

  const openSlotsCount = useMemo(() => slots.filter((s) => !s.is_booked).length, [slots]);
  const myConfirmedCount = useMemo(
    () => bookings.filter((b) => b.status === 'confirmed' && (!user || b.user_id === user.id)).length,
    [bookings, user]
  );
  const allConfirmedCount = useMemo(
    () => bookings.filter((b) => b.status === 'confirmed').length,
    [bookings]
  );
  const nextOpenDate = useMemo(() => {
    const firstOpen = slots.find((s) => !s.is_booked);
    return firstOpen ? formatShortDate(firstOpen.slot_date) : 'None';
  }, [slots]);

  const navItems: Array<{ id: AppView; label: string; requiresAuth?: boolean; adminOnly?: boolean }> = [
    { id: 'slots', label: 'Available Slots' },
    { id: 'my-bookings', label: 'My Bookings', requiresAuth: true },
    { id: 'admin-bookings', label: 'All Bookings', adminOnly: true },
    { id: 'admin-slots', label: 'Manage Slots', adminOnly: true },
  ];

  const visibleNavItems = navItems.filter((item) => {
    if (item.adminOnly) return user?.role === 'admin';
    if (item.requiresAuth) return Boolean(user);
    return true;
  });

  const viewMeta: Record<AppView, { heading: string; subtitle: string }> = {
    slots: {
      heading: 'Schedule an Appointment',
      subtitle: 'Browse open session windows and reserve a time that works for you.',
    },
    'my-bookings': {
      heading: 'My Bookings',
      subtitle: 'Review your upcoming reservations or cancel an appointment to release its time slot.',
    },
    'admin-bookings': {
      heading: 'All Bookings',
      subtitle: 'View and manage every client appointment across the studio schedule.',
    },
    'admin-slots': {
      heading: 'Manage Time Slots',
      subtitle: 'Publish new appointment windows or remove existing slots from availability.',
    },
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-8 px-4 py-4 sm:px-6">
          <button
            type="button"
            onClick={() => setView('slots')}
            className="font-display text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-slate-900"
          >
            Cadence
          </button>

          <nav aria-label="Primary navigation" className="hidden items-center gap-6 md:flex">
            {visibleNavItems.map((item) => {
              const active = view === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setView(item.id)}
                  className={`border-b-2 py-1 text-sm font-medium transition-colors whitespace-nowrap shrink-0 ${
                    active
                      ? 'border-slate-900 text-slate-900'
                      : 'border-transparent text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {item.label}
                </button>
              );
            })}
          </nav>

          <div className="flex items-center gap-3 shrink-0">
            {!authChecked ? (
              <div className="h-9 w-20 animate-pulse rounded-lg bg-slate-100" />
            ) : user ? (
              <div className="flex items-center gap-3">
                <span className="hidden text-xs text-slate-600 sm:inline whitespace-nowrap">
                  {user.name}
                  {user.role === 'admin' ? ' · Admin' : ''}
                </span>
                <button
                  type="button"
                  onClick={handleLogout}
                  className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 whitespace-nowrap shrink-0"
                >
                  Sign Out
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setAuthModalMode('login');
                  setAuthModalOpen(true);
                }}
                className="rounded-lg bg-slate-900 px-4 py-2 text-xs font-medium text-white transition-colors hover:bg-slate-800 whitespace-nowrap shrink-0"
              >
                Sign In
              </button>
            )}
          </div>
        </div>

        {visibleNavItems.length > 1 && (
          <nav
            aria-label="Mobile navigation"
            className="flex items-center gap-4 overflow-x-auto border-t border-slate-100 px-4 py-2 md:hidden"
          >
            {visibleNavItems.map((item) => {
              const active = view === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setView(item.id)}
                  className={`border-b-2 py-1 text-xs font-medium whitespace-nowrap shrink-0 ${
                    active
                      ? 'border-slate-900 text-slate-900'
                      : 'border-transparent text-slate-600'
                  }`}
                >
                  {item.label}
                </button>
              );
            })}
          </nav>
        )}
      </header>

      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <div className="flex flex-col gap-6 border-b border-slate-200 pb-6 md:flex-row md:items-end md:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl text-balance">
              {viewMeta[view].heading}
            </h1>
            <p className="mt-1.5 text-sm text-slate-600">{viewMeta[view].subtitle}</p>
          </div>

          <dl className="grid grid-cols-3 gap-6 border-t border-slate-200 pt-4 md:border-t-0 md:pt-0">
            <div>
              <dt className="text-xs text-slate-500">Open Slots</dt>
              <dd className="mt-1 font-mono text-lg font-semibold text-slate-900 tabular-nums">
                {openSlotsCount}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">
                {user?.role === 'admin' ? 'All Confirmed' : 'Your Bookings'}
              </dt>
              <dd className="mt-1 font-mono text-lg font-semibold text-slate-900 tabular-nums">
                {user ? (user.role === 'admin' ? allConfirmedCount : myConfirmedCount) : 0}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">Next Opening</dt>
              <dd className="mt-1 font-mono text-sm font-semibold text-slate-900 tabular-nums whitespace-nowrap">
                {nextOpenDate}
              </dd>
            </div>
          </dl>
        </div>

        {notice && (
          <div
            role="status"
            className={`mt-6 flex items-center justify-between gap-4 rounded-xl border px-4 py-3 text-sm ${
              notice.type === 'success'
                ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
                : 'border-red-200 bg-red-50 text-red-900'
            }`}
          >
            <span>{notice.message}</span>
            <button
              type="button"
              onClick={() => setNotice(null)}
              className="text-xs font-medium underline underline-offset-2"
            >
              Dismiss
            </button>
          </div>
        )}

        {!user && authChecked && view === 'slots' && (
          <div className="mt-6 flex flex-col gap-3 rounded-xl border border-slate-200 bg-white px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-slate-700">
              Sign in or create an account to book a time slot and manage your reservations.
            </p>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => {
                  setAuthModalMode('signup');
                  setAuthModalOpen(true);
                }}
                className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 whitespace-nowrap"
              >
                Sign Up
              </button>
              <button
                type="button"
                onClick={() => {
                  setAuthModalMode('login');
                  setAuthModalOpen(true);
                }}
                className="rounded-lg bg-slate-900 px-4 py-2 text-xs font-medium text-white transition-colors hover:bg-slate-800 whitespace-nowrap"
              >
                Sign In
              </button>
            </div>
          </div>
        )}

        <div className="mt-6">
          {view === 'slots' && (
            <SlotsView
              slots={slots}
              loading={slotsLoading}
              user={user}
              onSelectSlot={(slot) => {
                setBookingError('');
                setSelectedSlot(slot);
              }}
              onRequireAuth={() => {
                setAuthModalMode('login');
                setAuthModalOpen(true);
              }}
              onNavigateMyBookings={() => setView('my-bookings')}
            />
          )}

          {view === 'my-bookings' && user && (
            <MyBookingsView
              bookings={bookings.filter((b) => b.user_id === user.id)}
              loading={bookingsLoading}
              cancellingId={cancellingId}
              onCancelBooking={handleCancelBooking}
              onBrowseSlots={() => setView('slots')}
            />
          )}

          {view === 'admin-bookings' && user?.role === 'admin' && (
            <AdminBookingsView
              bookings={bookings}
              loading={bookingsLoading}
              cancellingId={cancellingId}
              onCancelBooking={handleCancelBooking}
            />
          )}

          {view === 'admin-slots' && user?.role === 'admin' && (
            <AdminSlotsView
              slots={slots}
              loading={slotsLoading}
              onCreateSlot={handleCreateSlot}
              onDeleteSlot={handleDeleteSlot}
            />
          )}
        </div>
      </main>

      <AuthModal
        isOpen={authModalOpen}
        initialMode={authModalMode}
        onClose={() => setAuthModalOpen(false)}
        onSuccess={handleAuthSuccess}
      />

      <BookSlotModal
        slot={selectedSlot}
        submitting={bookingSubmitting}
        error={bookingError}
        onClose={() => {
          setSelectedSlot(null);
          setBookingError('');
        }}
        onConfirm={handleConfirmBooking}
      />
    </div>
  );
}
