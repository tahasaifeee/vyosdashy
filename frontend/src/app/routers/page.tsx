'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import api from '@/lib/api';
import { Plus, Router as RouterIcon, Signal, SignalLow, Trash2, RefreshCcw } from 'lucide-react';

interface Router {
  id: number;
  name: str;
  hostname: str;
  site: string;
  status: string;
  is_enabled: boolean;
  last_seen: string | null;
}

export default function RoutersPage() {
  const [routers, setRouters] = useState<Router[]>([]);
  const [loading, setLoading] = useState(true);
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
    try {
      await api.post('/routers/', newRouter);
      setShowAddModal(false);
      setNewRouter({ name: '', hostname: '', site: '', api_key: '' });
      fetchRouters();
    } catch (err) {
      console.error('Failed to add router', err);
    }
  };

  const testConnection = async (id: number) => {
    try {
      await api.post(`/routers/${id}/test-connection`);
      fetchRouters();
    } catch (err) {
      console.error('Test connection failed', err);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-8">
      <div className="max-w-6xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
              <RouterIcon className="w-8 h-8 text-blue-600" />
              Router Registry
            </h1>
            <p className="text-gray-600 dark:text-gray-400">Manage your VyOS instances</p>
          </div>
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg font-medium transition"
          >
            <Plus className="w-5 h-5" />
            Add Router
          </button>
        </div>

        {loading ? (
          <div className="flex justify-center py-20">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {routers.map((r) => (
              <div key={r.id} className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white">{r.name}</h3>
                    <p className="text-sm text-gray-500">{r.hostname}</p>
                  </div>
                  <div className={`flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${
                    r.status === 'online' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                  }`}>
                    {r.status === 'online' ? <Signal className="w-3 h-3" /> : <SignalLow className="w-3 h-3" />}
                    {r.status.toUpperCase()}
                  </div>
                </div>
                <div className="space-y-2 mb-6">
                  <div className="text-sm text-gray-600 dark:text-gray-400 flex justify-between">
                    <span>Site:</span>
                    <span className="font-medium">{r.site || 'N/A'}</span>
                  </div>
                  <div className="text-sm text-gray-600 dark:text-gray-400 flex justify-between">
                    <span>Last Seen:</span>
                    <span className="font-medium">{r.last_seen ? new Date(r.last_seen).toLocaleString() : 'Never'}</span>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button 
                    onClick={() => testConnection(r.id)}
                    className="flex-1 flex items-center justify-center gap-2 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 text-gray-700 dark:text-gray-200 py-2 rounded-lg text-sm font-medium transition"
                  >
                    <RefreshCcw className="w-4 h-4" />
                    Test
                  </button>
                  <button 
                    onClick={() => router.push(`/routers/${r.id}`)}
                    className="flex-1 flex items-center justify-center gap-2 bg-blue-50 dark:bg-blue-900/20 hover:bg-blue-100 text-blue-600 py-2 rounded-lg text-sm font-medium transition"
                  >
                    Dashboard
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Add Router Modal */}
        {showAddModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
            <div className="bg-white dark:bg-gray-800 rounded-2xl max-w-md w-full p-8 shadow-2xl">
              <h2 className="text-xl font-bold mb-6 text-gray-900 dark:text-white">Add New Router</h2>
              <form onSubmit={handleAddRouter} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Router Name</label>
                  <input
                    required
                    className="w-full rounded-lg border-gray-300 dark:border-gray-600 dark:bg-gray-700 py-2 px-3 focus:ring-2 focus:ring-blue-600 outline-none"
                    placeholder="Edge-01"
                    value={newRouter.name}
                    onChange={(e) => setNewRouter({...newRouter, name: e.target.value})}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Hostname / IP</label>
                  <input
                    required
                    className="w-full rounded-lg border-gray-300 dark:border-gray-600 dark:bg-gray-700 py-2 px-3 focus:ring-2 focus:ring-blue-600 outline-none"
                    placeholder="192.168.1.1"
                    value={newRouter.hostname}
                    onChange={(e) => setNewRouter({...newRouter, hostname: e.target.value})}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Site</label>
                  <input
                    className="w-full rounded-lg border-gray-300 dark:border-gray-600 dark:bg-gray-700 py-2 px-3 focus:ring-2 focus:ring-blue-600 outline-none"
                    placeholder="UAE-DC1"
                    value={newRouter.site}
                    onChange={(e) => setNewRouter({...newRouter, site: e.target.value})}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">API Key</label>
                  <input
                    required
                    type="password"
                    className="w-full rounded-lg border-gray-300 dark:border-gray-600 dark:bg-gray-700 py-2 px-3 focus:ring-2 focus:ring-blue-600 outline-none"
                    placeholder="Enter VyOS API Key"
                    value={newRouter.api_key}
                    onChange={(e) => setNewRouter({...newRouter, api_key: e.target.value})}
                  />
                </div>
                <div className="flex gap-3 mt-8">
                  <button
                    type="button"
                    onClick={() => setShowAddModal(false)}
                    className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 font-medium hover:bg-gray-50 transition"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-500 transition"
                  >
                    Save Router
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
