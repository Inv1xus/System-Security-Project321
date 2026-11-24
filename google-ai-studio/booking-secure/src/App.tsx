import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, X } from 'lucide-react';
import { api } from './api/client';
import { AdminPanel } from './components/AdminPanel';
import { AuthModal } from './components/AuthModal';
import { AvailableSlots } from './components/AvailableSlots';
import { Header } from './components/Header';
import { MyBookings } from './components/MyBookings';
import type { ActiveView, Booking, TimeSlot, User } from './types';
import { formatBookingRef } from './utils/format';

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [needsAdminSetup, setNeedsAdminSetup] = useState(false);
  const [authLoaded, setAuthLoaded] = useState(false);

  const [activeView, setActiveView] = useState<ActiveView>('slots');
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [pendingSlotToBook, setPendingSlotToBook] = useState<TimeSlot | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const loadSession = useCallback(async () => {
    try {
      const data = await api.getMe();
      setUser(data.user);
      setNeedsAdminSetup(data.needsAdminSetup);
    } catch {
      setUser(null);
    } finally {
      setAuthLoaded(true);
    }
  }, []);

  useEffect(() => {
    loadSession();
  }, [loadSession]);

  useEffect(() => {
    if (!toastMessage) return;
    const timer = setTimeout(() => setToastMessage(null), 5000);
    return () => clearTimeout(timer);
  }, [toastMessage]);

  const handleNavigate = (view: ActiveView) => {
    if (view === 'admin' && user?.role !== 'admin') {
      return;
    }
    setActiveView(view);
  };

  const handleAuthSuccess = (authenticatedUser: User) => {
    setUser(authenticatedUser);
    if (authenticatedUser.role === 'admin') {
      setNeedsAdminSetup(false);
    }
    setAuthModalOpen(false);
  };

  const handleLogout = async () => {
    try {
      await api.logout();
    } finally {
      setUser(null);
      setPendingSlotToBook(null);
      if (activeView === 'admin') {
        setActiveView('slots');
      }
      setToastMessage('You have been signed out.');
    }
  };

  const handleBookingCreated = (booking: Booking) => {
    setToastMessage(
      `Booked ${booking.slotTitle} (${formatBookingRef(booking.id)}). View it in My Bookings.`
    );
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900">
      <Header
        user={user}
        activeView={activeView}
        onNavigate={handleNavigate}
        onOpenAuth={() => setAuthModalOpen(true)}
        onLogout={handleLogout}
      />

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6 lg:px-8">
        {toastMessage && (
          <div
            role="status"
            className="mb-6 flex items-center justify-between gap-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900"
          >
            <div className="flex items-center gap-2.5">
              <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
              <span>{toastMessage}</span>
            </div>
            <button
              type="button"
              onClick={() => setToastMessage(null)}
              aria-label="Dismiss notification"
              className="rounded p-1 text-emerald-700 hover:bg-emerald-100"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {!authLoaded ? (
          <div className="space-y-4">
            <div className="h-10 w-64 animate-pulse rounded-lg bg-slate-200" />
            <div className="h-48 animate-pulse rounded-xl bg-slate-200" />
          </div>
        ) : activeView === 'slots' ? (
          <AvailableSlots
            user={user}
            pendingSlotToBook={pendingSlotToBook}
            onClearPendingSlot={() => setPendingSlotToBook(null)}
            onRequireAuthForSlot={(slot) => {
              setPendingSlotToBook(slot);
              setAuthModalOpen(true);
            }}
            onBookingCreated={handleBookingCreated}
          />
        ) : activeView === 'bookings' ? (
          <MyBookings
            user={user}
            onOpenAuth={() => setAuthModalOpen(true)}
            onBrowseSlots={() => setActiveView('slots')}
          />
        ) : (
          <AdminPanel />
        )}
      </main>

      <footer className="border-t border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 text-xs text-slate-500 sm:px-6 lg:px-8">
          <span>Cadence Appointment Scheduling</span>
          <span>All times displayed in local browser time</span>
        </div>
      </footer>

      <AuthModal
        isOpen={authModalOpen}
        needsAdminSetup={needsAdminSetup}
        onClose={() => {
          setAuthModalOpen(false);
          setPendingSlotToBook(null);
        }}
        onSuccess={handleAuthSuccess}
      />
    </div>
  );
}
