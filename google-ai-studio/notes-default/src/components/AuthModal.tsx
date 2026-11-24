import React, { useState } from 'react';
import { Lock, ShieldCheck, UserPlus, LogIn, ArrowRight, Sparkles } from 'lucide-react';
import { api } from '../services/api.ts';
import { User } from '../types.ts';

interface AuthModalProps {
  onSuccess: (user: User) => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({ onSuccess }) => {
  const [isRegister, setIsRegister] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      if (isRegister) {
        if (username.trim().length < 3) {
          setError('Username must be at least 3 characters.');
          setLoading(false);
          return;
        }
        if (password.length < 6) {
          setError('Password must be at least 6 characters.');
          setLoading(false);
          return;
        }
        const data = await api.register(username.trim(), password, email.trim() || undefined);
        onSuccess(data.user);
      } else {
        const data = await api.login(username.trim(), password);
        onSuccess(data.user);
      }
    } catch (err: any) {
      setError(err.message || 'Authentication failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleDemoLogin = async () => {
    setError(null);
    setLoading(true);
    const demoUser = 'demo_user';
    const demoPass = 'demo_pass123';

    try {
      // Try login first
      const data = await api.login(demoUser, demoPass);
      onSuccess(data.user);
    } catch {
      // If demo account doesn't exist yet, register it
      try {
        const regData = await api.register(demoUser, demoPass, 'demo@vaultnotes.local');
        onSuccess(regData.user);
      } catch (regErr: any) {
        setError(regErr.message || 'Could not launch demo session.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-stone-900 flex flex-col justify-center items-center px-4 py-12 relative overflow-hidden">
      {/* Decorative background grid and glow */}
      <div className="absolute inset-0 bg-[radial-gradient(#333_1px,transparent_1px)] [background-size:24px_24px] opacity-20 pointer-events-none" />
      <div className="absolute top-1/4 -left-20 w-80 h-80 bg-amber-600/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 -right-20 w-80 h-80 bg-stone-700/20 rounded-full blur-3xl pointer-events-none" />

      <div className="relative w-full max-w-md bg-stone-950/80 backdrop-blur-xl border border-stone-800 rounded-2xl shadow-2xl p-8 z-10">
        {/* Header Branding */}
        <div className="flex flex-col items-center text-center mb-8">
          <div className="w-14 h-14 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center mb-4 text-amber-500 shadow-inner">
            <Lock className="w-7 h-7" />
          </div>
          <h1 className="text-2xl font-bold text-stone-100 tracking-tight font-serif">VaultNotes</h1>
          <p className="text-sm text-stone-400 mt-1.5 flex items-center gap-1.5">
            <ShieldCheck className="w-4 h-4 text-emerald-500" />
            Zero-knowledge, SQLite-backed private storage
          </p>
        </div>

        {/* Tab switcher */}
        <div className="grid grid-cols-2 p-1 bg-stone-900 rounded-xl mb-6 border border-stone-800/80">
          <button
            type="button"
            onClick={() => { setIsRegister(false); setError(null); }}
            className={`py-2 text-sm font-medium rounded-lg transition-all flex items-center justify-center gap-1.5 ${
              !isRegister
                ? 'bg-stone-800 text-stone-100 shadow'
                : 'text-stone-400 hover:text-stone-200'
            }`}
          >
            <LogIn className="w-4 h-4" />
            Log In
          </button>
          <button
            type="button"
            onClick={() => { setIsRegister(true); setError(null); }}
            className={`py-2 text-sm font-medium rounded-lg transition-all flex items-center justify-center gap-1.5 ${
              isRegister
                ? 'bg-stone-800 text-stone-100 shadow'
                : 'text-stone-400 hover:text-stone-200'
            }`}
          >
            <UserPlus className="w-4 h-4" />
            Sign Up
          </button>
        </div>

        {error && (
          <div className="mb-5 p-3 rounded-lg bg-red-950/50 border border-red-800/50 text-red-300 text-sm flex items-start gap-2">
            <span className="text-red-400">⚠️</span>
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-stone-400 mb-1.5">
              Username
            </label>
            <input
              type="text"
              required
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="e.g. alexander"
              className="w-full px-3.5 py-2.5 bg-stone-900 border border-stone-800 rounded-lg text-stone-100 placeholder-stone-500 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500 transition-all"
            />
          </div>

          {isRegister && (
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-stone-400 mb-1.5">
                Email <span className="text-stone-500 lowercase">(optional)</span>
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@domain.com"
                className="w-full px-3.5 py-2.5 bg-stone-900 border border-stone-800 rounded-lg text-stone-100 placeholder-stone-500 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500 transition-all"
              />
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-stone-400 mb-1.5">
              Password
            </label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={isRegister ? 'Min. 6 characters' : 'Enter your password'}
              className="w-full px-3.5 py-2.5 bg-stone-900 border border-stone-800 rounded-lg text-stone-100 placeholder-stone-500 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500 transition-all"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 px-4 bg-amber-500 hover:bg-amber-400 active:bg-amber-600 text-stone-950 font-semibold text-sm rounded-lg transition-all shadow-md shadow-amber-500/10 flex items-center justify-center gap-2 mt-2 disabled:opacity-50"
          >
            {loading ? (
              <span className="inline-block w-4 h-4 border-2 border-stone-900 border-t-transparent rounded-full animate-spin" />
            ) : (
              <>
                <span>{isRegister ? 'Create Vault Account' : 'Unlock Your Vault'}</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </form>

        <div className="relative my-6 text-center">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-stone-800" />
          </div>
          <span className="relative px-3 bg-stone-950 text-xs text-stone-500 uppercase tracking-wider">
            or quick demo
          </span>
        </div>

        <button
          type="button"
          onClick={handleDemoLogin}
          disabled={loading}
          className="w-full py-2.5 px-4 bg-stone-900 hover:bg-stone-850 active:bg-stone-800 text-stone-300 hover:text-stone-100 text-sm font-medium rounded-lg border border-stone-800 transition-all flex items-center justify-center gap-2"
        >
          <Sparkles className="w-4 h-4 text-amber-400" />
          One-Click Demo Guest Mode
        </button>

        <div className="mt-6 text-center text-xs text-stone-500">
          Isolated per-user SQLite storage • Port 3000
        </div>
      </div>
    </div>
  );
};
