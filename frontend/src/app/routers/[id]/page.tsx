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
  const [cardStats, setCardStats] = useState({ cpu: '...', mem: '...', rx: '...', tx: '...' });
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  const fetchData = async () => {
    try {
      console.log('Fetching data for router:', id);
      
      const [infoRes, latestRes, historyRes] = await Promise.all([
        api.get(`/routers/${id}`).catch(e => {
          console.error('Info API Error:', e);
          throw e;
        }),
        api.get(`/metrics/${id}/latest`).catch(e => {
          console.error('Latest Metrics API Error:', e);
          throw e;
        }),
        api.get(`/metrics/${id}/history?limit=30`).catch(e => {
          console.error('History Metrics API Error:', e);
          throw e;
        })
      ]);
      const latestData = latestRes.data;
      setRouterInfo(infoRes.data);
      setLatest(latestData);

      // Extract stats for cards
      let totalRx = 0;
      let totalTx = 0;
      if (latestData?.interfaces) {
        Object.values(latestData.interfaces).forEach((types: any) => {
          Object.values(types).forEach((iface: any) => {
            if (iface.stats) {
              totalRx += parseInt(iface.stats.rx_bytes) || 0;
              totalTx += parseInt(iface.stats.tx_bytes) || 0;
            }
          });
        });
      }
      setCardStats({
        cpu: latestData?.cpu_usage ? `${latestData.cpu_usage}%` : 'N/A',
        mem: latestData?.memory_usage ? `${latestData.memory_usage}%` : 'N/A',
        rx: formatBytes(totalRx),
        tx: formatBytes(totalTx)
      });
      
      if (Array.isArray(historyRes.data)) {
        setMetrics(historyRes.data.map((m: any) => {
          // Simple throughput calculation: sum of rx_bytes + tx_bytes across all interfaces
          let totalBytes = 0;
          if (m.interfaces) {
            Object.values(m.interfaces).forEach((types: any) => {
              Object.values(types).forEach((iface: any) => {
                if (iface.stats) {
                  totalBytes += (parseInt(iface.stats.rx_bytes) || 0) + (parseInt(iface.stats.tx_bytes) || 0);
                }
              });
            });
          }
          
          return {
            time: new Date(m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            throughput: Math.round(totalBytes / 1024 / 1024 * 8 * 100) / 100 // Convert to Mbps
          };
        }));
      }
    } catch (err) {
      console.error('Failed to fetch dashboard data', err);
    } finally {
      setLoading(false);
    }
  };

  const renderInterfaces = () => {
    if (!latest?.interfaces) return null;
    
    const rows: any[] = [];
    Object.entries(latest.interfaces).forEach(([type, ifaces]: [string, any]) => {
      Object.entries(ifaces).forEach(([name, data]: [string, any]) => {
        rows.push(
          <tr key={`${type}-${name}`} className="text-sm">
            <td className="py-4 font-medium">{name} <span className="text-gray-400 font-normal">({type})</span></td>
            <td className="py-4">
              <span className={`px-2 py-0.5 rounded text-xs ${
                data.state === 'up' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
              }`}>
                {(data.state || 'DOWN').toUpperCase()}
              </span>
            </td>
            <td className="py-4">{Array.isArray(data.address) ? data.address[0] : (data.address || 'N/A')}</td>
            <td className="py-4">{formatBytes(data.stats?.rx_bytes)}</td>
            <td className="py-4">{formatBytes(data.stats?.tx_bytes)}</td>
          </tr>
        );
      });
    });
    return rows;
  };

  const renderBGP = () => {
    if (!latest?.bgp_neighbors) return (
      <p className="text-sm text-gray-500 italic">No BGP neighbors configured or active.</p>
    );

    // VyOS BGP JSON structure varies, but usually has a 'neighbors' key or is the object itself
    const neighbors = latest.bgp_neighbors.neighbors || latest.bgp_neighbors;
    
    return Object.entries(neighbors).map(([peer, data]: [string, any]) => (
      <div key={peer} className="p-3 bg-gray-50 dark:bg-gray-900/50 rounded-lg border border-gray-100 dark:border-gray-700">
        <div className="flex justify-between items-center mb-1">
          <span className="font-medium text-sm">{peer}</span>
          <span className={`text-[10px] uppercase font-bold ${
            data.state === 'Established' ? 'text-emerald-600' : 'text-amber-600'
          }`}>{data.state}</span>
        </div>
        <div className="text-xs text-gray-500">AS {data.remote_as} • Up for {data.uptime || 'N/A'}</div>
      </div>
    ));
  };

  function formatBytes(bytes: any) {
    const b = parseInt(bytes);
    if (isNaN(b) || b === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(b) / Math.log(k));
    return parseFloat((b / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

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
          <StatCard icon={<Cpu className="text-blue-500" />} label="CPU Usage" value={cardStats.cpu} sub="System load" />
          <StatCard icon={<Activity className="text-emerald-500" />} label="Memory" value={cardStats.mem} sub="Usage %" />
          <StatCard icon={<ArrowDown className="text-blue-600" />} label="Total RX" value={cardStats.rx} sub="All interfaces" />
          <StatCard icon={<ArrowUp className="text-purple-600" />} label="Total TX" value={cardStats.tx} sub="All interfaces" />
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
                    {renderInterfaces()}
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
                {renderBGP()}
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
