import React, { useState } from 'react';
import { useAuthStore } from '../stores/authStore';
import { apiLogin, apiRegister } from '../services/api';

export default function LoginPage() {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuthStore();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      let data;
      if (isLogin) {
        data = await apiLogin(email, password);
      } else {
        data = await apiRegister(email, password, name || email.split('@')[0]);
      }
      login(data.access_token, data.user);
    } catch (err: any) {
      setError(err.message || 'Authentication failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-blue-950 to-indigo-950 relative overflow-hidden">
      {/* Background grid pattern */}
      <div className="absolute inset-0 opacity-10">
        <svg width="100%" height="100%">
          <defs>
            <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
              <path d="M 40 0 L 0 0 0 40" fill="none" stroke="white" strokeWidth="0.5" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#grid)" />
        </svg>
      </div>

      {/* Floating architectural shapes */}
      <div className="absolute top-20 left-20 w-32 h-32 border border-blue-400/20 rotate-12 rounded-lg" />
      <div className="absolute bottom-32 right-32 w-48 h-24 border border-indigo-400/15 -rotate-6 rounded-lg" />
      <div className="absolute top-40 right-40 w-20 h-20 border border-cyan-400/20 rotate-45" />

      <div className="max-w-md w-full relative z-10 px-4">
        {/* Logo + Title */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 shadow-lg shadow-blue-500/25 mb-4">
            <svg className="w-8 h-8 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 21h18M3 7v14M21 7v14M6 7V3h12v4M9 21v-4h6v4M9 7h6" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <h1 className="text-3xl font-bold text-white tracking-tight">Maptix 3D</h1>
          <p className="text-blue-300/70 mt-1.5 text-sm">Indoor Mapping & 3D Reconstruction Platform</p>
        </div>

        {/* Card */}
        <div className="bg-white/5 backdrop-blur-xl rounded-2xl border border-white/10 p-8 shadow-2xl">
          <h2 className="text-xl font-semibold text-white mb-6">
            {isLogin ? 'Welcome back' : 'Create account'}
          </h2>

          <form onSubmit={handleSubmit} className="space-y-4">
            {!isLogin && (
              <div>
                <label className="block text-sm font-medium text-blue-200/70 mb-1.5">Name</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-lg text-white placeholder-white/30 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                  placeholder="Your name"
                  required
                />
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-blue-200/70 mb-1.5">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-lg text-white placeholder-white/30 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                placeholder="you@example.com"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-blue-200/70 mb-1.5">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-lg text-white placeholder-white/30 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                placeholder="••••••••"
                required
                minLength={6}
              />
            </div>

            {error && (
              <div className="text-sm text-red-300 bg-red-500/10 border border-red-500/20 rounded-lg p-3">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-medium rounded-lg hover:from-blue-500 hover:to-indigo-500 transition-all shadow-lg shadow-blue-600/25 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  {isLogin ? 'Signing in...' : 'Creating account...'}
                </span>
              ) : (
                isLogin ? 'Sign In' : 'Create Account'
              )}
            </button>
          </form>

          <p className="text-center text-sm text-white/40 mt-6">
            {isLogin ? "Don't have an account? " : 'Already have an account? '}
            <button
              className="text-blue-400 font-medium hover:text-blue-300 transition"
              onClick={() => { setIsLogin(!isLogin); setError(''); }}
            >
              {isLogin ? 'Sign Up' : 'Sign In'}
            </button>
          </p>
        </div>

        <p className="text-center text-xs text-white/20 mt-6">
          Maptix 3D v1.0 — Convert floor plans to 3D models
        </p>
      </div>
    </div>
  );
}
