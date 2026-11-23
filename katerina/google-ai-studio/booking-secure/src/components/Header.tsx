import type { ActiveView, User } from '../types';

interface HeaderProps {
  user: User | null;
  activeView: ActiveView;
  onNavigate: (view: ActiveView) => void;
  onOpenAuth: () => void;
  onLogout: () => void;
}

export function Header({ user, activeView, onNavigate, onOpenAuth, onLogout }: HeaderProps) {
  return (
    <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur-sm">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-8 px-4 sm:px-6 lg:px-8">
        {/* Zone 1: Single-element brand wordmark */}
        <button
          type="button"
          onClick={() => onNavigate('slots')}
          className="font-display text-xl font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-slate-900"
        >
          Cadence
        </button>

        {/* Zone 2: Clean single-line navigation links */}
        <nav aria-label="Primary navigation" className="flex items-center gap-6 overflow-x-auto">
          <button
            type="button"
            onClick={() => onNavigate('slots')}
            className={`relative py-5 text-sm font-medium transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900 ${
              activeView === 'slots'
                ? 'text-slate-900 after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:bg-slate-900'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Available Slots
          </button>

          <button
            type="button"
            onClick={() => onNavigate('bookings')}
            className={`relative py-5 text-sm font-medium transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900 ${
              activeView === 'bookings'
                ? 'text-slate-900 after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:bg-slate-900'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            My Bookings
          </button>

          {user?.role === 'admin' && (
            <button
              type="button"
              onClick={() => onNavigate('admin')}
              className={`relative py-5 text-sm font-medium transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900 ${
                activeView === 'admin'
                  ? 'text-slate-900 after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:bg-slate-900'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Admin
            </button>
          )}
        </nav>

        {/* Zone 3: Single primary action */}
        <div className="flex items-center gap-4 shrink-0">
          {user ? (
            <div className="flex items-center gap-3">
              <span className="hidden sm:inline text-sm text-slate-600 truncate max-w-[180px]">
                {user.name}
              </span>
              <button
                type="button"
                onClick={onLogout}
                className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-800 transition-colors hover:bg-slate-50 whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900"
              >
                Sign Out
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={onOpenAuth}
              className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-slate-800 whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900"
            >
              Sign In
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
