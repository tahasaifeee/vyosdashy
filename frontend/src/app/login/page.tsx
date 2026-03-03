'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import api from '@/lib/api';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    const formData = new FormData();
    formData.append('username', email);
    formData.append('password', password);

    try {
      const response = await api.post('/login/access-token', formData);
      localStorage.setItem('token', response.data.access_token);
      router.push('/routers');
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Invalid credentials');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      {/* Vertical accent lines */}
      <div className="fixed left-0 top-1/2 -translate-y-1/2 w-px h-48 bg-gradient-to-b from-transparent via-primary/15 to-transparent" />
      <div className="fixed right-0 top-1/2 -translate-y-1/2 w-px h-48 bg-gradient-to-b from-transparent via-primary/15 to-transparent" />

      <div className="w-full max-w-sm" style={{ animation: 'fadeUp 0.45s ease both' }}>
        {/* Logo block */}
        <div className="mb-9">
          <div className="flex items-center gap-3 mb-7">
            {/* Router icon — rack unit style */}
            <div
              className="w-9 h-9 border border-primary/50 flex items-center justify-center flex-shrink-0"
              style={{ boxShadow: '0 0 16px rgba(0,212,255,0.15)' }}
            >
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
                <rect x="1" y="7" width="16" height="4" rx="0.5" fill="#00d4ff" fillOpacity="0.9" />
                <rect x="2.5" y="3" width="2" height="2" rx="0.3" fill="#00d4ff" fillOpacity="0.4" />
                <rect x="8" y="3" width="2" height="2" rx="0.3" fill="#00d4ff" fillOpacity="0.4" />
                <rect x="13.5" y="3" width="2" height="2" rx="0.3" fill="#00d4ff" fillOpacity="0.4" />
                <rect x="2.5" y="13" width="2" height="2" rx="0.3" fill="#00d4ff" fillOpacity="0.4" />
                <rect x="8" y="13" width="2" height="2" rx="0.3" fill="#00d4ff" fillOpacity="0.4" />
                <rect x="13.5" y="13" width="2" height="2" rx="0.3" fill="#00d4ff" fillOpacity="0.4" />
                <circle cx="15" cy="9" r="0.8" fill="#22c55e" />
              </svg>
            </div>
            <div>
              <div className="font-mono text-[9px] uppercase tracking-[0.35em] text-slate-600">
                VyOS Network
              </div>
              <div className="font-sans font-extrabold text-xl tracking-tight text-white leading-none">
                DASHY
              </div>
            </div>
          </div>

          <div className="section-label mb-1.5">Access Portal</div>
          <h1 className="text-2xl font-bold text-white tracking-tight">
            Authentication<span className="text-primary">.</span>
          </h1>
          <p className="font-mono text-[10px] text-slate-600 mt-1.5 uppercase tracking-widest">
            Operator credentials required
          </p>
        </div>

        {/* Form panel */}
        <div className="op-panel overflow-hidden">
          {/* Top accent line */}
          <div className="h-px bg-gradient-to-r from-transparent via-primary/50 to-transparent" />

          <div className="p-6">
            {error && (
              <div className="mb-5 flex items-center gap-2.5 px-3 py-2.5 bg-danger/5 border-l-2 border-danger">
                <span className="led led-offline flex-shrink-0" />
                <p className="font-mono text-xs text-danger">{error}</p>
              </div>
            )}

            <form onSubmit={handleLogin} className="space-y-5">
              <div>
                <label className="data-label block mb-1.5">Email Address</label>
                <input
                  type="email"
                  required
                  autoComplete="email"
                  className="input-field"
                  placeholder="operator@vyos.local"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>

              <div>
                <label className="data-label block mb-1.5">Password</label>
                <input
                  type="password"
                  required
                  autoComplete="current-password"
                  className="input-field"
                  placeholder="••••••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>

              <div className="pt-1">
                <button
                  type="submit"
                  disabled={loading}
                  className="btn-primary w-full flex items-center justify-center gap-2 py-3"
                >
                  {loading ? (
                    <>
                      <span className="spinner" />
                      Verifying...
                    </>
                  ) : (
                    <>
                      <svg width="11" height="11" viewBox="0 0 11 11" fill="none" aria-hidden="true">
                        <path d="M7.5 5.5L4 2M7.5 5.5L4 9M7.5 5.5H1" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                      Authenticate
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>

          {/* Bottom status bar */}
          <div className="flex items-center gap-2 px-6 py-3 bg-dark-800/60 border-t border-dark-700">
            <span className="led led-online" />
            <span className="font-mono text-[10px] text-slate-600 uppercase tracking-widest">
              Secure connection active
            </span>
          </div>
        </div>

        <p className="mt-6 text-center font-mono text-[9px] text-dark-600 uppercase tracking-widest">
          VyOS UI Manager — Restricted Access
        </p>
      </div>
    </div>
  );
}
