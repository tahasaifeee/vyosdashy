'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import api from '@/lib/api';
import { 
  Plus, Router as RouterIcon, Signal, SignalLow, 
  Trash2, RefreshCcw, MapPin, Activity, ChevronRight 
} from 'lucide-react';
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

export default function RoutersPage() {
  const [routers, setRouters] = useState<Router[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [newRouter, setNewRouter] = useState({ name: '', hostname: '', site: '', api_key: '' });
  const router = useRouter();

  const fetchRouters = async () => {
    try {
      const response = await api.get('/routers/');
      setRouters(response.data);
    } catch (err: any) {
      if (err.response?.status === 401) {
        router.push('/login');
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRouters();
  }, []);

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
      await api.post(`/routers/${id}/test-connection`);
      fetchRouters();
    } catch (err) {
      alert('Failed to trigger connection test.');
    }
  };

  const handleDeleteRouter = async (id: number) => {
    if (!confirm('Are you sure you want to delete this router?')) return;
    try {
      await api.delete(`/routers/${id}`);
      fetchRouters();
    } catch (err) {
      alert('Failed to delete router.');
    }
  };

  return (
    <div className="min-h-screen pt-24 pb-12 px-6 lg:px-12">
      <Navbar />
      
      <div className="max-w-7xl mx-auto">
        <header className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-12">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <div className="bg-primary/10 p-2 rounded-lg">
                <Activity className="w-5 h-5 text-primary" />
              </div>
              <h1 className="text-3xl font-extrabold tracking-tight text-white">
                Router <span className="text-primary">Registry</span>
              </h1>
            </div>
            <p className="text-slate-400 font-medium">Monitoring and managing {routers.length} active instances.</p>
          </div>
          <button
            onClick={() => setShowAddModal(true)}
            className="btn-primary flex items-center gap-2 group"
          >
            <Plus className="w-5 h-5 group-hover:rotate-90 transition-transform duration-300" />
            Add New Router
          </button>
        </header>

        {loading ? (
          <div className="flex flex-col items-center justify-center py-32 opacity-50">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mb-4"></div>
            <p className="text-slate-400 font-medium">Syncing with registry...</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {routers.map((r) => (
              <div key={r.id} className="glass-card p-6 flex flex-col group">
                <div className="flex justify-between items-start mb-6">
                  <div className="flex items-center gap-4">
                    <div className={`p-3 rounded-2xl ${
                      r.status === 'online' ? 'bg-success/10 text-success' : 'bg-danger/10 text-danger'
                    }`}>
                      <RouterIcon className="w-6 h-6" />
                    </div>
                    <div>
                      <h3 className="text-lg font-bold text-white group-hover:text-primary transition-colors">{r.name}</h3>
                      <p className="text-sm text-slate-500 font-mono">{r.hostname}</p>
                    </div>
                  </div>
                  <button 
                    onClick={() => handleDeleteRouter(r.id)}
                    className="p-2 text-slate-500 hover:text-danger hover:bg-danger/10 rounded-lg transition-all"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>

                <div className="space-y-4 mb-8">
                  <div className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2 text-slate-400">
                      <MapPin className="w-4 h-4" />
                      <span>Location</span>
                    </div>
                    <span className="text-slate-200 font-semibold">{r.site || 'Remote'}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2 text-slate-400">
                      <Signal className="w-4 h-4" />
                      <span>Status</span>
                    </div>
                    <div className={`status-badge ${
                      r.status === 'online' ? 'bg-success/10 text-success border-success/20' : 'bg-danger/10 text-danger border-danger/20'
                    }`}>
                      <div className={`w-1.5 h-1.5 rounded-full animate-pulse ${
                        r.status === 'online' ? 'bg-success' : 'bg-danger'
                      }`} />
                      {r.status}
                    </div>
                  </div>
                </div>

                <div className="mt-auto flex gap-3">
                  <button 
                    onClick={() => testConnection(r.id)}
                    className="flex-1 btn-secondary flex items-center justify-center gap-2 text-sm"
                  >
                    <RefreshCcw className="w-4 h-4" />
                    Ping
                  </button>
                  <button 
                    onClick={() => router.push(`/routers/${r.id}`)}
                    className="flex-1 btn-primary flex items-center justify-center gap-2 text-sm group/btn"
                  >
                    Manage
                    <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Add Router Modal */}
        {showAddModal && (
          <div className="fixed inset-0 bg-dark-900/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
            <div className="glass-modal max-w-md w-full p-8">
              <div className="flex items-center gap-3 mb-8">
                <div className="bg-primary/20 p-2 rounded-lg">
                  <Plus className="w-6 h-6 text-primary" />
                </div>
                <h2 className="text-2xl font-bold text-white">Register Router</h2>
              </div>
              
              {error && (
                <div className="mb-6 p-4 bg-danger/10 border border-danger/20 text-danger text-sm rounded-xl font-medium">
                  {error}
                </div>
              )}

              <form onSubmit={handleAddRouter} className="space-y-5">
                <div className="space-y-2">
                  <label className="text-sm font-bold text-slate-400 uppercase tracking-wider ml-1">Friendly Name</label>
                  <input
                    required
                    className="w-full bg-dark-900/50 border border-white/10 rounded-xl py-3 px-4 focus:ring-2 focus:ring-primary focus:border-transparent outline-none transition-all text-white placeholder:text-slate-600"
                    placeholder="e.g. Core-Edge-01"
                    value={newRouter.name}
                    onChange={(e) => setNewRouter({...newRouter, name: e.target.value})}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-bold text-slate-400 uppercase tracking-wider ml-1">IP / Hostname</label>
                  <input
                    required
                    className="w-full bg-dark-900/50 border border-white/10 rounded-xl py-3 px-4 focus:ring-2 focus:ring-primary focus:border-transparent outline-none transition-all text-white placeholder:text-slate-600"
                    placeholder="10.0.0.1 or vyos.local"
                    value={newRouter.hostname}
                    onChange={(e) => setNewRouter({...newRouter, hostname: e.target.value})}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-bold text-slate-400 uppercase tracking-wider ml-1">Site / Region</label>
                  <input
                    className="w-full bg-dark-900/50 border border-white/10 rounded-xl py-3 px-4 focus:ring-2 focus:ring-primary focus:border-transparent outline-none transition-all text-white placeholder:text-slate-600"
                    placeholder="e.g. London-DC"
                    value={newRouter.site}
                    onChange={(e) => setNewRouter({...newRouter, site: e.target.value})}
                  />
                </div>
                <div className="space-y-2 pb-4">
                  <label className="text-sm font-bold text-slate-400 uppercase tracking-wider ml-1">API Key</label>
                  <input
                    required
                    type="password"
                    className="w-full bg-dark-900/50 border border-white/10 rounded-xl py-3 px-4 focus:ring-2 focus:ring-primary focus:border-transparent outline-none transition-all text-white placeholder:text-slate-600"
                    placeholder="••••••••••••"
                    value={newRouter.api_key}
                    onChange={(e) => setNewRouter({...newRouter, api_key: e.target.value})}
                  />
                </div>
                <div className="flex gap-4 pt-4">
                  <button
                    type="button"
                    onClick={() => setShowAddModal(false)}
                    className="flex-1 btn-secondary"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="flex-1 btn-primary"
                  >
                    {submitting ? 'Registering...' : 'Register Router'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
