'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import api from '@/lib/api';
import { useTheme } from './ThemeProvider';

export default function Navbar() {
  const router = useRouter();
  const { theme, toggleTheme } = useTheme();
  const [alerts, setAlerts] = useState<any[]>([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [showUserMenu, setShowUserMenu] = useState(false);

  const fetchData = async () => {
    try {
      const [alertsRes, countRes, userRes] = await Promise.all([
        api.get('/alerts/?limit=5'),
        api.get('/alerts/unread-count'),
        api.get('/users/me'),
      ]);
      setAlerts(alertsRes.data);
      setUnreadCount(countRes.data.count);
      setCurrentUser(userRes.data);
    } catch (err: any) {
      console.error('Navbar fetchData failed:', err.message || err);
    }
  };

  useEffect(() => {
    fetchData();
    const iv = setInterval(fetchData, 60000);
    return () => clearInterval(iv);
  }, []);

  const handleLogout = () => {
    localStorage.removeItem('token');
    router.push('/login');
  };

  const markAllRead = async () => {
    try {
      await api.post('/alerts/mark-all-read');
      setUnreadCount(0);
      const res = await api.get('/alerts/?limit=5');
      setAlerts(res.data);
    } catch (err: any) {
      console.error('Failed to mark alerts as read:', err.message || err);
    }
  };

  const severityChip = (s: string) => {
    if (s === 'critical') return 'text-danger bg-danger/10 border border-danger/20';
    if (s === 'warning')  return 'text-warning bg-warning/10 border border-warning/20';
    return 'text-primary bg-primary/10 border border-primary/20';
  };

  return (
    <nav className="fixed top-0 left-0 right-0 z-40 h-14 flex items-center justify-between px-5 bg-dark-900/92 backdrop-blur-md border-b border-dark-700">

      {/* ── Logo ─────────────────────────────────────── */}
      <button
        onClick={() => router.push('/routers')}
        className="flex items-center gap-2.5 group outline-none"
        aria-label="Go to routers"
      >
        <div
          className="w-7 h-7 border border-primary/40 flex items-center justify-center
                     group-hover:border-primary/75 transition-colors duration-200"
          style={{ boxShadow: '0 0 10px rgba(0,212,255,0.1)' }}
        >
          <svg width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden="true">
            <rect x="0.75" y="5" width="11.5" height="3" rx="0.5" fill="#00d4ff" fillOpacity="0.9" />
            <rect x="1.5" y="2" width="1.8" height="1.8" rx="0.3" fill="#00d4ff" fillOpacity="0.45" />
            <rect x="5.6" y="2" width="1.8" height="1.8" rx="0.3" fill="#00d4ff" fillOpacity="0.45" />
            <rect x="9.7" y="2" width="1.8" height="1.8" rx="0.3" fill="#00d4ff" fillOpacity="0.45" />
            <rect x="1.5" y="9.2" width="1.8" height="1.8" rx="0.3" fill="#00d4ff" fillOpacity="0.45" />
            <rect x="5.6" y="9.2" width="1.8" height="1.8" rx="0.3" fill="#00d4ff" fillOpacity="0.45" />
            <rect x="9.7" y="9.2" width="1.8" height="1.8" rx="0.3" fill="#00d4ff" fillOpacity="0.45" />
          </svg>
        </div>
        <span className="font-mono text-[11px] font-bold tracking-[0.12em] uppercase text-slate-400 group-hover:text-primary transition-colors duration-200">
          VyOS<span className="text-primary">·</span>Dashy
        </span>
      </button>

      {/* ── Right actions ─────────────────────────────── */}
      <div className="flex items-center gap-0.5">

        {/* Theme toggle */}
        <button
          onClick={toggleTheme}
          className="btn-ghost p-2.5"
          title={theme === 'dark' ? 'Switch to light' : 'Switch to dark'}
        >
          {theme === 'dark' ? (
            <svg width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden="true">
              <circle cx="6.5" cy="6.5" r="2.3" stroke="currentColor" strokeWidth="1.1"/>
              <path d="M6.5 1V2.2M6.5 10.8V12M1 6.5H2.2M10.8 6.5H12M2.7 2.7L3.6 3.6M9.4 9.4L10.3 10.3M2.7 10.3L3.6 9.4M9.4 3.6L10.3 2.7" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round"/>
            </svg>
          ) : (
            <svg width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden="true">
              <path d="M11 7A4.5 4.5 0 0 1 6 2a4.5 4.5 0 1 0 5 5z" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round"/>
            </svg>
          )}
        </button>

        <div className="w-px h-5 bg-dark-700 mx-1" />

        {/* Notifications */}
        <div className="relative">
          <button
            onClick={() => { setShowNotifications(!showNotifications); setShowUserMenu(false); }}
            className="btn-ghost p-2.5 relative"
            aria-label="Notifications"
          >
            <svg width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden="true">
              <path d="M6.5 1.5a3 3 0 0 0-3 3v2.8L2 9h9L9.5 7.3V4.5a3 3 0 0 0-3-3z" stroke="currentColor" strokeWidth="1.1"/>
              <path d="M5 9a1.5 1.5 0 0 0 3 0" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round"/>
            </svg>
            {unreadCount > 0 && (
              <span
                className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-danger"
                style={{ boxShadow: '0 0 5px rgba(244,63,94,0.9)' }}
              />
            )}
          </button>

          {showNotifications && (
            <div
              className="absolute right-0 mt-1.5 w-72 op-panel overflow-hidden z-50"
              style={{ animation: 'fadeUp 0.2s ease both' }}
            >
              <div className="h-px bg-gradient-to-r from-transparent via-primary/40 to-transparent" />

              <div className="flex items-center justify-between px-4 py-2.5 border-b border-dark-700">
                <span className="section-label">
                  {unreadCount > 0 ? `${unreadCount} unread` : 'Alerts'}
                </span>
                {unreadCount > 0 && (
                  <button
                    onClick={markAllRead}
                    className="font-mono text-[9px] uppercase tracking-widest text-primary/50 hover:text-primary transition-colors"
                  >
                    Clear all
                  </button>
                )}
              </div>

              <div className="max-h-56 overflow-y-auto divide-y divide-dark-700/40">
                {alerts.length === 0 ? (
                  <p className="text-center py-7 font-mono text-[10px] text-slate-600 uppercase tracking-widest">
                    No alerts
                  </p>
                ) : (
                  alerts.map((alert) => (
                    <div key={alert.id} className="flex gap-3 items-start px-4 py-3 hover:bg-dark-800/50 transition-colors">
                      <span className={`font-mono text-[8px] uppercase tracking-widest px-1.5 py-0.5 mt-0.5 flex-shrink-0 ${severityChip(alert.severity)}`}>
                        {alert.severity}
                      </span>
                      <div>
                        <p className="text-[11px] text-slate-300 leading-snug">{alert.message}</p>
                        <p className="font-mono text-[9px] text-slate-600 mt-0.5">
                          {new Date(alert.timestamp).toLocaleTimeString()}
                        </p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        <div className="w-px h-5 bg-dark-700 mx-1" />

        {/* User menu */}
        <div className="relative">
          <button
            onClick={() => { setShowUserMenu(!showUserMenu); setShowNotifications(false); }}
            className="flex items-center gap-2 group px-2 py-1.5 hover:bg-dark-800 transition-colors duration-150"
          >
            <div
              className="w-7 h-7 border border-primary/30 flex items-center justify-center
                         font-mono text-[11px] font-bold text-primary
                         group-hover:border-primary/65 transition-colors duration-200"
              style={{ background: 'rgba(0,212,255,0.06)' }}
            >
              {currentUser?.full_name?.[0]?.toUpperCase() ?? 'U'}
            </div>
            <div className="hidden md:block text-left leading-none">
              <div className="font-mono text-[10px] text-slate-400 uppercase">
                {currentUser?.full_name?.split(' ')[0] ?? 'Operator'}
              </div>
            </div>
          </button>

          {showUserMenu && (
            <div
              className="absolute right-0 mt-1.5 w-52 op-panel overflow-hidden z-50"
              style={{ animation: 'fadeUp 0.2s ease both' }}
            >
              <div className="h-px bg-gradient-to-r from-transparent via-primary/40 to-transparent" />
              <div className="px-4 py-3 border-b border-dark-700">
                <div className="font-mono text-[10px] text-slate-400 truncate">{currentUser?.email}</div>
                <div className="font-mono text-[9px] uppercase tracking-widest mt-1" style={{ color: 'rgba(0,212,255,0.5)' }}>
                  {currentUser?.role} Account
                </div>
              </div>
              <div className="p-2">
                <button
                  onClick={handleLogout}
                  className="w-full flex items-center gap-2.5 px-3 py-2 font-mono text-[10px] uppercase tracking-widest text-danger hover:bg-danger/5 transition-colors"
                >
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                    <path d="M8 3.5L11 6.5M11 6.5L8 9.5M11 6.5H4M5 1.5H2C1.45 1.5 1 1.95 1 2.5V10.5C1 11.05 1.45 11.5 2 11.5H5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                  Sign Out
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </nav>
  );
}
