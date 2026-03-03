'use client';

import { useState, useEffect, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import api from '@/lib/api';
import { XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area, Legend } from 'recharts';
import {
  Activity, ArrowDown, ArrowUp, Cpu, Server, ShieldCheck,
  Network, Globe, Lock, Radio, GitBranch, HardDrive,
  CheckCircle2, XCircle, Route, Wifi, TerminalSquare, RefreshCw, ChevronLeft,
  Database, Zap, Clock, Maximize2, Layers, Monitor, HardDriveDownload, HardDriveUpload,
  List, Terminal, Search, ChevronDown, ChevronUp, Download, Settings2, Check,
  LayoutDashboard, FileText, ActivitySquare, Shield, Menu, X as CloseIcon,
  Play, Save, Globe2
} from 'lucide-react';
import Navbar from '@/components/Navbar';
import { DashboardSkeleton } from '@/components/Skeleton';
import { AnimatedNumber } from '@/components/AnimatedNumber';

// ─── VyOS data helpers ───────────────────────────────────────────────────────

function getIfaceRoot(interfaces: any) {
  return interfaces?.interface ?? interfaces;
}
function getIfaceRx(d: any) {
  const val = d?.['rx-bytes'] ?? d?.stats?.rx_bytes ?? 0;
  return typeof val === 'string' ? parseInt(val.replace(/,/g, '')) : parseInt(val);
}
function getIfaceTx(d: any) {
  const val = d?.['tx-bytes'] ?? d?.stats?.tx_bytes ?? 0;
  return typeof val === 'string' ? parseInt(val.replace(/,/g, '')) : parseInt(val);
}
function getIfaceRxPackets(d: any) {
  const val = d?.['rx-packets'] ?? d?.stats?.rx_packets ?? 0;
  return typeof val === 'string' ? parseInt(val.replace(/,/g, '')) : parseInt(val);
}
function getIfaceTxPackets(d: any) {
  const val = d?.['tx-packets'] ?? d?.stats?.tx_packets ?? 0;
  return typeof val === 'string' ? parseInt(val.replace(/,/g, '')) : parseInt(val);
}
function sumIfaceBytes(interfaces: any) {
  let rx = 0, tx = 0;
  if (!interfaces || typeof interfaces !== 'object') return { rx, tx };

  const root = getIfaceRoot(interfaces);
  // Iterate through categories (ethernet, loopback, etc.)
  Object.values(root).forEach((category: any) => {
    if (!category || typeof category !== 'object') return;
    // Iterate through individual interfaces (eth0, eth1, etc.)
    Object.values(category).forEach((iface: any) => {
      if (!iface || typeof iface !== 'object') return;
      rx += getIfaceRx(iface);
      tx += getIfaceTx(iface);
    });
  });

  // Fallback for flat structures
  if (rx === 0 && tx === 0) {
    Object.values(interfaces).forEach((iface: any) => {
      if (iface && typeof iface === 'object' && (iface['rx-bytes'] || iface['tx-bytes'])) {
        rx += getIfaceRx(iface);
        tx += getIfaceTx(iface);
      }
    });
  }

  return { rx, tx };
}

function extractBgpNeighbors(raw: any): Record<string, any> | null {
  if (!raw || typeof raw !== 'object') return null;
  if (raw.neighbor && typeof raw.neighbor === 'object') return raw.neighbor;
  if (raw.neighbors && typeof raw.neighbors === 'object') return raw.neighbors;
  if (raw.protocols?.bgp) {
    for (const afi of Object.values(raw.protocols.bgp) as any[])
      if (afi?.neighbor) return afi.neighbor;
  }
  return null;
}

function formatBytes(bytes: any) {
  const b = parseInt(bytes);
  if (isNaN(b) || b === 0) return '0 B';
  const k = 1024, sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(b) / Math.log(k));
  return parseFloat((b / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function formatUptime(seconds: number) {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

const COMMON_TIMEZONES = [
  "UTC", "Africa/Abidjan", "Africa/Accra", "Africa/Addis_Ababa", "Africa/Algiers", "Africa/Asmara", "Africa/Bamako", "Africa/Bangui",
  "America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles", "America/Toronto", "America/Vancouver", "America/Mexico_City",
  "Asia/Dubai", "Asia/Hong_Kong", "Asia/Jakarta", "Asia/Kolkata", "Asia/Seoul", "Asia/Singapore", "Asia/Tokyo", "Asia/Shanghai",
  "Europe/London", "Europe/Paris", "Europe/Berlin", "Europe/Rome", "Europe/Madrid", "Europe/Amsterdam", "Europe/Zurich", "Europe/Istanbul",
  "Australia/Sydney", "Australia/Melbourne", "Australia/Perth", "Pacific/Auckland"
];

// ─── Component ───────────────────────────────────────────────────────────────

export default function RouterDashboard() {
  const { id } = useParams();
  const router = useRouter();
  const [metrics, setMetrics] = useState<any[]>([]);
  const [latest, setLatest] = useState<any>(null);
  const [routerInfo, setRouterInfo] = useState<any>(null);
  const [routerConfig, setRouterConfig] = useState<any>(null);
  const [vyosInfo, setVyosInfo] = useState<any>(null);
  const [timeRange, setTimeRange] = useState('30');
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [selectedInterface, setSelectedInterface] = useState<any>(null);
  
  // Tab & UI State
  const [activeTab, setActiveTab] = useState('dashboard');
  const [routingTable, setRoutingTable] = useState<any[]>([]);
  const [logs, setLogs] = useState<string[]>([]);
  const [conntrack, setConntrack] = useState<string>('');
  const [loadingTab, setLoadingTab] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);

  // Ping Tool State
  const [pingTarget, setPingTarget] = useState('');
  const [pingOutput, setPingOutput] = useState('');
  const [pingLoading, setPingLoading] = useState(false);

  // Configuration State
  const [newTimezone, setNewTimezone] = useState('');
  const [configLoading, setConfigLoading] = useState(false);

  // Customization State
  const [showSettings, setShowSettings] = useState(false);
  const [widgets, setWidgets] = useState({
    traffic: true,
    interfaces: true,
    protocols: true,
    hardware: true,
    commands: true,
    dhcp: true
  });

  const fetchData = async () => {
    try {
      const [infoRes, latestRes, historyRes, configRes] = await Promise.all([
        api.get(`/routers/${id}`),
        api.get(`/metrics/${id}/latest`),
        api.get(`/metrics/${id}/history?limit=${timeRange}`),
        api.get(`/routers/${id}/config`),
      ]);
      
      setRouterInfo(infoRes.data);
      setLatest(latestRes.data);
      if (configRes.data) {
        setRouterConfig(configRes.data.config || {});
        setVyosInfo(configRes.data.info || {});
        if (configRes.data.config?.system?.['time-zone']) {
          setNewTimezone(configRes.data.config.system['time-zone']);
        }
      }
      setLastUpdated(new Date());

      if (Array.isArray(historyRes.data)) {
        const POLL = 30;
        const rawPoints = historyRes.data.map((m: any) => {
          const { rx, tx } = sumIfaceBytes(m.interfaces);
          return { timestamp: new Date(m.timestamp), rx, tx };
        }).sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

        const processed = [];
        for (let i = 1; i < rawPoints.length; i++) {
          const prev = rawPoints[i - 1];
          const curr = rawPoints[i];
          processed.push({
            time: curr.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            rx: Math.round(Math.max(0, curr.rx - prev.rx) / POLL / 1024 / 1024 * 8 * 100) / 100,
            tx: Math.round(Math.max(0, curr.tx - prev.tx) / POLL / 1024 / 1024 * 8 * 100) / 100,
          });
        }
        setMetrics(processed);
      }
    } catch (_) {
    } finally {
      setLoading(false);
    }
  };

  const fetchTabData = async () => {
    if (activeTab === 'dashboard' || activeTab === 'settings') return;
    setLoadingTab(true);
    try {
      if (activeTab === 'routes') {
        const res = await api.get(`/routers/${id}/routes`);
        setRoutingTable(res.data);
      } else if (activeTab === 'logs') {
        const res = await api.get(`/routers/${id}/logs`);
        setLogs(res.data);
      } else if (activeTab === 'conntrack') {
        const res = await api.get(`/routers/${id}/connections`);
        setConntrack(res.data.stats || '');
      }
    } catch (err) {}
    setLoadingTab(false);
  };

  useEffect(() => {
    fetchData();
    const iv = setInterval(fetchData, 30000);
    return () => clearInterval(iv);
  }, [id, timeRange]);

  useEffect(() => {
    fetchTabData();
  }, [activeTab]);

  const handlePing = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pingTarget) return;
    setPingLoading(true);
    setPingOutput('Pinging target from router...');
    try {
      const res = await api.post(`/routers/${id}/ping`, { host: pingTarget });
      setPingOutput(res.data.output);
    } catch (err: any) {
      setPingOutput(err.response?.data?.detail || 'Ping failed.');
    } finally {
      setPingLoading(false);
    }
  };

  const handleUpdateTimezone = async () => {
    if (!newTimezone) return;
    setConfigLoading(true);
    try {
      await api.post(`/routers/${id}/config/timezone`, { timezone: newTimezone });
      alert(`Timezone successfully updated to ${newTimezone}`);
      fetchData();
    } catch (err: any) {
      alert(err.response?.data?.detail || 'Failed to update timezone.');
    } finally {
      setConfigLoading(false);
    }
  };

  const configStatus = useMemo(() => {
    if (!routerConfig) return null;
    const bgpCfg = routerConfig.protocols?.bgp;
    const fwCfg = routerConfig.firewall;
    const dhcpCfg = routerConfig.service?.['dhcp-server'];
    const wgCfg = routerConfig.interfaces?.wireguard;
    const ospfCfg = routerConfig.protocols?.ospf;
    return {
      bgp: !!bgpCfg,
      bgpPeers: Object.keys(bgpCfg?.neighbor || {}).length,
      bgpAs: bgpCfg?.['local-as'] ?? bgpCfg?.['system-as'] ?? bgpCfg?.parameters?.['local-as'],
      ospf: !!ospfCfg,
      ospfNeighbors: Object.keys(ospfCfg?.area || {}).length, // simplified
      firewall: !!(fwCfg?.ipv4 || fwCfg?.ipv6 || fwCfg?.name),
      fwPolicies: Object.keys(fwCfg?.ipv4?.name || fwCfg?.name || {}).length,
      wireguard: !!wgCfg,
      wgPeers: Object.values(wgCfg || {}).reduce((n: number, w: any) => n + Object.keys(w?.peer || {}).length, 0) as number,
    };
  }, [routerConfig]);

  const interfacesList = useMemo(() => {
    if (!latest?.interfaces) return [];
    const root = getIfaceRoot(latest.interfaces);
    const list: any[] = [];
    Object.entries(root).forEach(([type, ifaces]: [string, any]) => {
      if (typeof ifaces !== 'object') return;
      Object.entries(ifaces).forEach(([name, data]: [string, any]) => {
        list.push({ name, type, ...data });
      });
    });
    return list;
  }, [latest]);

  const ifaceStats = useMemo(() => {
    const up = interfacesList.filter(i => (i.state || i['oper-state']) === 'up').length;
    return { up, total: interfacesList.length };
  }, [interfacesList]);

  const dhcpPools = useMemo(() => {
    const pools: any[] = [];
    const nets = routerConfig?.service?.['dhcp-server']?.['shared-network-name'] || {};
    Object.entries(nets).forEach(([name, net]: any) => {
      Object.entries(net?.subnet || {}).forEach(([subnet, sub]: any) => {
        const range = Object.values((sub as any)?.range || {})[0] as any;
        pools.push({ name, subnet, start: range?.start, stop: range?.stop, router: (sub as any)?.['default-router'] });
      });
    });
    return pools;
  }, [routerConfig]);

  const handleExportCSV = () => {
    if (metrics.length === 0) return;
    const headers = ['Time', 'RX (Mbps)', 'TX (Mbps)'];
    const csvContent = [
      headers.join(','),
      ...metrics.map(m => `${m.time},${m.rx},${m.tx}`)
    ].join('\n');
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `${routerInfo?.name || 'router'}_traffic.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const toggleWidget = (widget: keyof typeof widgets) => {
    setWidgets(prev => ({ ...prev, [widget]: !prev[widget] }));
  };

  if (loading) return (
    <div className="min-h-screen pt-24 pb-12 px-6 lg:px-12 bg-background transition-colors duration-300">
      <Navbar />
      <DashboardSkeleton />
    </div>
  );

  return (
    <div className="min-h-screen bg-background transition-colors duration-300 flex flex-col">
      <Navbar />
      
      <div className="flex flex-1 pt-16">
        {/* ── SonicWall-style Left Sidebar ── */}
        <aside className={`fixed lg:static inset-y-0 left-0 z-30 w-64 bg-white dark:bg-dark-900 border-r border-slate-200 dark:border-white/5 transition-transform duration-300 transform ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'} lg:translate-x-0 overflow-y-auto custom-scrollbar`}>
          <div className="p-6">
            <div className="flex items-center justify-between lg:hidden mb-6">
              <span className="font-black text-primary uppercase tracking-widest text-xs">Menu</span>
              <button onClick={() => setIsSidebarOpen(false)}><CloseIcon className="w-5 h-5 text-slate-500" /></button>
            </div>

            <div className="space-y-8">
              {/* Category: Monitor */}
              <div>
                <SidebarCategory label="Monitor" />
                <div className="mt-2 space-y-1">
                  <SidebarItem 
                    active={activeTab === 'dashboard'} 
                    onClick={() => setActiveTab('dashboard')} 
                    icon={<LayoutDashboard className="w-4 h-4" />} 
                    label="Dashboard" 
                  />
                  <SidebarItem 
                    active={activeTab === 'conntrack'} 
                    onClick={() => setActiveTab('conntrack')} 
                    icon={<ActivitySquare className="w-4 h-4" />} 
                    label="Live Connections" 
                  />
                </div>
              </div>

              {/* Category: Network */}
              <div>
                <SidebarCategory label="Network" />
                <div className="mt-2 space-y-1">
                  <SidebarItem 
                    active={activeTab === 'routes'} 
                    onClick={() => setActiveTab('routes')} 
                    icon={<Route className="w-4 h-4" />} 
                    label="Routing Table" 
                  />
                  <SidebarItem 
                    active={activeTab === 'interfaces'} 
                    onClick={() => setActiveTab('interfaces')} 
                    icon={<Network className="w-4 h-4" />} 
                    label="Interfaces" 
                  />
                  <SidebarItem 
                    active={activeTab === 'bgp'} 
                    onClick={() => setActiveTab('bgp')} 
                    icon={<GitBranch className="w-4 h-4" />} 
                    label="BGP Peers" 
                  />
                </div>
              </div>

              {/* Category: System */}
              <div>
                <SidebarCategory label="System" />
                <div className="mt-2 space-y-1">
                  <SidebarItem 
                    active={activeTab === 'logs'} 
                    onClick={() => setActiveTab('logs')} 
                    icon={<FileText className="w-4 h-4" />} 
                    label="System Logs" 
                  />
                  <SidebarItem 
                    active={activeTab === 'settings'} 
                    onClick={() => setActiveTab('settings')} 
                    icon={<Settings2 className="w-4 h-4" />} 
                    label="General Settings" 
                  />
                </div>
              </div>

              {/* Category: Diagnostics */}
              <div>
                <SidebarCategory label="Diagnostics" />
                <div className="mt-2 space-y-1">
                  <SidebarItem 
                    active={activeTab === 'ping'} 
                    onClick={() => setActiveTab('ping')} 
                    icon={<Wifi className="w-4 h-4" />} 
                    label="Ping Tool" 
                  />
                  <SidebarItem 
                    active={false} 
                    onClick={() => {}} 
                    icon={<Terminal className="w-4 h-4" />} 
                    label="Traceroute" 
                  />
                </div>
              </div>
            </div>

            {/* Hardware Context in Sidebar */}
            <div className="mt-12 pt-8 border-t border-slate-200 dark:border-white/5">
              <h4 className="text-[10px] font-black text-slate-400 dark:text-slate-600 uppercase tracking-[0.2em] mb-4">Router Info</h4>
              <div className="space-y-3">
                <div className="flex flex-col">
                  <span className="text-[10px] font-bold text-slate-500">Hostname</span>
                  <span className="text-xs font-black text-slate-900 dark:text-slate-300 truncate">{vyosInfo?.hostname || routerInfo?.hostname}</span>
                </div>
                <div className="flex flex-col">
                  <span className="text-[10px] font-bold text-slate-500">OS Version</span>
                  <span className="text-xs font-black text-primary truncate">{routerInfo?.version || vyosInfo?.version || 'N/A'}</span>
                </div>
              </div>
            </div>
          </div>
        </aside>

        {/* ── Main Content Area ── */}
        <main className="flex-1 overflow-y-auto p-6 lg:p-10 transition-all duration-300">
          <div className="max-w-7xl mx-auto space-y-8">
            
            {/* Header with Breadcrumbs & Actions */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6">
              <div className="space-y-4">
                <div className="flex items-center gap-2 text-slate-500 text-[10px] font-black uppercase tracking-widest">
                  <button onClick={() => router.push('/routers')} className="hover:text-primary transition-colors">Registry</button>
                  <ChevronLeft className="w-3 h-3 rotate-180" />
                  <span className="text-primary">{routerInfo?.name}</span>
                  <ChevronLeft className="w-3 h-3 rotate-180" />
                  <span className="text-slate-900 dark:text-slate-200 capitalize">{activeTab}</span>
                </div>
                
                <div className="flex items-center gap-6">
                  <div className="lg:hidden">
                    <button onClick={() => setIsSidebarOpen(true)} className="p-2 bg-white dark:bg-white/5 rounded-xl border border-slate-200 dark:border-white/10 shadow-sm"><Menu className="w-5 h-5" /></button>
                  </div>
                  <h1 className="text-4xl md:text-5xl font-black text-slate-900 dark:text-white tracking-tighter transition-colors">{routerInfo?.name}</h1>
                  <div className={`hidden md:flex status-badge ${routerInfo?.status === 'online' ? 'bg-success/10 text-success border-success/20' : 'bg-danger/10 text-danger border-danger/20'}`}>
                    <div className={`w-1.5 h-1.5 rounded-full ${routerInfo?.status === 'online' ? 'bg-success animate-pulse' : 'bg-danger'}`} />
                    {routerInfo?.status}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-4 bg-white/80 dark:bg-dark-800/80 backdrop-blur-md p-3 rounded-2xl border border-slate-200 dark:border-white/5 shadow-xl dark:shadow-2xl transition-colors">
                <div className="flex flex-col items-end px-4 border-r border-slate-200 dark:border-white/5">
                  <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Uptime</span>
                  <span className="text-sm font-black text-slate-900 dark:text-white">{formatUptime(latest?.uptime || 0)}</span>
                </div>
                <div className="flex flex-col items-end px-4">
                  <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Active API</span>
                  <span className="text-sm font-black text-primary">Connected</span>
                </div>
                <button onClick={fetchData} className="p-3 bg-primary/10 text-primary hover:bg-primary/20 rounded-xl transition-all active:scale-95 group">
                  <RefreshCw className="w-4 h-4 group-active:rotate-180 transition-transform duration-500" />
                </button>
              </div>
            </div>

            {activeTab === 'dashboard' ? (
              <div className="animate-in fade-in duration-500">
                {/* ── Summary Bar ── */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
                  <SummaryCard 
                    label="Compute Load" 
                    value={<AnimatedNumber value={latest?.cpu_usage || 0} format={v => `${v}%`} />} 
                    subValue={`Load: ${latest?.load_average?.['1m'] || 0}`}
                    icon={<Cpu className="w-5 h-5" />}
                    progress={latest?.cpu_usage || 0}
                    color="primary"
                  />
                  <SummaryCard 
                    label="Memory Usage" 
                    value={<AnimatedNumber value={latest?.memory_usage || 0} format={v => `${v}%`} />} 
                    subValue="System RAM"
                    icon={<Activity className="w-5 h-5" />}
                    progress={latest?.memory_usage || 0}
                    color="success"
                  />
                  <SummaryCard 
                    label="Disk Storage" 
                    value={<AnimatedNumber value={latest?.disk_usage || 0} format={v => `${v}%`} />} 
                    subValue="Root Partition"
                    icon={<HardDrive className="w-5 h-5" />}
                    progress={latest?.disk_usage || 0}
                    color="info"
                  />
                  <SummaryCard 
                    label="Network Stack" 
                    value={<AnimatedNumber value={configStatus?.bgpPeers || 0} />} 
                    subValue="BGP Peers"
                    icon={<GitBranch className="w-5 h-5" />}
                    progress={configStatus?.bgpPeers ? 100 : 0}
                    color="warning"
                  />
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                  <div className="lg:col-span-2 space-y-8">
                    {/* Protocols Panel - Moved & Adjusted */}
                    <DashboardCard title="Protocol Control Center">
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6">
                        <ProtocolRow label="BGP Routing" active={configStatus?.bgp} detail={`${configStatus?.bgpPeers} Active`} />
                        <ProtocolRow label="OSPF OSPFv2" active={configStatus?.ospf} detail={`${configStatus?.ospfNeighbors} Neighbors`} />
                        <ProtocolRow label="IPv4 Firewall" active={configStatus?.firewall} detail={`${configStatus?.fwPolicies} Polices`} />
                        <ProtocolRow label="WireGuard" active={configStatus?.wireguard} detail={`${configStatus?.wgPeers} Peers`} />
                      </div>
                    </DashboardCard>

                    {/* Traffic Chart */}
                    <DashboardCard 
                      title="Throughput Monitor (Mbps)" 
                      headerAction={
                        <div className="flex items-center gap-2">
                          <button onClick={handleExportCSV} className="p-2 text-slate-400 hover:text-primary transition-colors"><Download className="w-4 h-4" /></button>
                          <div className="flex bg-slate-100 dark:bg-white/5 p-1 rounded-lg">
                            {['30', '60', '100'].map(r => (
                              <button key={r} onClick={() => setTimeRange(r)} className={`px-2 py-1 text-[9px] font-bold rounded-md transition-colors ${timeRange === r ? 'bg-primary text-white' : 'text-slate-500 hover:text-slate-900 dark:hover:text-slate-300'}`}>{r}pts</button>
                            ))}
                          </div>
                        </div>
                      }
                    >
                      <div className="h-64 sm:h-80 mt-6">
                        <ResponsiveContainer width="100%" height="100%">
                          <AreaChart data={metrics}>
                            <defs>
                              <linearGradient id="colorRx" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#0ea5e9" stopOpacity={0.3}/><stop offset="95%" stopColor="#0ea5e9" stopOpacity={0}/></linearGradient>
                              <linearGradient id="colorTx" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#6366f1" stopOpacity={0.3}/><stop offset="95%" stopColor="#6366f1" stopOpacity={0}/></linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(0,0,0,0.05)" className="dark:stroke-white/5" />
                            <XAxis dataKey="time" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#64748b' }} dy={10} />
                            <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#64748b' }} />
                            <Tooltip contentStyle={{ backgroundColor: 'var(--background)', borderRadius: '16px', border: '1px solid rgba(0,0,0,0.1)' }} />
                            <Area name="Ingress (RX)" type="monotone" dataKey="rx" stroke="#0ea5e9" strokeWidth={3} fillOpacity={1} fill="url(#colorRx)" animationDuration={1500} />
                            <Area name="Egress (TX)" type="monotone" dataKey="tx" stroke="#6366f1" strokeWidth={3} fillOpacity={1} fill="url(#colorTx)" animationDuration={1500} />
                          </AreaChart>
                        </ResponsiveContainer>
                      </div>
                    </DashboardCard>

                    {/* Interface Grid */}
                    <DashboardCard title="Interface Status Matrix">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
                        {interfacesList.map((iface) => {
                          const state = iface.state || iface['oper-state'];
                          return (
                            <div key={iface.name} onClick={() => setSelectedInterface(iface)} className="glass-card p-4 flex items-center justify-between group cursor-pointer hover:border-primary/50">
                              <div className="flex items-center gap-4">
                                <div className={`p-2.5 rounded-xl ${state === 'up' ? 'bg-success/10 text-success' : 'bg-slate-200 dark:bg-slate-800 text-slate-500'}`}><Network className="w-5 h-5" /></div>
                                <div>
                                  <div className="font-black text-slate-900 dark:text-white group-hover:text-primary transition-colors">{iface.name}</div>
                                  <div className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">{iface.type}</div>
                                </div>
                              </div>
                              <div className={`w-2 h-2 rounded-full ${state === 'up' ? 'bg-success shadow-glow animate-pulse' : 'bg-slate-300 dark:bg-slate-700'}`} />
                            </div>
                          );
                        })}
                      </div>
                    </DashboardCard>
                  </div>

                  <div className="space-y-8">
                    {/* Quick Actions */}
                    <div className="bg-primary/5 dark:bg-primary/10 border border-primary/20 rounded-3xl p-6 relative overflow-hidden group">
                      <div className="absolute -right-4 -top-4 bg-primary/20 w-24 h-24 rounded-full blur-2xl group-hover:scale-150 transition-transform duration-700" />
                      <h4 className="font-black text-slate-900 dark:text-white text-lg tracking-tighter mb-4 flex items-center gap-2"><TerminalSquare className="w-5 h-5 text-primary" /> Rapid Control</h4>
                      <div className="grid grid-cols-2 gap-3">
                        <ActionButton icon={<Route className="w-4 h-4" />} label="RIB" onClick={() => setActiveTab('routes')} />
                        <ActionButton icon={<Monitor className="w-4 h-4" />} label="Logs" onClick={() => setActiveTab('logs')} />
                        <ActionButton icon={<ShieldCheck className="w-4 h-4" />} label="FW" />
                        <ActionButton icon={<Maximize2 className="w-4 h-4" />} label="SSH" />
                      </div>
                    </div>

                    {/* DHCP Pools */}
                    {dhcpPools.length > 0 && (
                      <DashboardCard title="DHCP Address Pools" isCollapsible>
                        <div className="space-y-4 mt-6">
                          {dhcpPools.map((p, i) => (
                            <div key={i} className="bg-slate-100 dark:bg-white/5 p-3 rounded-xl border border-slate-200 dark:border-white/5 group hover:border-primary/30 transition-colors">
                              <div className="flex items-center justify-between mb-1">
                                <span className="font-bold text-slate-900 dark:text-slate-200 text-sm group-hover:text-primary transition-colors">{p.name}</span>
                                <div className="text-info text-[8px] font-black uppercase tracking-tighter">SUBNET</div>
                              </div>
                              <div className="font-mono text-xs text-slate-500">{p.subnet}</div>
                            </div>
                          ))}
                        </div>
                      </DashboardCard>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <DashboardCard title={activeTab.toUpperCase()}>
                {loadingTab ? (
                  <div className="flex flex-col items-center justify-center py-32 opacity-50">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mb-4"></div>
                    <p className="text-slate-500 dark:text-slate-400 text-xs font-bold uppercase tracking-widest">Querying Dataplane...</p>
                  </div>
                ) : (
                  <div className="mt-6 animate-in fade-in duration-500">
                    {activeTab === 'bgp' && (
                      <div className="overflow-x-auto">
                        <table className="w-full text-left">
                          <thead>
                            <tr className="text-[10px] text-slate-500 uppercase font-black tracking-widest border-b border-slate-200 dark:border-white/5">
                              <th className="pb-4">Neighbor</th>
                              <th className="pb-4">Remote AS</th>
                              <th className="pb-4">State</th>
                              <th className="pb-4">Uptime</th>
                              <th className="pb-4">Prefixes</th>
                            </tr>
                          </thead>
                          <tbody>
                            {(() => {
                              const neighbors = extractBgpNeighbors(routerConfig);
                              if (!neighbors) return <tr><td colSpan={5} className="py-10 text-center text-slate-500 font-bold uppercase tracking-widest text-xs">No BGP neighbors configured</td></tr>;
                              return Object.entries(neighbors).map(([peer, data]: any, i) => (
                                <tr key={i} className="border-b border-slate-100 dark:border-white/5 last:border-0 text-sm font-medium hover:bg-slate-50 dark:hover:bg-white/5 transition-colors">
                                  <td className="py-4 font-mono text-primary font-black">{peer}</td>
                                  <td className="py-4 font-bold text-slate-900 dark:text-slate-200">{data?.['remote-as'] || '—'}</td>
                                  <td className="py-4">
                                    <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-primary/10 text-primary text-[10px] font-black uppercase">
                                      Configured
                                    </div>
                                  </td>
                                  <td className="py-4 text-slate-500">N/A</td>
                                  <td className="py-4 font-bold text-slate-900 dark:text-slate-200">—</td>
                                </tr>
                              ));
                            })()}
                          </tbody>
                        </table>
                      </div>
                    )}
                    {activeTab === 'interfaces' && (
                      <div className="overflow-x-auto">
                        <table className="w-full text-left">
                          <thead>
                            <tr className="text-[10px] text-slate-500 uppercase font-black tracking-widest border-b border-slate-200 dark:border-white/5">
                              <th className="pb-4">Name</th>
                              <th className="pb-4">Type</th>
                              <th className="pb-4">State</th>
                              <th className="pb-4">IP Address</th>
                              <th className="pb-4">RX Packets</th>
                              <th className="pb-4">TX Packets</th>
                            </tr>
                          </thead>
                          <tbody>
                            {interfacesList.map((iface, i) => {
                              const state = iface.state || iface['oper-state'];
                              return (
                                <tr key={i} onClick={() => setSelectedInterface(iface)} className="border-b border-slate-100 dark:border-white/5 last:border-0 text-sm font-medium hover:bg-slate-50 dark:hover:bg-white/5 transition-colors cursor-pointer group">
                                  <td className="py-4 font-black text-slate-900 dark:text-slate-200 group-hover:text-primary transition-colors">{iface.name}</td>
                                  <td className="py-4 uppercase text-[10px] text-slate-500">{iface.type}</td>
                                  <td className="py-4">
                                    <div className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${state === 'up' ? 'bg-success/10 text-success' : 'bg-danger/10 text-danger'}`}>
                                      <div className={`w-1 h-1 rounded-full ${state === 'up' ? 'bg-success animate-pulse' : 'bg-danger'}`} />
                                      {state}
                                    </div>
                                  </td>
                                  <td className="py-4 font-mono text-xs text-slate-500">{Array.isArray(iface.address) ? iface.address[0] : (iface.address || '—')}</td>
                                  <td className="py-4 text-xs font-bold text-info"><AnimatedNumber value={getIfaceRxPackets(iface)} /></td>
                                  <td className="py-4 text-xs font-bold text-primary"><AnimatedNumber value={getIfaceTxPackets(iface)} /></td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                    {activeTab === 'routes' && (
                      <div className="overflow-x-auto">
                        <table className="w-full text-left">
                          <thead>
                            <tr className="text-[10px] text-slate-500 uppercase font-black tracking-widest border-b border-slate-200 dark:border-white/5">
                              <th className="pb-4">Proto</th>
                              <th className="pb-4">Prefix</th>
                              <th className="pb-4">Next Hop</th>
                              <th className="pb-4">Interface</th>
                              <th className="pb-4">Sel</th>
                            </tr>
                          </thead>
                          <tbody>
                            {routingTable.map((route, i) => (
                              <tr key={i} className="border-b border-slate-100 dark:border-white/5 last:border-0 text-sm font-medium hover:bg-slate-50 dark:hover:bg-white/5 transition-colors">
                                <td className="py-3 uppercase text-primary text-[10px] font-black">{route.protocol}</td>
                                <td className="py-3 font-mono text-slate-900 dark:text-slate-200">{route.prefix}</td>
                                <td className="py-3 font-mono text-slate-500 dark:text-slate-400">{route.next_hop?.next_hop || 'Direct'}</td>
                                <td className="py-3 text-slate-500 dark:text-slate-400">{route.next_hop?.interface || '—'}</td>
                                <td className="py-3">{route.selected ? <CheckCircle2 className="w-3.5 h-3.5 text-success" /> : <XCircle className="w-3.5 h-3.5 text-slate-300 dark:text-slate-700" />}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                    {activeTab === 'logs' && (
                      <div className="bg-slate-100 dark:bg-dark-900/50 p-6 rounded-2xl border border-slate-200 dark:border-white/5 font-mono text-xs text-slate-700 dark:text-slate-300 space-y-1 overflow-y-auto max-h-[600px] leading-relaxed custom-scrollbar shadow-inner">
                        {logs.map((log, i) => (
                          <div key={i} className="flex gap-4 hover:bg-white dark:hover:bg-white/5 px-2 py-0.5 rounded transition-colors">
                            <span className="text-slate-400 dark:text-slate-600 select-none">[{i+1}]</span>
                            <span>{log}</span>
                          </div>
                        ))}
                      </div>
                    )}
                    {activeTab === 'conntrack' && (
                      <pre className="bg-slate-100 dark:bg-dark-900/50 p-6 rounded-2xl border border-slate-200 dark:border-white/5 font-mono text-xs text-slate-700 dark:text-slate-300 overflow-x-auto whitespace-pre-wrap shadow-inner p-6">
                        {conntrack || 'No connection statistics available.'}
                      </pre>
                    )}
                    {activeTab === 'ping' && (
                      <div className="space-y-6">
                        <form onSubmit={handlePing} className="flex flex-col sm:flex-row gap-4">
                          <div className="flex-1 relative">
                            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                            <input 
                              required
                              className="w-full bg-slate-100 dark:bg-dark-900/50 border border-slate-200 dark:border-white/5 rounded-xl py-3 pl-12 pr-4 outline-none focus:ring-2 focus:ring-primary transition-all text-sm"
                              placeholder="Target IP or Hostname (e.g. 8.8.8.8)"
                              value={pingTarget}
                              onChange={(e) => setPingTarget(e.target.value)}
                            />
                          </div>
                          <button 
                            type="submit" 
                            disabled={pingLoading}
                            className="btn-primary px-8 flex items-center justify-center gap-2"
                          >
                            {pingLoading ? <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" /> : <Play className="w-4 h-4" />}
                            Execute Ping
                          </button>
                        </form>
                        <div className="bg-slate-100 dark:bg-dark-900/50 p-6 rounded-2xl border border-slate-200 dark:border-white/5 font-mono text-xs text-slate-700 dark:text-slate-300 min-h-[200px] whitespace-pre-wrap shadow-inner">
                          {pingOutput || 'Enter a target and click "Execute Ping" to start connectivity test from the router.'}
                        </div>
                      </div>
                    )}
                    {activeTab === 'settings' && (
                      <div className="max-w-2xl space-y-8 animate-in fade-in duration-500">
                        {/* Timezone Config */}
                        <div className="bg-white dark:bg-white/5 p-8 rounded-3xl border border-slate-200 dark:border-white/10 shadow-sm">
                          <div className="flex items-center gap-4 mb-8">
                            <div className="bg-primary/20 p-3 rounded-2xl">
                              <Globe2 className="w-6 h-6 text-primary" />
                            </div>
                            <div>
                              <h4 className="text-xl font-black text-slate-900 dark:text-white tracking-tight">System Timezone</h4>
                              <p className="text-xs font-medium text-slate-500">Configure the local time for system logs and scheduling.</p>
                            </div>
                          </div>

                          <div className="space-y-6">
                            <div className="space-y-2">
                              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Select Region</label>
                              <select 
                                className="w-full bg-slate-100 dark:bg-dark-900/50 border border-slate-200 dark:border-white/5 rounded-xl py-3.5 px-4 outline-none focus:ring-2 focus:ring-primary transition-all text-sm font-bold text-slate-700 dark:text-slate-200 appearance-none"
                                value={newTimezone}
                                onChange={(e) => setNewTimezone(e.target.value)}
                              >
                                <option value="" disabled>Choose a timezone...</option>
                                {COMMON_TIMEZONES.map(tz => (
                                  <option key={tz} value={tz}>{tz}</option>
                                ))}
                              </select>
                            </div>

                            <button 
                              onClick={handleUpdateTimezone}
                              disabled={configLoading || !newTimezone}
                              className="w-full btn-primary py-4 flex items-center justify-center gap-3 font-black uppercase tracking-widest text-sm"
                            >
                              {configLoading ? <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" /> : <Save className="w-4 h-4" />}
                              Commit & Save Changes
                            </button>
                          </div>
                        </div>

                        {/* Additional system settings can be added here */}
                      </div>
                    )}
                  </div>
                )}
              </DashboardCard>
            )}
          </div>
        </main>
      </div>

      {/* ── Interface Detail Modal ── */}
      {selectedInterface && (
        <div className="fixed inset-0 bg-slate-900/40 dark:bg-dark-900/90 backdrop-blur-md flex items-center justify-center p-6 z-50 animate-in fade-in">
          <div className="glass-modal max-w-2xl w-full p-10 relative overflow-hidden animate-in zoom-in-95 duration-300">
            <div className="absolute -right-10 -top-10 bg-primary/10 w-40 h-40 rounded-full blur-3xl" />
            <div className="flex justify-between items-start mb-10">
              <div className="flex items-center gap-5">
                <div className="bg-primary/20 p-4 rounded-2xl"><Network className="w-8 h-8 text-primary shadow-glow" /></div>
                <div>
                  <h2 className="text-2xl md:text-3xl font-black text-slate-900 dark:text-white tracking-tight">{selectedInterface.name}</h2>
                  <p className="text-slate-500 font-bold uppercase tracking-widest text-[10px] md:text-xs mt-1">{selectedInterface.type} Physical Interface</p>
                </div>
              </div>
              <button onClick={() => setSelectedInterface(null)} className="p-2 hover:bg-slate-200 dark:hover:bg-white/5 rounded-xl transition-colors text-slate-500 hover:text-slate-900 dark:hover:white"><XCircle className="w-6 h-6" /></button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-10">
              <div className="space-y-4">
                <DetailRow label="IP Address" value={Array.isArray(selectedInterface.address) ? selectedInterface.address[0] : (selectedInterface.address || 'N/A')} mono />
                <DetailRow label="Hardware ID" value={selectedInterface['hw-id'] || '—'} mono />
                <DetailRow label="MTU" value={selectedInterface.mtu || '1500'} />
                <DetailRow label="State" value={selectedInterface.state || selectedInterface['oper-state']} highlight />
              </div>
              <div className="space-y-4">
                <div className="bg-slate-100 dark:bg-white/5 p-4 rounded-2xl border border-slate-200 dark:border-white/5">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] font-black text-slate-500 uppercase">Packet Analysis</span>
                    <Layers className="w-3.5 h-3.5 text-primary" />
                  </div>
                  <div className="space-y-2">
                    <div className="flex justify-between text-xs">
                      <span className="text-slate-500 dark:text-slate-400 font-medium">RX Packets</span>
                      <span className="text-info font-black"><AnimatedNumber value={getIfaceRxPackets(selectedInterface)} /></span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-slate-500 dark:text-slate-400 font-medium">TX Packets</span>
                      <span className="text-primary font-black"><AnimatedNumber value={getIfaceTxPackets(selectedInterface)} /></span>
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-info/10 p-4 rounded-2xl border border-info/20 text-center">
                    <div className="text-xs font-black text-slate-900 dark:text-white">{formatBytes(getIfaceRx(selectedInterface))}</div>
                    <div className="text-[8px] font-bold text-slate-500 uppercase mt-1">Total Ingress</div>
                  </div>
                  <div className="bg-primary/10 p-4 rounded-2xl border border-primary/20 text-center">
                    <div className="text-xs font-black text-slate-900 dark:text-white">{formatBytes(getIfaceTx(selectedInterface))}</div>
                    <div className="text-[8px] font-bold text-slate-500 uppercase mt-1">Total Egress</div>
                  </div>
                </div>
              </div>
            </div>
            <button onClick={() => setSelectedInterface(null)} className="w-full btn-primary py-4 text-sm font-black uppercase tracking-widest hover:shadow-lg transition-all active:scale-95">Close Viewport</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SidebarCategory({ label }: { label: string }) {
  return (
    <h4 className="px-4 text-[10px] font-black text-slate-400 dark:text-slate-600 uppercase tracking-[0.2em] mb-2">{label}</h4>
  );
}

function SidebarItem({ active, onClick, icon, label }: any) {
  return (
    <button 
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-bold transition-all duration-200 group ${
        active 
          ? 'bg-primary/10 text-primary border border-primary/20 shadow-sm' 
          : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/5 hover:text-slate-900 dark:hover:text-slate-200'
      }`}
    >
      <div className={`${active ? 'text-primary' : 'text-slate-400 dark:text-slate-600 group-hover:text-primary'} transition-colors`}>{icon}</div>
      <span>{label}</span>
      {active && <div className="ml-auto w-1.5 h-1.5 rounded-full bg-primary shadow-glow" />}
    </button>
  );
}

function SidebarSummaryCard({ label, value, subValue, icon, color }: any) {
  return (
    <div className="glass-card p-6 relative overflow-hidden group hover:-translate-y-1 transition-transform duration-300">
      <div className="flex justify-between items-start">
        <div className="space-y-1">
          <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{label}</p>
          <h4 className="text-2xl md:text-3xl font-black text-slate-900 dark:text-white tracking-tighter transition-colors">{value}</h4>
          <p className="text-[10px] font-bold text-slate-400">{subValue}</p>
        </div>
        <div className={`p-3 rounded-2xl transition-transform group-hover:scale-110 text-warning bg-warning/20`}>
          {icon}
        </div>
      </div>
    </div>
  );
}

function SummaryCard({ label, value, subValue, icon, progress, color }: any) {
  const colors: any = {
    primary: 'text-primary bg-primary/20',
    success: 'text-success bg-success/20',
    info: 'text-info bg-info/20',
    warning: 'text-warning bg-warning/20',
  };

  return (
    <div className="glass-card p-6 relative overflow-hidden group hover:-translate-y-1 transition-transform duration-300">
      <div className="flex justify-between items-start">
        <div className="space-y-1">
          <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{label}</p>
          <h4 className="text-2xl md:text-3xl font-black text-slate-900 dark:text-white tracking-tighter transition-colors">{value}</h4>
          <p className="text-[10px] font-bold text-slate-400">{subValue}</p>
        </div>
        <div className={`p-3 rounded-2xl transition-transform group-hover:scale-110 ${colors[color]}`}>
          {icon}
        </div>
      </div>
      <div className="mt-6 h-1 w-full bg-slate-100 dark:bg-white/5 rounded-full overflow-hidden">
        <div 
          className={`h-full transition-all duration-1000 ease-out ${color === 'primary' ? 'bg-primary' : color === 'success' ? 'bg-success' : color === 'info' ? 'bg-info' : 'bg-warning'}`}
          style={{ width: `${Math.min(100, progress)}%` }}
        />
      </div>
    </div>
  );
}

function DashboardCard({ title, children, headerAction, isCollapsible, onToggle, isCollapsed }: any) {
  const [localCollapsed, setLocalCollapsed] = useState(false);
  const collapsed = isCollapsed !== undefined ? isCollapsed : localCollapsed;
  const toggle = onToggle !== undefined ? onToggle : () => setLocalCollapsed(!collapsed);

  return (
    <div className="glass-card p-6 sm:p-8 animate-in fade-in slide-in-from-bottom-4 duration-500 fill-mode-both">
      <div className="flex justify-between items-center mb-2">
        <div className="flex items-center gap-2">
          <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] border-l-2 border-primary pl-3">{title}</h3>
        </div>
        <div className="flex items-center gap-4">
          {headerAction}
          {isCollapsible && (
            <button onClick={toggle} className="p-1 hover:bg-slate-200 dark:hover:bg-white/5 rounded-lg text-slate-500 transition-colors">
              {collapsed ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
            </button>
          )}
        </div>
      </div>
      <div className={`transition-all duration-500 ${collapsed ? 'opacity-0 h-0 overflow-hidden' : 'opacity-100'}`}>
        {!collapsed && children}
      </div>
    </div>
  );
}

function ProtocolRow({ label, active, detail }: any) {
  return (
    <div className="flex items-center justify-between p-4 bg-slate-50 dark:bg-white/5 rounded-2xl border border-slate-200 dark:border-white/5 hover:bg-slate-100 dark:hover:bg-white/10 transition-all hover:scale-[1.02] group">
      <div className="flex items-center gap-3">
        <div className={`w-2 h-2 rounded-full ${active ? 'bg-success shadow-glow animate-pulse' : 'bg-slate-300 dark:bg-slate-700'}`} />
        <span className="text-xs font-bold text-slate-700 dark:text-slate-200 group-hover:text-primary transition-colors">{label}</span>
      </div>
      <span className="text-[10px] font-black text-slate-500 uppercase tracking-tighter">{detail}</span>
    </div>
  );
}

function ResourceRow({ label, value, mono, highlight }: any) {
  return (
    <div className="flex justify-between items-baseline gap-4 hover:bg-slate-50 dark:hover:bg-white/5 p-1 -mx-1 rounded transition-colors">
      <span className="text-[10px] font-black text-slate-500 uppercase tracking-wider">{label}</span>
      <span className={`text-xs font-bold ${highlight ? 'text-primary' : 'text-slate-700 dark:text-slate-300'} ${mono ? 'font-mono' : ''}`}>{value}</span>
    </div>
  );
}

function ActionButton({ icon, label, onClick }: any) {
  return (
    <button onClick={onClick} className="flex flex-col items-center justify-center p-4 bg-white dark:bg-white/5 rounded-2xl border border-slate-200 dark:border-white/5 hover:bg-primary/20 hover:border-primary/40 transition-all hover:-translate-y-1 group shadow-sm">
      <div className="text-slate-500 dark:text-slate-400 group-hover:text-primary transition-colors mb-2 group-hover:scale-110 duration-300">{icon}</div>
      <span className="text-[9px] font-black text-slate-500 group-hover:text-slate-900 dark:group-hover:text-white uppercase tracking-widest transition-colors">{label}</span>
    </button>
  );
}

function DetailRow({ label, value, mono, highlight }: any) {
  return (
    <div className="flex justify-between items-center p-3 bg-slate-50 dark:bg-white/5 rounded-xl border border-slate-200 dark:border-white/5 hover:border-primary/30 transition-colors">
      <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{label}</span>
      <span className={`text-xs font-bold ${highlight ? 'text-success' : 'text-slate-800 dark:text-slate-200'} ${mono ? 'font-mono' : ''}`}>{value}</span>
    </div>
  );
}
