'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import api from '@/lib/api';
import Navbar from '@/components/Navbar';

interface Router {
  id: number;
  name: string;
  hostname: string;
  site: string;
  status: string;
  is_enabled: boolean;
  last_seen: string | null;
}

function RouterCard({
  r,
  index,
  onTest,
  onDelete,
  onNavigate,
}: {
  r: Router;
  index: number;
  onTest: (id: number) => void;
  onDelete: (id: number) => void;
  onNavigate: (id: number) => void;
}) {
  const isOnline   = r.status === 'online';
  const isOffline  = r.status === 'offline';
  const statusKey  = isOnline ? 'status-online' : isOffline ? 'status-offline' : 'status-unknown';
  const lastSeen   = r.last_seen
    ? new Date(r.last_seen).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : 'Never';

  return (
    <div
      className={`op-card flex flex-col ${statusKey}`}
      style={{ animation: `fadeUp 0.4s ease ${index * 55}ms both` }}
    >
      {/* Card header */}
      <div className="flex items-start justify-between px-5 pt-5 pb-4 border-b border-dark-700/60">
        <div className="flex items-center gap-3 min-w-0">
          <span
            className={`led flex-shrink-0 ${
              isOnline ? 'led-online' : isOffline ? 'led-offline' : 'led-unknown'
            }`}
          />
          <div className="min-w-0">
            <h3 className="font-bold text-sm text-white tracking-tight truncate">{r.name}</h3>
            <div className="font-mono text-[10px] text-slate-600 mt-0.5 truncate">{r.hostname}</div>
          </div>
        </div>

        <button
          onClick={() => onDelete(r.id)}
          className="text-slate-700 hover:text-danger transition-colors duration-150 p-1 ml-2 flex-shrink-0"
          title="Remove router"
        >
          <svg width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden="true">
            <path d="M1 1L12 12M12 1L1 12" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
          </svg>
        </button>
      </div>

      {/* Data rows */}
      <div className="px-5 py-1 flex-1">
        <div className="data-row">
          <span className="data-label">Location</span>
          <span className="data-value">{r.site || 'Remote'}</span>
        </div>
        <div className="data-row">
          <span className="data-label">Status</span>
          <span
            className={`font-mono text-[10px] font-bold uppercase tracking-widest ${
              isOnline ? 'text-success' : isOffline ? 'text-danger' : 'text-slate-600'
            }`}
          >
            {r.status}
          </span>
        </div>
        <div className="data-row" style={{ borderBottom: 'none' }}>
          <span className="data-label">Last Seen</span>
          <span className="data-value">{lastSeen}</span>
        </div>
      </div>

      {/* Action bar */}
      <div className="flex border-t border-dark-700 mt-2">
        <button
          onClick={() => onTest(r.id)}
          className="flex-1 py-3 font-mono text-[10px] uppercase tracking-widest text-slate-600
                     hover:text-primary hover:bg-primary/5 transition-all duration-150
                     border-r border-dark-700"
        >
          Ping
        </button>
        <button
          onClick={() => onNavigate(r.id)}
          className="flex-1 py-3 font-mono text-[10px] uppercase tracking-widest text-primary
                     hover:bg-primary/10 transition-all duration-150
                     flex items-center justify-center gap-1.5"
        >
          Manage
          <svg width="8" height="8" viewBox="0 0 8 8" fill="none" aria-hidden="true">
            <path d="M1 4H7M7 4L4 1M7 4L4 7" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
      </div>
    </div>
  );
}

