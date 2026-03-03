'use client';

import { useState, useEffect, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import api from '@/lib/api';
import { XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area } from 'recharts';
import {
  Activity, Cpu, Network, Globe, Lock, GitBranch, HardDrive,
  CheckCircle2, XCircle, Route, Wifi, TerminalSquare, RefreshCw, ChevronLeft,
  Maximize2, Layers, Monitor, HardDriveDownload, Download, Settings2, Check,
  LayoutDashboard, FileText, ActivitySquare, Shield, Menu, X as CloseIcon,
  Play, Save, Globe2, Fingerprint, ShieldAlert, Radar, ScanSearch,
  ShieldCheck, ShieldHalf, Trash2, Plus, ChevronDown, ChevronUp, List, Terminal,
  ArrowDown, ArrowUp, Users
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
function sumIfaceBytes(interfaces: any) {
  let rx = 0, tx = 0;
  if (!interfaces || typeof interfaces !== 'object') return { rx, tx };
  const root = getIfaceRoot(interfaces);
  Object.entries(root).forEach(([categoryName, category]: [string, any]) => {
    if (!category || typeof category !== 'object') return;
    if (categoryName.toLowerCase() === 'loopback') return;
    Object.values(category).forEach((iface: any) => {
      if (!iface || typeof iface !== 'object') return;
      rx += getIfaceRx(iface);
      tx += getIfaceTx(iface);
    });
  });
  if (rx === 0 && tx === 0) {
    Object.entries(interfaces).forEach(([name, iface]: [string, any]) => {
      if (iface && typeof iface === 'object' && (iface['rx-bytes'] || iface['tx-bytes'])) {
        if (name.toLowerCase() === 'lo' || name.toLowerCase().startsWith('loopback')) return;
        rx += getIfaceRx(iface);
        tx += getIfaceTx(iface);
      }
    });
  }
  return { rx, tx };
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

// ─── Component ───────────────────────────────────────────────────────────────

export default function RouterDashboard() {
  const { id } = useParams();
  const router = useRouter();
  
  // Base State
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [routerInfo, setRouterInfo] = useState<any>(null);
  const [latest, setLatest] = useState<any>(null);
  const [metrics, setMetrics] = useState<any[]>([]);
  const [routerConfig, setRouterConfig] = useState<any>(null);
  const [vyosInfo, setVyosInfo] = useState<any>(null);
  const [timeRange, setTimeRange] = useState('30');
  const [loadingTab, setLoadingTab] = useState(false);
  const [configLoading, setConfigLoading] = useState(false);

  // Feature Data
  const [routingTable, setRoutingTable] = useState<any[]>([]);
  const [logs, setLogs] = useState<string[]>([]);
  const [conntrack, setConntrack] = useState<string>('');
  const [processes, setProcesses] = useState<string>('');
  const [arpTable, setArpTable] = useState<string>('');
  const [dhcpLeases, setDhcpLeases] = useState<string>('');
  const [natTranslations, setNatTranslations] = useState<string>('');
  const [ipsecStatus, setIpsecStatus] = useState<string>('');
  const [ocStatus, setOcStatus] = useState<string>('');

  // Tool States
  const [pingTarget, setPingTarget] = useState('');
  const [pingOutput, setPingOutput] = useState('');
  const [pingLoading, setPingLoading] = useState(false);
  const [tracerouteTarget, setTracerouteTarget] = useState('');
  const [tracerouteOutput, setTracerouteOutput] = useState('');
  const [tracerouteLoading, setTracerouteLoading] = useState(false);
  const [customCommand, setCustomCommand] = useState('');
  const [commandOutput, setCommandOutput] = useState('');
  const [commandLoading, setCommandLoading] = useState(false);

  // VPN Forms
  const [showIpsecForm, setShowIpsecForm] = useState(false);
  const [ipsecForm, setIpsecForm] = useState({
    peerName: '', remoteAddr: '', localAddr: '', presharedKey: '',
    localPrefix: '192.168.0.0/24', remotePrefix: '192.168.1.0/24'
  });
  const [showOcForm, setShowOcForm] = useState(false);
  const [ocForm, setOcForm] = useState({
    subnet: '172.20.20.0/24', dns: '8.8.8.8', caCert: 'ca-ocserv', serverCert: 'srv-ocserv'
  });

  // Firewall
  const [selectedFirewallGroup, setSelectedFirewallGroup] = useState<string | null>(null);
  const [newGroupAddress, setNewGroupAddress] = useState('');

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
      setRouterConfig(configRes.data.config || {});
      setVyosInfo(configRes.data.info || {});

      if (Array.isArray(historyRes.data)) {
        const rawPoints = historyRes.data.map((m: any) => {
          const { rx, tx } = sumIfaceBytes(m.interfaces);
          return { timestamp: new Date(m.timestamp), rx, tx };
        }).sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
        const processed = [];
        for (let i = 1; i < rawPoints.length; i++) {
          const prev = rawPoints[i - 1];
          const curr = rawPoints[i];
          const deltaSeconds = (curr.timestamp.getTime() - prev.timestamp.getTime()) / 1000;
          if (deltaSeconds > 0) {
            processed.push({
              time: curr.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
              rx: Math.round(Math.max(0, curr.rx - prev.rx) / deltaSeconds / 1000 / 1000 * 8 * 100) / 100,
              tx: Math.round(Math.max(0, curr.tx - prev.tx) / deltaSeconds / 1000 / 1000 * 8 * 100) / 100,
            });
          }
        }
        setMetrics(processed);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchTabData = async () => {
    if (activeTab === 'dashboard') return;
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
      } else if (activeTab === 'top') {
        const res = await api.get(`/routers/${id}/top`);
        setProcesses(res.data.output || '');
      } else if (activeTab === 'arp') {
        const res = await api.post(`/routers/${id}/command`, { command: "show arp" });
        setArpTable(res.data.output || '');
      } else if (activeTab === 'leases') {
        const res = await api.post(`/routers/${id}/command`, { command: "show dhcp server leases" });
        setDhcpLeases(res.data.output || '');
      } else if (activeTab === 'nat') {
        const res = await api.post(`/routers/${id}/command`, { command: "show nat translations" });
        setNatTranslations(res.data.output || '');
      } else if (activeTab === 'vpn') {
        const [iRes, oRes] = await Promise.all([
          api.get(`/routers/${id}/vpn/ipsec/status`),
          api.get(`/routers/${id}/vpn/openconnect/status`)
        ]);
        setIpsecStatus(iRes.data.status || '');
        setOcStatus(oRes.data.status || '');
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingTab(false);
    }
  };

  useEffect(() => {
    fetchData();
    const iv = setInterval(fetchData, 5000);
    return () => clearInterval(iv);
  }, [id]);

  useEffect(() => {
    fetchTabData();
    let iv: any;
    if (['top', 'conntrack', 'vpn'].includes(activeTab)) iv = setInterval(fetchTabData, 5000);
    return () => iv && clearInterval(iv);
  }, [activeTab]);

  // Handlers
  const handlePing = async (e: React.FormEvent) => {
    e.preventDefault();
    setPingLoading(true);
    try {
      const res = await api.post(`/routers/${id}/ping`, { host: pingTarget });
      setPingOutput(res.data.output);
    } catch { setPingOutput('Error.'); }
    finally { setPingLoading(false); }
  };

  const handleCommand = async (e: React.FormEvent) => {
    e.preventDefault();
    setCommandLoading(true);
    try {
      const res = await api.post(`/routers/${id}/command`, { command: customCommand });
      setCommandOutput(res.data.output);
    } catch { setCommandOutput('Error.'); }
    finally { setCommandLoading(false); }
  };

  const toggleVpnService = async (service: string, current: boolean) => {
    setConfigLoading(true);
    try {
      await api.put(`/routers/${id}/config/vpn`, { service, enabled: !current });
      fetchData();
    } finally { setConfigLoading(false); }
  };

  const handleSaveIPsecPeer = async (e: React.FormEvent) => {
    e.preventDefault();
    setConfigLoading(true);
    try {
      const cmds = [
        { path: ['vpn', 'ipsec', 'site-to-site', 'peer', ipsecForm.remoteAddr, 'authentication', 'mode'], value: 'pre-shared-secret' },
        { path: ['vpn', 'ipsec', 'site-to-site', 'peer', ipsecForm.remoteAddr, 'authentication', 'pre-shared-secret'], value: ipsecForm.presharedKey },
        { path: ['vpn', 'ipsec', 'site-to-site', 'peer', ipsecForm.remoteAddr, 'local-address'], value: ipsecForm.localAddr },
        { path: ['vpn', 'ipsec', 'site-to-site', 'peer', ipsecForm.remoteAddr, 'tunnel', '0', 'local', 'prefix'], value: ipsecForm.localPrefix },
        { path: ['vpn', 'ipsec', 'site-to-site', 'peer', ipsecForm.remoteAddr, 'tunnel', '0', 'remote', 'prefix'], value: ipsecForm.remotePrefix },
      ];
      await api.post(`/routers/${id}/config/batch`, cmds);
      setShowIpsecForm(false);
      fetchData();
    } finally { setConfigLoading(false); }
  };

  const configStatus = useMemo(() => {
    if (!routerConfig) return null;
    const vpn = routerConfig.vpn || {};
    return {
      vpn: {
        ipsec: !!vpn.ipsec,
        l2tp: !!(vpn.l2tp || vpn['remote-access']?.l2tp),
        openconnect: !!(vpn.openconnect || vpn['remote-access']?.openconnect),
        pptp: !!(vpn.pptp || vpn['remote-access']?.pptp),
        sstp: !!(vpn.sstp || vpn['remote-access']?.sstp)
      },
      firewall: routerConfig.firewall || {}
    };
  }, [routerConfig]);

  const interfacesList = useMemo(() => {
    const root = getIfaceRoot(latest?.interfaces || {});
    const list: any[] = [];
    Object.entries(root).forEach(([type, ifaces]: [string, any]) => {
      if (typeof ifaces === 'object') Object.entries(ifaces).forEach(([name, d]: [string, any]) => list.push({ name, type, ...d }));
    });
    return list;
  }, [latest]);

  if (loading) return <div className="p-12"><Navbar /><DashboardSkeleton /></div>;

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Navbar />
      <div className="flex flex-1 pt-16">
        <aside className="w-64 bg-white dark:bg-dark-900 border-r border-slate-200 dark:border-white/5 overflow-y-auto">
          <div className="p-6 space-y-8">
            <SidebarSection label="Monitor">
              <SidebarItem active={activeTab === 'dashboard'} onClick={() => setActiveTab('dashboard')} icon={<LayoutDashboard className="w-4 h-4" />} label="Dashboard" />
              <SidebarItem active={activeTab === 'conntrack'} onClick={() => setActiveTab('conntrack')} icon={<ActivitySquare className="w-4 h-4" />} label="Connections" />
              <SidebarItem active={activeTab === 'top'} onClick={() => setActiveTab('top')} icon={<Cpu className="w-4 h-4" />} label="Processes" />
            </SidebarSection>
            <SidebarSection label="Network">
              <SidebarItem active={activeTab === 'routes'} onClick={() => setActiveTab('routes')} icon={<Route className="w-4 h-4" />} label="Routes" />
              <SidebarItem active={activeTab === 'interfaces'} onClick={() => setActiveTab('interfaces')} icon={<Network className="w-4 h-4" />} label="Interfaces" />
              <SidebarItem active={activeTab === 'arp'} onClick={() => setActiveTab('arp')} icon={<List className="w-4 h-4" />} label="ARP Table" />
            </SidebarSection>
            <SidebarSection label="Security">
              <SidebarItem active={activeTab === 'vpn'} onClick={() => setActiveTab('vpn')} icon={<Lock className="w-4 h-4" />} label="VPN Gateway" />
              <SidebarItem active={activeTab === 'firewall'} onClick={() => setActiveTab('firewall')} icon={<Shield className="w-4 h-4" />} label="Firewall" />
            </SidebarSection>
            <SidebarSection label="Tools">
              <SidebarItem active={activeTab === 'ping'} onClick={() => setActiveTab('ping')} icon={<Wifi className="w-4 h-4" />} label="Ping" />
              <SidebarItem active={activeTab === 'command'} onClick={() => setActiveTab('command')} icon={<TerminalSquare className="w-4 h-4" />} label="Web Console" />
            </SidebarSection>
          </div>
        </aside>

        <main className="flex-1 p-10 overflow-y-auto">
          <div className="max-w-7xl mx-auto space-y-8">
            <div className="flex justify-between items-end">
              <div>
                <h1 className="text-4xl font-black tracking-tighter">{routerInfo?.name}</h1>
                <p className="text-xs font-bold text-slate-500 uppercase mt-1">{vyosInfo?.hostname} • {routerInfo?.version}</p>
              </div>
              <button onClick={fetchData} className="p-3 bg-primary/10 text-primary rounded-xl"><RefreshCw className="w-4 h-4" /></button>
            </div>

            {activeTab === 'dashboard' ? (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 animate-in fade-in duration-500">
                <div className="lg:col-span-2 space-y-8">
                  <DashboardCard title="Real-time Throughput (Mbps)">
                    <div className="h-80 mt-6">
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={metrics}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(0,0,0,0.05)" />
                          <XAxis dataKey="time" axisLine={false} tickLine={false} tick={{fontSize: 10}} />
                          <YAxis axisLine={false} tickLine={false} tick={{fontSize: 10}} />
                          <Tooltip />
                          <Area type="monotone" dataKey="rx" stroke="#0ea5e9" fill="#0ea5e9" fillOpacity={0.1} strokeWidth={3} />
                          <Area type="monotone" dataKey="tx" stroke="#6366f1" fill="#6366f1" fillOpacity={0.1} strokeWidth={3} />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  </DashboardCard>
                </div>
                <div className="space-y-8">
                  <SummaryCard label="CPU Load" value={`${latest?.cpu_usage?.toFixed(1)}%`} progress={latest?.cpu_usage} color="primary" />
                  <SummaryCard label="Memory" value={`${latest?.memory_usage?.toFixed(1)}%`} progress={latest?.memory_usage} color="success" />
                  <SummaryCard label="Disk" value={`${latest?.disk_usage?.toFixed(1)}%`} progress={latest?.disk_usage} color="info" />
                </div>
              </div>
            ) : activeTab === 'vpn' ? (
              <div className="space-y-12 animate-in fade-in duration-500">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
                  {['ipsec', 'l2tp', 'openconnect', 'pptp', 'sstp'].map(svc => (
                    <div key={svc} className="p-4 bg-white dark:bg-white/5 rounded-2xl border dark:border-white/5 flex flex-col justify-between h-32">
                      <div className="flex justify-between items-center">
                        <span className="text-[10px] font-black uppercase text-slate-500">{svc}</span>
                        <div className={`w-1.5 h-1.5 rounded-full ${(configStatus?.vpn as any)?.[svc] ? 'bg-success shadow-glow' : 'bg-slate-300'}`} />
                      </div>
                      <button onClick={() => toggleVpnService(svc, (configStatus?.vpn as any)?.[svc])} disabled={configLoading} className={`w-full py-2 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all ${(configStatus?.vpn as any)?.[svc] ? 'bg-danger/10 text-danger' : 'bg-success/10 text-success'}`}>
                        {(configStatus?.vpn as any)?.[svc] ? 'Disable' : 'Enable'}
                      </button>
                    </div>
                  ))}
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                  <div className="space-y-6">
                    <div className="flex justify-between items-center">
                      <h4 className="text-lg font-black tracking-tight">Site-to-Site Peers</h4>
                      <button onClick={() => setShowIpsecForm(!showIpsecForm)} className="btn-primary p-2 rounded-lg"><Plus className="w-4 h-4" /></button>
                    </div>
                    {showIpsecForm && (
                      <form onSubmit={handleSaveIPsecPeer} className="bg-primary/5 border border-primary/20 rounded-3xl p-6 space-y-4">
                        <input required className="w-full bg-white dark:bg-dark-900 border dark:border-white/10 rounded-xl px-4 py-2 text-sm" placeholder="Peer Name" value={ipsecForm.peerName} onChange={e => setIpsecForm({...ipsecForm, peerName: e.target.value})} />
                        <div className="grid grid-cols-2 gap-4">
                          <input required className="w-full bg-white dark:bg-dark-900 border dark:border-white/10 rounded-xl px-4 py-2 text-sm" placeholder="Remote IP" value={ipsecForm.remoteAddr} onChange={e => setIpsecForm({...ipsecForm, remoteAddr: e.target.value})} />
                          <input required className="w-full bg-white dark:bg-dark-900 border dark:border-white/10 rounded-xl px-4 py-2 text-sm" placeholder="Local IP" value={ipsecForm.localAddr} onChange={e => setIpsecForm({...ipsecForm, localAddr: e.target.value})} />
                        </div>
                        <input required className="w-full bg-white dark:bg-dark-900 border dark:border-white/10 rounded-xl px-4 py-2 text-sm" type="password" placeholder="PSK Secret" value={ipsecForm.presharedKey} onChange={e => setIpsecForm({...ipsecForm, presharedKey: e.target.value})} />
                        <button type="submit" className="btn-primary w-full py-3 font-black uppercase text-xs">Deploy Tunnel</button>
                      </form>
                    )}
                    <div className="space-y-4">
                      {Object.entries(routerConfig?.vpn?.ipsec?.['site-to-site']?.peer || {}).map(([name, peer]: any) => (
                        <div key={name} className="p-4 bg-white dark:bg-white/5 border dark:border-white/10 rounded-2xl flex justify-between items-center">
                          <div><p className="text-sm font-black">{name}</p><p className="text-[10px] text-slate-500 uppercase">{peer['remote-address']}</p></div>
                          <div className="status-badge bg-success/10 text-success">active</div>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="space-y-6">
                    <h4 className="text-lg font-black tracking-tight">SSL VPN Sessions</h4>
                    <pre className="bg-slate-900 text-success p-6 rounded-3xl font-mono text-[10px] min-h-[300px] overflow-x-auto">{ocStatus || 'No active sessions.'}</pre>
                  </div>
                </div>
              </div>
            ) : (
              <DashboardCard title={activeTab}>
                <div className="mt-6">
                  {loadingTab ? <div className="py-20 flex justify-center"><RefreshCw className="animate-spin text-primary" /></div> : (
                    activeTab === 'interfaces' ? (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {interfacesList.map(iface => (
                          <div key={iface.name} className="p-6 bg-white dark:bg-white/5 border dark:border-white/10 rounded-3xl space-y-4">
                            <div className="flex justify-between">
                              <span className="font-black">{iface.name}</span>
                              <div className={`w-2 h-2 rounded-full ${iface['rx-bytes'] > 0 ? 'bg-success shadow-glow' : 'bg-slate-300'}`} />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                              <DetailRow label="RX" value={formatBytes(iface['rx-bytes'])} />
                              <DetailRow label="TX" value={formatBytes(iface['tx-bytes'])} />
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : activeTab === 'command' ? (
                      <div className="space-y-6">
                        <form onSubmit={handleCommand} className="flex gap-4">
                          <input className="flex-1 bg-white dark:bg-dark-900 border dark:border-white/10 rounded-xl px-4 py-3 font-mono text-sm outline-none focus:ring-2 focus:ring-primary" placeholder="Enter VyOS command..." value={customCommand} onChange={e => setCustomCommand(e.target.value)} />
                          <button type="submit" className="btn-primary px-8 font-black uppercase text-xs">Run</button>
                        </form>
                        <pre className="bg-slate-950 text-slate-200 p-8 rounded-3xl font-mono text-[11px] overflow-x-auto min-h-[400px]">{commandOutput}</pre>
                      </div>
                    ) : (
                      <pre className="bg-slate-900 text-slate-300 p-8 rounded-3xl font-mono text-xs overflow-x-auto">
                        {activeTab === 'routes' ? JSON.stringify(routingTable, null, 2) : 
                         activeTab === 'logs' ? logs.join('\n') :
                         activeTab === 'conntrack' ? conntrack :
                         activeTab === 'top' ? processes :
                         activeTab === 'arp' ? arpTable :
                         activeTab === 'leases' ? dhcpLeases :
                         natTranslations}
                      </pre>
                    )
                  )}
                </div>
              </DashboardCard>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}

function SidebarSection({ label, children }: any) {
  return <div className="space-y-2"><h4 className="px-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">{label}</h4><div className="space-y-1">{children}</div></div>;
}
function SidebarItem({ active, onClick, icon, label }: any) {
  return (
    <button onClick={onClick} className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-bold transition-all ${active ? 'bg-primary/10 text-primary border border-primary/20' : 'text-slate-500 hover:bg-slate-50 dark:hover:bg-white/5'}`}>
      {icon} <span>{label}</span>
    </button>
  );
}
function SidebarCategory({ label }: any) { return <h4 className="px-4 text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">{label}</h4>; }
function SummaryCard({ label, value, progress, color }: any) {
  return (
    <div className="glass-card p-6 space-y-4">
      <div><p className="text-[10px] font-black text-slate-500 uppercase">{label}</p><h4 className="text-2xl font-black">{value}</h4></div>
      <div className="h-1 w-full bg-slate-100 dark:bg-white/5 rounded-full overflow-hidden">
        <div className={`h-full ${color === 'primary' ? 'bg-primary' : 'bg-success'}`} style={{ width: `${progress}%` }} />
      </div>
    </div>
  );
}
function DashboardCard({ title, children }: any) {
  return <div className="glass-card p-8"><h3 className="text-[10px] font-black text-slate-500 uppercase tracking-widest border-l-2 border-primary pl-3 mb-6">{title}</h3>{children}</div>;
}
function DetailRow({ label, value }: any) {
  return (
    <div className="flex justify-between p-3 bg-slate-50 dark:bg-white/5 rounded-xl">
      <span className="text-[10px] font-black text-slate-500 uppercase">{label}</span>
      <span className="text-xs font-bold">{value}</span>
    </div>
  );
}
