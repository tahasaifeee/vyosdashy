'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import api from '@/lib/api';
import { 
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area 
} from 'recharts';
import { 
  Activity, ArrowDown, ArrowUp, Cpu, HardDrive, Network, Server, ShieldCheck 
} from 'lucide-react';

export default function RouterDashboard() {
  const { id } = useParams();
  const [metrics, setMetrics] = useState<any[]>([]);
  const [latest, setLatest] = useState<any>(null);
  const [routerInfo, setRouterInfo] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  const fetchData = async () => {
    try {
      const [infoRes, latestRes, historyRes] = await Promise.all([
        api.get(`/routers/${id}`),
        api.get(`/metrics/${id}/latest`),
        api.get(`/metrics/${id}/history?limit=30`)

      ]);
      setRouterInfo(infoRes.data);
      setLatest(latestRes.data);
      setMetrics(historyRes.data.map((m: any) => ({
        time: new Date(m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        // Example: calculate total throughput if available in interfaces JSON
        throughput: 0 
      })));
    } catch (err) {
      console.error('Failed to fetch dashboard data', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, [id]);

  if (loading) return (
    <div className="flex justify-center items-center min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex justify-between items-end mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">{routerInfo?.name}</h1>
            <p className="text-gray-500 flex items-center gap-2">
              <Server className="w-4 h-4" /> {routerInfo?.hostname} • {routerInfo?.site}
            </p>
          </div>
          <div className="flex gap-2">
            <span className={`px-3 py-1 rounded-full text-sm font-medium ${
              routerInfo?.status === 'online' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
            }`}>
              {routerInfo?.status?.toUpperCase()}
            </span>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <StatCard icon={<Cpu className="text-blue-500" />} label="CPU Usage" value="12%" sub="System load" />
          <StatCard icon={<Activity className="text-emerald-500" />} label="Memory" value="2.4 GB" sub="of 4 GB" />
          <StatCard icon={<ArrowDown className="text-blue-600" />} label="Download" value="45.2 Mbps" sub="Current RX" />
          <StatCard icon={<ArrowUp className="text-purple-600" />} label="Upload" value="12.8 Mbps" sub="Current TX" />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Charts */}
          <div className="lg:col-span-2 space-y-8">
            <div className="bg-white dark:bg-gray-800 p-6 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700">
              <h3 className="text-lg font-semibold mb-6">Traffic History</h3>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={metrics}>
                    <defs>
                      <linearGradient id="colorTraffic" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.1}/>
                        <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis dataKey="time" axisLine={false} tickLine={false} tick={{fontSize: 12}} dy={10} />
                    <YAxis axisLine={false} tickLine={false} tick={{fontSize: 12}} />
                    <Tooltip 
                      contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)' }}
                    />
                    <Area type="monotone" dataKey="throughput" stroke="#3b82f6" fillOpacity={1} fill="url(#colorTraffic)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="bg-white dark:bg-gray-800 p-6 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700">
              <h3 className="text-lg font-semibold mb-4">Interfaces</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="text-sm text-gray-500 border-b border-gray-100 dark:border-gray-700">
                      <th className="pb-3 font-medium">Name</th>
                      <th className="pb-3 font-medium">Status</th>
                      <th className="pb-3 font-medium">IP Address</th>
                      <th className="pb-3 font-medium">RX</th>
                      <th className="pb-3 font-medium">TX</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50 dark:divide-gray-700">
                    {/* Map interfaces from 'latest' metrics here */}
                    <tr className="text-sm">
                      <td className="py-4 font-medium">eth0 (WAN)</td>
                      <td className="py-4"><span className="px-2 py-0.5 bg-green-100 text-green-700 rounded text-xs">UP</span></td>
                      <td className="py-4">1.2.3.4/24</td>
                      <td className="py-4">1.2 GB</td>
                      <td className="py-4">400 MB</td>
                    </tr>
                    <tr className="text-sm">
                      <td className="py-4 font-medium">eth1 (LAN)</td>
                      <td className="py-4"><span className="px-2 py-0.5 bg-green-100 text-green-700 rounded text-xs">UP</span></td>
                      <td className="py-4">192.168.1.1/24</td>
                      <td className="py-4">500 MB</td>
                      <td className="py-4">1.1 GB</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Sidebar */}
          <div className="space-y-8">
            <div className="bg-white dark:bg-gray-800 p-6 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700">
              <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-blue-600" /> BGP Neighbors
              </h3>
              <div className="space-y-4">
                <div className="p-3 bg-gray-50 dark:bg-gray-900/50 rounded-lg border border-gray-100 dark:border-gray-700">
                  <div className="flex justify-between items-center mb-1">
                    <span className="font-medium text-sm">10.0.0.1</span>
                    <span className="text-[10px] uppercase font-bold text-emerald-600">Established</span>
                  </div>
                  <div className="text-xs text-gray-500">AS 65001 • Up for 12h 4m</div>
                </div>
              </div>
            </div>

            <div className="bg-blue-600 rounded-2xl p-6 text-white shadow-lg shadow-blue-200 dark:shadow-none">
              <h4 className="font-bold mb-2">Operational Tasks</h4>
              <p className="text-blue-100 text-sm mb-4">Quickly run common commands or view logs.</p>
              <button className="w-full py-2 bg-white/10 hover:bg-white/20 rounded-lg text-sm font-medium transition mb-2">
                View Routes
              </button>
              <button className="w-full py-2 bg-white/10 hover:bg-white/20 rounded-lg text-sm font-medium transition">
                CLI Console
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({ icon, label, value, sub }: any) {
  return (
    <div className="bg-white dark:bg-gray-800 p-6 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700">
      <div className="flex items-center gap-4">
        <div className="p-3 bg-gray-50 dark:bg-gray-900 rounded-xl">
          {icon}
        </div>
        <div>
          <p className="text-sm text-gray-500 font-medium">{label}</p>
          <h4 className="text-2xl font-bold text-gray-900 dark:text-white">{value}</h4>
          <p className="text-xs text-gray-400 mt-0.5">{sub}</p>
        </div>
      </div>
    </div>
  );
}