export default function RoutersPage() {
  const [routers, setRouters]         = useState<Router[]>([]);
  const [loading, setLoading]         = useState(true);
  const [submitting, setSubmitting]   = useState(false);
  const [error, setError]             = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [newRouter, setNewRouter]     = useState({ name: '', hostname: '', site: '', api_key: '' });
  const router = useRouter();

  const fetchRouters = async () => {
    try {
      const response = await api.get('/routers/');
      setRouters(response.data);
    } catch (err: any) {
      if (err.response?.status === 401) router.push('/login');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchRouters(); }, []);

  const handleAddRouter = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await api.post('/routers/', newRouter);
      setShowAddModal(false);
      setNewRouter({ name: '', hostname: '', site: '', api_key: '' });
      fetchRouters();
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to connect to router.');
    } finally {
      setSubmitting(false);
    }
  };

  const testConnection = async (id: number) => {
    try {
      const response = await api.post(`/routers/${id}/test-connection`);
      fetchRouters();
      if (response.data.is_online) {
        alert(`Router "${response.data.name}" is ONLINE.`);
      } else {
        alert(`Router "${response.data.name}" is OFFLINE.\nError: ${response.data.error || 'Unknown'}`);
      }
    } catch {
      alert('Failed to trigger connection test.');
    }
  };

  const handleDeleteRouter = async (id: number) => {
    if (!confirm('Are you sure you want to delete this router?')) return;
    try {
      await api.delete(`/routers/${id}`);
      fetchRouters();
    } catch {
      alert('Failed to delete router.');
    }
  };

  const onlineCount = routers.filter((r) => r.status === 'online').length;

  return (
    <div className="min-h-screen pt-20 pb-14 px-6 lg:px-10">
      <Navbar />

      <div className="max-w-6xl mx-auto">
        {/* Page header */}
        <header
          className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 pt-8 mb-8"
          style={{ animation: 'fadeUp 0.4s ease both' }}
        >
          <div>
            <div className="section-label mb-1.5">Infrastructure</div>
            <h1 className="text-2xl font-bold text-white tracking-tight">
              Router Registry<span className="text-primary">.</span>
            </h1>
            <div className="flex items-center gap-3 mt-2.5">
              <div className="flex items-center gap-1.5">
                <span className="led led-online" />
                <span className="font-mono text-[10px] text-success">{onlineCount} online</span>
              </div>
              <span className="text-dark-600 font-mono text-xs">·</span>
              <span className="font-mono text-[10px] text-slate-600">{routers.length} total</span>
            </div>
          </div>

          <button
            onClick={() => setShowAddModal(true)}
            className="btn-primary flex items-center gap-2 self-start sm:self-auto"
          >
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
              <path d="M5 1V9M1 5H9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
            Register Router
          </button>
        </header>

        {/* Divider */}
        <div
          className="h-px mb-8"
          style={{ background: 'linear-gradient(to right, rgba(0,212,255,0.3), rgba(20,25,41,0.5), transparent)' }}
        />

        {/* Content */}
        {loading ? (
          <div className="flex flex-col items-center justify-center py-36">
            <div
              className="w-8 h-8 rounded-full border border-dark-600 border-t-primary animate-spin mb-5"
            />
            <p className="font-mono text-[10px] text-slate-600 uppercase tracking-widest">
              Syncing registry...
            </p>
          </div>
        ) : routers.length === 0 ? (
          <div
            className="flex flex-col items-center justify-center py-36 text-center"
            style={{ animation: 'fadeUp 0.4s ease both' }}
          >
            <div className="w-14 h-14 border border-dark-600 flex items-center justify-center mb-5">
              <svg width="28" height="28" viewBox="0 0 28 28" fill="none" aria-hidden="true">
                <rect x="2" y="10" width="24" height="8" rx="1" stroke="#2a3450" strokeWidth="1.5"/>
                <circle cx="22" cy="14" r="1.5" fill="#2a3450"/>
                <circle cx="18" cy="14" r="1.5" fill="#2a3450"/>
              </svg>
            </div>
            <p className="font-bold text-slate-400 text-sm mb-1.5">No routers registered</p>
            <p className="font-mono text-[10px] text-slate-600 uppercase tracking-widest">
              Register your first VyOS instance to begin
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {routers.map((r, i) => (
              <RouterCard
                key={r.id}
                r={r}
                index={i}
                onTest={testConnection}
                onDelete={handleDeleteRouter}
                onNavigate={(id) => router.push(`/routers/${id}`)}
              />
            ))}
          </div>
        )}
      </div>

      {/* ── Add Router Modal ──────────────────────────── */}
      {showAddModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(6,8,16,0.88)', backdropFilter: 'blur(4px)' }}
        >
          <div
            className="op-panel w-full max-w-md overflow-hidden"
            style={{ animation: 'fadeUp 0.3s ease both' }}
          >
            <div className="h-px bg-gradient-to-r from-transparent via-primary/50 to-transparent" />

            <div className="flex items-center justify-between px-6 py-4 border-b border-dark-700">
              <div>
                <div className="section-label mb-0.5">New Device</div>
                <h2 className="font-bold text-white text-sm">Register Router</h2>
              </div>
              <button
                onClick={() => setShowAddModal(false)}
                className="text-slate-600 hover:text-white transition-colors p-1"
              >
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                  <path d="M1 1L13 13M13 1L1 13" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
                </svg>
              </button>
            </div>

            <div className="p-6">
              {error && (
                <div className="mb-5 flex items-start gap-2.5 px-3 py-2.5 bg-danger/5 border-l-2 border-danger">
                  <span className="led led-offline mt-0.5 flex-shrink-0" />
                  <p className="font-mono text-xs text-danger">{error}</p>
                </div>
              )}

              <form onSubmit={handleAddRouter} className="space-y-4">
                <div>
                  <label className="data-label block mb-1.5">Friendly Name</label>
                  <input
                    required
                    className="input-field"
                    placeholder="Core-Edge-01"
                    value={newRouter.name}
                    onChange={(e) => setNewRouter({ ...newRouter, name: e.target.value })}
                  />
                </div>
                <div>
                  <label className="data-label block mb-1.5">IP / Hostname</label>
                  <input
                    required
                    className="input-field"
                    placeholder="10.0.0.1 or vyos.local"
                    value={newRouter.hostname}
                    onChange={(e) => setNewRouter({ ...newRouter, hostname: e.target.value })}
                  />
                </div>
                <div>
                  <label className="data-label block mb-1.5">Site / Region</label>
                  <input
                    className="input-field"
                    placeholder="London-DC"
                    value={newRouter.site}
                    onChange={(e) => setNewRouter({ ...newRouter, site: e.target.value })}
                  />
                </div>
                <div>
                  <label className="data-label block mb-1.5">API Key</label>
                  <input
                    required
                    type="password"
                    className="input-field"
                    placeholder="••••••••••••"
                    value={newRouter.api_key}
                    onChange={(e) => setNewRouter({ ...newRouter, api_key: e.target.value })}
                  />
                </div>

                <div className="flex gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowAddModal(false)}
                    className="btn-secondary flex-1"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="btn-primary flex-1 flex items-center justify-center gap-2"
                  >
                    {submitting ? (
                      <>
                        <span className="spinner" />
                        Registering...
                      </>
                    ) : 'Register'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
