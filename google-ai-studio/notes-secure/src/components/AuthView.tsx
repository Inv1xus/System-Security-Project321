import { useState, type FormEvent } from 'react';
import { AlertCircle, Eye, EyeOff, Lock } from 'lucide-react';
import { ApiError, login, signup } from '../api';
import type { User } from '../types';

interface AuthViewProps {
  onAuthenticated: (user: User) => void;
}

type AuthMode = 'login' | 'signup';

export function AuthView({ onAuthenticated }: AuthViewProps) {
  const [mode, setMode] = useState<AuthMode>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const switchMode = (nextMode: AuthMode) => {
    setMode(nextMode);
    setError(null);
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);

    const trimmedUsername = username.trim();
    if (!trimmedUsername) {
      setError('Please enter your username.');
      return;
    }

    if (mode === 'signup') {
      if (!/^[a-zA-Z0-9_-]{3,32}$/.test(trimmedUsername)) {
        setError(
          'Username must be 3 to 32 characters using letters, numbers, hyphens, or underscores.'
        );
        return;
      }
      if (password.length < 8) {
        setError('Password must be at least 8 characters long.');
        return;
      }
    } else if (!password) {
      setError('Please enter your password.');
      return;
    }

    setSubmitting(true);
    try {
      const result =
        mode === 'login'
          ? await login(trimmedUsername, password)
          : await signup(trimmedUsername, password);
      onAuthenticated(result.user);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError('Unable to reach the server. Please try again.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <div className="mx-auto flex min-h-screen max-w-5xl flex-col justify-center px-6 py-12">
        <div className="grid grid-cols-1 items-stretch gap-10 lg:grid-cols-12 lg:gap-12">
          {/* Editorial introduction column */}
          <div className="flex flex-col justify-between lg:col-span-6 lg:py-4">
            <div>
              <div className="flex items-center gap-2.5 text-slate-900">
                <Lock className="h-4 w-4 text-blue-700" aria-hidden="true" />
                <span className="font-display text-xl font-semibold tracking-tight">Folio</span>
              </div>

              <h1 className="mt-8 font-display text-4xl leading-[1.15] font-medium tracking-tight text-balance text-slate-900 sm:text-5xl">
                Private notes, kept strictly yours.
              </h1>
              <p className="mt-5 max-w-md text-base leading-relaxed text-slate-600">
                A quiet, distraction-free notebook backed by your own SQLite database. Sign in to
                write, organize, search, and manage your personal notes.
              </p>
            </div>

            <dl className="mt-10 divide-y divide-slate-200 border-t border-b border-slate-200">
              <div className="py-4">
                <dt className="text-sm font-semibold text-slate-900">Per-account isolation</dt>
                <dd className="mt-1 text-sm text-slate-600">
                  Every note is scoped to your authenticated session and stored in local SQLite.
                </dd>
              </div>
              <div className="py-4">
                <dt className="text-sm font-semibold text-slate-900">Instant search and pinning</dt>
                <dd className="mt-1 text-sm text-slate-600">
                  Filter across titles and note bodies or pin key notes to the top of your list.
                </dd>
              </div>
              <div className="py-4">
                <dt className="text-sm font-semibold text-slate-900">Self-hosted ready</dt>
                <dd className="mt-1 text-sm text-slate-600">
                  Runs in a single Node.js and Express container with persistent volume storage.
                </dd>
              </div>
            </dl>
          </div>

          {/* Auth card column */}
          <div className="flex items-center lg:col-span-6">
            <div className="w-full rounded-xl border border-slate-200 bg-white p-7 sm:p-9">
              <div
                className="grid grid-cols-2 gap-1 rounded-lg bg-slate-100 p-1"
                role="tablist"
                aria-label="Authentication mode"
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={mode === 'login'}
                  onClick={() => switchMode('login')}
                  className={`min-h-[40px] whitespace-nowrap rounded-md px-4 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 ${
                    mode === 'login'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Log in
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={mode === 'signup'}
                  onClick={() => switchMode('signup')}
                  className={`min-h-[40px] whitespace-nowrap rounded-md px-4 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 ${
                    mode === 'signup'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Sign up
                </button>
              </div>

              <div className="mt-7">
                <h2 className="font-display text-2xl font-medium tracking-tight text-slate-900">
                  {mode === 'login' ? 'Welcome back' : 'Create your account'}
                </h2>
                <p className="mt-1.5 text-sm text-slate-600">
                  {mode === 'login'
                    ? 'Enter your credentials to open your private notes.'
                    : 'Choose a username and a password of at least 8 characters.'}
                </p>
              </div>

              {error && (
                <div
                  role="alert"
                  className="mt-5 flex items-start gap-2.5 rounded-lg border border-red-200 bg-red-50 px-3.5 py-3 text-sm text-red-800"
                >
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" aria-hidden="true" />
                  <span>{error}</span>
                </div>
              )}

              <form onSubmit={handleSubmit} className="mt-6 space-y-5" noValidate>
                <div>
                  <label
                    htmlFor="auth-username"
                    className="block text-sm font-medium text-slate-800"
                  >
                    Username
                  </label>
                  <input
                    id="auth-username"
                    name="username"
                    type="text"
                    autoComplete="username"
                    autoCapitalize="none"
                    spellCheck={false}
                    required
                    maxLength={32}
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="e.g. clara_vance"
                    className="mt-1.5 block min-h-[44px] w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-700/20"
                  />
                  {mode === 'signup' && (
                    <p className="mt-1.5 text-xs text-slate-500">
                      3–32 characters. Letters, numbers, hyphens, and underscores only.
                    </p>
                  )}
                </div>

                <div>
                  <label
                    htmlFor="auth-password"
                    className="block text-sm font-medium text-slate-800"
                  >
                    Password
                  </label>
                  <div className="relative mt-1.5">
                    <input
                      id="auth-password"
                      name="password"
                      type={showPassword ? 'text' : 'password'}
                      autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                      required
                      maxLength={128}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder={mode === 'signup' ? 'At least 8 characters' : 'Enter your password'}
                      className="block min-h-[44px] w-full rounded-lg border border-slate-300 bg-white py-2.5 pr-11 pl-3.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-700/20"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((prev) => !prev)}
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                      className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-slate-500 hover:text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700"
                    >
                      {showPassword ? (
                        <EyeOff className="h-4 w-4" aria-hidden="true" />
                      ) : (
                        <Eye className="h-4 w-4" aria-hidden="true" />
                      )}
                    </button>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={submitting}
                  className="flex min-h-[44px] w-full items-center justify-center rounded-lg bg-blue-700 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 focus-visible:ring-offset-2 disabled:opacity-60"
                >
                  {submitting
                    ? mode === 'login'
                      ? 'Logging in...'
                      : 'Creating account...'
                    : mode === 'login'
                      ? 'Log in'
                      : 'Create account'}
                </button>
              </form>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
