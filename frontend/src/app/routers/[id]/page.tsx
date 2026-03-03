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
  ArrowDown, ArrowUp
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

function extractBgpNeighbors(raw: any): Record<string, any> | null {
  if (!raw || typeof raw !== 'object') return null;
  if (raw.neighbor && typeof raw.neighbor === 'object') return raw.neighbor;
  if (raw.neighbors && typeof raw.neighbors === 'object') return raw.neighbors;
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

const COMMON_TIMEZONES = ["UTC", "America/New_York", "America/Chicago", "America/Los_Angeles", "Europe/London", "Europe/Paris", "Asia/Dubai", "Asia/Singapore", "Asia/Tokyo"];

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
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('dashboard');
  
  // Tab Data
  const [routingTable, setRoutingTable] = useState<any[]>([]);
  const [logs, setLogs] = useState<string[]>([]);
  const [conntrack, setConntrack] = useState<string>('');
  const [processes, setProcesses] = useState<string>('');
  const [arpTable, setArpTable] = useState<string>('');
  const [dhcpLeases, setDhcpLeases] = useState<string>('');
  const [natTranslations, setNatTranslations] = useState<string>('');
  const [bgpSummary, setBgpSummary] = useState<string>('');
  const [staticRoutes, setStaticRoutes] = useState<any>({});
  const [snmpConfig, setSnmpConfig] = useState<any>({});
  const [ipsecStatus, setIpsecStatus] = useState<string>('');
  const [ipsecConfig, setIpsecConfig] = useState<any>({});
  const [ocStatus, setOcStatus] = useState<string>('');
  const [ocConfig, setOcConfig] = useState<any>({});
  const [loadingTab, setLoadingTab] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);

  // Configuration Forms State
  const [showIpsecForm, setShowIpsecForm] = useState(false);
  const [ipsecForm, setIpsecForm] = useState({
    peerName: '',
    remoteAddr: '',
    localAddr: '',
    localID: '',
    remoteID: '',
    presharedKey: '',
    localPrefix: '192.168.0.0/24',
    remotePrefix: '192.168.1.0/24',
    ikeGroup: 'IKE-GROUP',
    espGroup: 'ESP-GROUP',
    interface: 'eth0'
  });

  const [showOcForm, setShowOcForm] = useState(false);
  const [ocForm, setOcForm] = useState({
    subnet: '172.20.20.0/24',
    dns: '8.8.8.8',
    caCert: 'ca-ocserv',
    serverCert: 'srv-ocserv',
    authMode: 'local password'
  });

  const handleSaveOpenConnect = async (e: React.FormEvent) => {
    e.preventDefault();
    setConfigLoading(true);
    try {
      const commands = [
        { path: ['vpn', 'openconnect', 'authentication', 'mode'], value: ocForm.authMode },
        { path: ['vpn', 'openconnect', 'network-settings', 'client-ip-settings', 'subnet'], value: ocForm.subnet },
        { path: ['vpn', 'openconnect', 'network-settings', 'name-server'], value: ocForm.dns },
        { path: ['vpn', 'openconnect', 'ssl', 'ca-certificate'], value: ocForm.caCert },
        { path: ['vpn', 'openconnect', 'ssl', 'certificate'], value: ocForm.serverCert },
      ];
      await api.post(`/routers/${id}/config/batch`, commands);
      setShowOcForm(false);
      fetchData();
    } catch (err: any) {
      alert('Failed to save OpenConnect config: ' + (err.response?.data?.detail || err.message));
    } finally {
      setConfigLoading(false);
    }
  };

  const handleSaveIPsecPeer = async (e: React.FormEvent) => {
    e.preventDefault();
    setConfigLoading(true);
    try {
      const commands = [
        // 1. IKE Group Definition
        { path: ['vpn', 'ipsec', 'ike-group', ipsecForm.ikeGroup, 'key-exchange'], value: 'ikev1' },
        { path: ['vpn', 'ipsec', 'ike-group', ipsecForm.ikeGroup, 'lifetime'], value: '28800' },
        { path: ['vpn', 'ipsec', 'ike-group', ipsecForm.ikeGroup, 'proposal', '10', 'encryption'], value: 'aes256' },
        { path: ['vpn', 'ipsec', 'ike-group', ipsecForm.ikeGroup, 'proposal', '10', 'hash'], value: 'sha1' },
        { path: ['vpn', 'ipsec', 'ike-group', ipsecForm.ikeGroup, 'proposal', '10', 'dh-group'], value: '14' },
        { path: ['vpn', 'ipsec', 'ike-group', ipsecForm.ikeGroup, 'dead-peer-detection', 'action'], value: 'restart' },
        { path: ['vpn', 'ipsec', 'ike-group', ipsecForm.ikeGroup, 'dead-peer-detection', 'interval'], value: '30' },
        { path: ['vpn', 'ipsec', 'ike-group', ipsecForm.ikeGroup, 'dead-peer-detection', 'timeout'], value: '120' },

        // 2. ESP Group Definition
        { path: ['vpn', 'ipsec', 'esp-group', ipsecForm.espGroup, 'lifetime'], value: '3600' },
        { path: ['vpn', 'ipsec', 'esp-group', ipsecForm.espGroup, 'proposal', '10', 'encryption'], value: 'aes256' },
        { path: ['vpn', 'ipsec', 'esp-group', ipsecForm.espGroup, 'proposal', '10', 'hash'], value: 'sha1' },

        // 3. Global Interface
        { path: ['vpn', 'ipsec', 'interface'], value: ipsecForm.interface },

        // 4. PSK Authentication
        { path: ['vpn', 'ipsec', 'authentication', 'psk', ipsecForm.peerName, 'id'], value: ipsecForm.localID || ipsecForm.localAddr },
        { path: ['vpn', 'ipsec', 'authentication', 'psk', ipsecForm.peerName, 'id'], value: ipsecForm.remoteID || ipsecForm.remoteAddr },
        { path: ['vpn', 'ipsec', 'authentication', 'psk', ipsecForm.peerName, 'secret'], value: ipsecForm.presharedKey },

        // 5. Site-to-Site Peer
        { path: ['vpn', 'ipsec', 'site-to-site', 'peer', ipsecForm.remoteAddr, 'authentication', 'mode'], value: 'pre-shared-secret' },
        { path: ['vpn', 'ipsec', 'site-to-site', 'peer', ipsecForm.remoteAddr, 'authentication', 'local-id'], value: ipsecForm.localID || ipsecForm.localAddr },
        { path: ['vpn', 'ipsec', 'site-to-site', 'peer', ipsecForm.remoteAddr, 'authentication', 'remote-id'], value: ipsecForm.remoteID || ipsecForm.remoteAddr },
        { path: ['vpn', 'ipsec', 'site-to-site', 'peer', ipsecForm.remoteAddr, 'ike-group'], value: ipsecForm.ikeGroup },
        { path: ['vpn', 'ipsec', 'site-to-site', 'peer', ipsecForm.remoteAddr, 'default-esp-group'], value: ipsecForm.espGroup },
        { path: ['vpn', 'ipsec', 'site-to-site', 'peer', ipsecForm.remoteAddr, 'local-address'], value: ipsecForm.localAddr },
        { path: ['vpn', 'ipsec', 'site-to-site', 'peer', ipsecForm.remoteAddr, 'remote-address'], value: ipsecForm.remoteAddr },
        { path: ['vpn', 'ipsec', 'site-to-site', 'peer', ipsecForm.remoteAddr, 'connection-type'], value: 'initiate' },
        
        // 6. Tunnel 0
        { path: ['vpn', 'ipsec', 'site-to-site', 'peer', ipsecForm.remoteAddr, 'tunnel', '0', 'local', 'prefix'], value: ipsecForm.localPrefix },
        { path: ['vpn', 'ipsec', 'site-to-site', 'peer', ipsecForm.remoteAddr, 'tunnel', '0', 'remote', 'prefix'], value: ipsecForm.remotePrefix },
      ];
      await api.post(`/routers/${id}/config/batch`, commands);
      setShowIpsecForm(false);
      fetchData();
    } catch (err: any) {
      alert('Failed to save IPsec peer: ' + (err.response?.data?.detail || err.message));
    } finally {
      setConfigLoading(false);
    }
  };

  const handleRemoveIPsecPeer = async (remoteAddr: string, peerName: string) => {
    if (!confirm(`Delete tunnel to ${remoteAddr}?`)) return;
    setConfigLoading(true);
    try {
      const commands = [
        { op: 'delete', path: ['vpn', 'ipsec', 'site-to-site', 'peer', remoteAddr] },
        { op: 'delete', path: ['vpn', 'ipsec', 'authentication', 'psk', peerName] }
      ];
      await api.post(`/routers/${id}/config/batch`, commands);
      fetchData();
    } catch (err: any) {
      alert('Failed to remove peer.');
    } finally {
      setConfigLoading(false);
    }
  };

  // Tool States
  const [pingTarget, setPingTarget] = useState('');
  const [pingOutput, setPingOutput] = useState('');
  const [pingLoading, setPingLoading] = useState(false);
  const [tracerouteTarget, setTracerouteTarget] = useState('');
  const [tracerouteOutput, setTracerouteOutput] = useState('');
  const [tracerouteLoading, setTracerouteLoading] = useState(false);
  const [captureInterface, setCaptureInterface] = useState('');
  const [captureOutput, setCaptureOutput] = useState('');
  const [captureLoading, setCaptureLoading] = useState(false);
  const [customCommand, setCustomCommand] = useState('');
  const [commandOutput, setCommandOutput] = useState('');
  const [commandLoading, setCommandLoading] = useState(false);

  // Firewall & Config
  const [selectedFirewallGroup, setSelectedFirewallGroup] = useState<string | null>(null);
  const [newGroupAddress, setNewGroupAddress] = useState('');
  const [newTimezone, setNewTimezone] = useState('');
  const [configLoading, setConfigLoading] = useState(false);

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
        if (configRes.data.config?.system?.['time-zone']) setNewTimezone(configRes.data.config.system['time-zone']);
      }
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
      setError(err.response?.data?.detail || err.message || 'Failed to load router data.');
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
      } else if (activeTab === 'top') {
        const res = await api.get(`/routers/${id}/top`);
        setProcesses(res.data.output || '');
      } else if (activeTab === 'arp') {
        const res = await api.post(`/routers/${id}/command`, { command: ["arp"] });
        setArpTable(res.data.output || '');
      } else if (activeTab === 'leases') {
        const res = await api.post(`/routers/${id}/command`, { command: ["dhcp", "server", "leases"] });
        setDhcpLeases(res.data.output || '');
      } else if (activeTab === 'nat') {
        const res = await api.post(`/routers/${id}/command`, { command: ["nat", "translations"] });
        setNatTranslations(res.data.output || '');
      }
    } catch (err: any) {
      console.error('Tab load failed:', err);
    } finally {
      setLoadingTab(false);
    }
  };

  useEffect(() => {
    fetchData();
    const iv = setInterval(fetchData, 5000);
    return () => clearInterval(iv);
  }, [id, timeRange]);

  useEffect(() => {
    fetchTabData();
    let iv: any;
    if (activeTab === 'top' || activeTab === 'conntrack') iv = setInterval(fetchTabData, 5000);
    return () => iv && clearInterval(iv);
  }, [activeTab]);

  const handlePing = async (e: React.FormEvent) => {
    e.preventDefault();
    setPingLoading(true);
    setPingOutput('Pinging...');
    try {
      const res = await api.post(`/routers/${id}/ping`, { host: pingTarget });
      setPingOutput(res.data.output);
    } catch (err: any) { setPingOutput('Ping failed.'); }
    finally { setPingLoading(false); }
  };

  const handleTraceroute = async (e: React.FormEvent) => {
    e.preventDefault();
    setTracerouteLoading(true);
    setTracerouteOutput('Tracing...');
    try {
      const res = await api.post(`/routers/${id}/traceroute`, { host: tracerouteTarget });
      setTracerouteOutput(res.data.output);
    } catch (err: any) { setTracerouteOutput('Traceroute failed.'); }
    finally { setTracerouteLoading(false); }
  };

  const handleCapture = async (e: React.FormEvent) => {
    e.preventDefault();
    setCaptureLoading(true);
    setCaptureOutput('Capturing...');
    try {
      const res = await api.post(`/routers/${id}/monitor/traffic`, { interface: captureInterface });
      setCaptureOutput(res.data.output);
    } catch (err: any) { setCaptureOutput('Capture failed.'); }
    finally { setCaptureLoading(false); }
  };

  const handleCommand = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customCommand) return;
    setCommandLoading(true);
    setCommandOutput(`vyos@router:~$ ${customCommand}\n\nRunning...`);
    try {
      const res = await api.post(`/routers/${id}/command`, { command: customCommand });
      setCommandOutput(`vyos@router:~$ ${customCommand}\n\n${res.data.output || '(No output)'}`);
    } catch (err: any) {
      setCommandOutput(`Error: ${err.response?.data?.detail || err.message}`);
    } finally {
      setCommandLoading(false);
    }
  };

  const toggleVpnService = async (service: string, currentState: boolean) => {
    setConfigLoading(true);
    try {
      await api.put(`/routers/${id}/config/vpn`, { service, enabled: !currentState });
      fetchData();
    } catch (err: any) { alert('VPN update failed'); }
    finally { setConfigLoading(false); }
  };

  const toggleFirewallSetting = async (setting: string, currentState: boolean) => {
    setConfigLoading(true);
    try {
      await api.put(`/routers/${id}/firewall/settings`, { setting, enabled: !currentState });
      fetchData();
    } catch (err: any) { alert('Firewall update failed'); }
    finally { setConfigLoading(false); }
  };

  const handleAddAddress = async (groupName: string) => {
    setConfigLoading(true);
    try {
      await api.post(`/routers/${id}/firewall/groups/${groupName}/address`, { address: newGroupAddress });
      setNewGroupAddress('');
      fetchData();
    } catch (err: any) { alert('Add address failed'); }
    finally { setConfigLoading(false); }
  };

  const handleRemoveAddress = async (groupName: string, address: string) => {
    if (!confirm('Remove?')) return;
    setConfigLoading(true);
    try {
      await api.delete(`/routers/${id}/firewall/groups/${groupName}/address/${address}`);
      fetchData();
    } catch (err: any) { alert('Remove address failed'); }
    finally { setConfigLoading(false); }
  };

  const configStatus = useMemo(() => {
    if (!routerConfig) return null;
    const vpn = routerConfig.vpn || {};
    const remoteAccess = vpn['remote-access'] || {};
    const fw = routerConfig.firewall || {};
    return {
      bgpPeers: Object.keys(routerConfig.protocols?.bgp?.neighbor || {}).length,
      vpn: {
        ipsec: !!vpn.ipsec,
        l2tp: !!(vpn.l2tp || remoteAccess.l2tp),
        openconnect: !!(vpn.openconnect || remoteAccess.openconnect),
        pptp: !!(vpn.pptp || remoteAccess.pptp),
        sstp: !!(vpn.sstp || remoteAccess.sstp),
        rsa: !!vpn['rsa-keys']
      },
      firewall: fw
    };
  }, [routerConfig]);

  const interfacesList = useMemo(() => {
    if (!latest?.interfaces) return [];
    const root = getIfaceRoot(latest.interfaces);
    const list: any[] = [];
    Object.entries(root).forEach(([type, ifaces]: [string, any]) => {
      if (typeof ifaces === 'object') Object.entries(ifaces).forEach(([name, data]: [string, any]) => list.push({ name, type, ...data }));
    });
    return list;
  }, [latest]);

  if (loading) return <div className="min-h-screen pt-24 px-12 bg-background"><Navbar /><DashboardSkeleton /></div>;

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Navbar />
      <div className="flex flex-1 pt-16">
        <aside className="w-64 bg-white dark:bg-dark-900 border-r border-slate-200 dark:border-white/5 overflow-y-auto custom-scrollbar">
          <div className="p-6 space-y-8">
            <div>
              <SidebarCategory label="Monitor" />
              <div className="mt-2 space-y-1">
                <SidebarItem active={activeTab === 'dashboard'} onClick={() => setActiveTab('dashboard')} icon={<LayoutDashboard className="w-4 h-4" />} label="Dashboard" />
                <SidebarItem active={activeTab === 'conntrack'} onClick={() => setActiveTab('conntrack')} icon={<ActivitySquare className="w-4 h-4" />} label="Live Connections" />
                <SidebarItem active={activeTab === 'top'} onClick={() => setActiveTab('top')} icon={<Cpu className="w-4 h-4" />} label="Process Monitor" />
                <SidebarItem active={activeTab === 'leases'} onClick={() => setActiveTab('leases')} icon={<HardDriveDownload className="w-4 h-4" />} label="DHCP Leases" />
                <SidebarItem active={activeTab === 'nat'} onClick={() => setActiveTab('nat')} icon={<Globe2 className="w-4 h-4" />} label="NAT Translations" />
              </div>
            </div>
            <div>
              <SidebarCategory label="Network" />
              <div className="mt-2 space-y-1">
                <SidebarItem active={activeTab === 'routes'} onClick={() => setActiveTab('routes')} icon={<Route className="w-4 h-4" />} label="Routing Table" />
                <SidebarItem active={activeTab === 'arp'} onClick={() => setActiveTab('arp')} icon={<List className="w-4 h-4" />} label="ARP Table" />
                <SidebarItem active={activeTab === 'interfaces'} onClick={() => setActiveTab('interfaces')} icon={<Network className="w-4 h-4" />} label="Interfaces" />
              </div>
            </div>
            <div>
              <SidebarCategory label="Security & VPN" />
              <div className="mt-2 space-y-1">
                <SidebarItem active={activeTab === 'vpn'} onClick={() => setActiveTab('vpn')} icon={<Lock className="w-4 h-4" />} label="VPN Gateway" />
                <SidebarItem active={activeTab === 'firewall'} onClick={() => setActiveTab('firewall')} icon={<Shield className="w-4 h-4" />} label="Firewall Manager" />
              </div>
            </div>
            <div>
              <SidebarCategory label="Diagnostics" />
              <div className="mt-2 space-y-1">
                <SidebarItem active={activeTab === 'ping'} onClick={() => setActiveTab('ping')} icon={<Wifi className="w-4 h-4" />} label="Ping Tool" />
                <SidebarItem active={activeTab === 'traceroute'} onClick={() => setActiveTab('traceroute')} icon={<Terminal className="w-4 h-4" />} label="Traceroute" />
                <SidebarItem active={activeTab === 'command'} onClick={() => setActiveTab('command')} icon={<TerminalSquare className="w-4 h-4" />} label="Command Explorer" />
              </div>
            </div>
          </div>
        </aside>

        <main className="flex-1 p-10 overflow-y-auto">
          <div className="max-w-7xl mx-auto space-y-8">
            <h1 className="text-4xl font-black text-slate-900 dark:text-white tracking-tighter">{routerInfo?.name}</h1>
            
            {activeTab === 'dashboard' ? (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 animate-in fade-in duration-500">
                <div className="lg:col-span-2 space-y-8">
                  <DashboardCard title="Throughput Monitor (Mbps)">
                    <div className="h-80 mt-6">
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={metrics}>
                          <XAxis dataKey="time" hide />
                          <YAxis hide />
                          <Tooltip />
                          <Area type="monotone" dataKey="rx" stroke="#0ea5e9" fill="#0ea5e9" fillOpacity={0.1} />
                          <Area type="monotone" dataKey="tx" stroke="#6366f1" fill="#6366f1" fillOpacity={0.1} />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  </DashboardCard>
                  <DashboardCard title="Interfaces Quick View">
                    <div className="grid grid-cols-2 gap-4 mt-6">
                      {interfacesList.map(i => (
                        <div key={i.name} className="glass-card p-4 flex justify-between items-center">
                          <span className="font-black text-sm">{i.name}</span>
                          <div className={`w-2 h-2 rounded-full ${i.state === 'up' ? 'bg-success shadow-glow' : 'bg-slate-300'}`} />
                        </div>
                      ))}
                    </div>
                  </DashboardCard>
                </div>
                <div className="space-y-8">
                  <SummaryCard label="CPU" value={`${latest?.cpu_usage?.toFixed(1)}%`} icon={<Cpu />} progress={latest?.cpu_usage} color="primary" />
                  <SummaryCard label="RAM" value={`${latest?.memory_usage?.toFixed(1)}%`} icon={<Activity />} progress={latest?.memory_usage} color="success" />
                </div>
              </div>
            ) : activeTab === 'firewall' ? (
              <div className="space-y-8 animate-in fade-in duration-500">
                <div className="bg-primary/5 p-8 rounded-3xl border border-primary/20">
                  <h4 className="text-xl font-black mb-8 flex items-center gap-3"><ShieldCheck className="text-primary" /> Global Policy</h4>
                  <div className="flex items-center justify-between p-4 bg-white dark:bg-white/5 rounded-2xl border border-slate-200 dark:border-white/10">
                    <span className="font-bold text-sm">Respond to ICMP (Ping)</span>
                    <button 
                      onClick={() => toggleFirewallSetting('all-ping', configStatus?.firewall?.['all-ping'] === 'enable')}
                      className={`px-6 py-2 rounded-xl text-[10px] font-black uppercase transition-all ${configStatus?.firewall?.['all-ping'] === 'enable' ? 'bg-success text-white' : 'bg-slate-200 text-slate-500'}`}
                    >
                      {configStatus?.firewall?.['all-ping'] === 'enable' ? 'Enabled' : 'Disabled'}
                    </button>
                  </div>
                </div>
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                  <div className="lg:col-span-1 space-y-2">
                    <SidebarCategory label="Address Groups" />
                    {Object.keys(configStatus?.firewall?.group?.['address-group'] || {}).map(name => (
                      <button key={name} onClick={() => setSelectedFirewallGroup(name)} className={`w-full p-4 rounded-2xl border text-left transition-all ${selectedFirewallGroup === name ? 'bg-primary text-white' : 'bg-white dark:bg-white/5 border-slate-200 dark:border-white/5'}`}>
                        <div className="font-black text-sm">{name}</div>
                      </button>
                    ))}
                  </div>
                  <div className="lg:col-span-2">
                    {selectedFirewallGroup ? (
                      <div className="bg-white dark:bg-white/5 rounded-3xl border border-slate-200 dark:border-white/10 p-6">
                        <div className="flex justify-between items-center mb-6">
                          <h5 className="font-black text-lg">{selectedFirewallGroup}</h5>
                          <div className="flex gap-2">
                            <input value={newGroupAddress} onChange={e => setNewGroupAddress(e.target.value)} placeholder="IP Address..." className="bg-slate-100 dark:bg-dark-900 px-4 py-2 rounded-xl text-xs outline-none" />
                            <button onClick={() => handleAddAddress(selectedFirewallGroup)} className="bg-primary text-white p-2 rounded-xl"><Plus className="w-4 h-4" /></button>
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-3 max-h-96 overflow-y-auto">
                          {(Array.isArray(configStatus?.firewall?.group?.['address-group']?.[selectedFirewallGroup]?.address) 
                            ? configStatus?.firewall?.group?.['address-group']?.[selectedFirewallGroup]?.address 
                            : [configStatus?.firewall?.group?.['address-group']?.[selectedFirewallGroup]?.address]).filter(Boolean).map((addr: string) => (
                            <div key={addr} className="flex justify-between items-center p-3 bg-slate-50 dark:bg-white/5 rounded-xl group">
                              <span className="font-mono text-xs">{addr}</span>
                              <button onClick={() => handleRemoveAddress(selectedFirewallGroup, addr)} className="text-danger opacity-0 group-hover:opacity-100"><Trash2 className="w-3.5 h-3.5" /></button>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : <div className="h-64 flex items-center justify-center border-2 border-dashed rounded-3xl opacity-30 font-black uppercase text-xs">Select a group</div>}
                  </div>
                </div>
              </div>
            ) : (
              <DashboardCard title={activeTab.replace('-', ' ')}>
                <div className="animate-in fade-in duration-500">
                  {loadingTab ? <div className="flex justify-center py-20"><RefreshCw className="animate-spin text-primary" /></div> : (
                    <>
                      {activeTab === 'interfaces' && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                          {interfacesList.map((iface) => (
                            <div key={iface.name} className="bg-white dark:bg-white/5 rounded-3xl border border-slate-200 dark:border-white/10 overflow-hidden group hover:border-primary/50 transition-all">
                              <div className="p-6 border-b border-slate-100 dark:border-white/5 flex items-center justify-between bg-slate-50/50 dark:bg-white/5">
                                <div className="flex items-center gap-4">
                                  <div className={`p-3 rounded-2xl ${iface.type === 'ethernet' ? 'bg-primary/10 text-primary' : 'bg-slate-200 dark:bg-white/10 text-slate-500'}`}>
                                    {iface.type === 'ethernet' ? <Network className="w-5 h-5" /> : <RefreshCw className="w-5 h-5" />}
                                  </div>
                                  <div>
                                    <h5 className="font-black text-slate-900 dark:text-white leading-none">{iface.name}</h5>
                                    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mt-1">{iface.type}</p>
                                  </div>
                                </div>
                                <div className={`w-2 h-2 rounded-full ${iface.state === 'up' || iface['rx-bytes'] > 0 ? 'bg-success shadow-glow' : 'bg-slate-300'}`} />
                              </div>
                              <div className="p-6 space-y-6">
                                <div className="grid grid-cols-2 gap-4">
                                  <div className="space-y-1">
                                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-tight">IP Address</p>
                                    <p className="text-xs font-bold font-mono text-slate-700 dark:text-slate-300">{iface.address || 'Unassigned'}</p>
                                  </div>
                                  <div className="space-y-1">
                                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-tight">Hardware ID</p>
                                    <p className="text-xs font-bold font-mono text-slate-700 dark:text-slate-300 truncate" title={iface['hw-id']}>{iface['hw-id'] || 'N/A'}</p>
                                  </div>
                                </div>
                                <div className="grid grid-cols-2 gap-6 pt-4 border-t border-slate-100 dark:border-white/5">
                                  <div className="space-y-3">
                                    <div className="flex items-center gap-2 text-info">
                                      <ArrowDown className="w-3 h-3" />
                                      <span className="text-[10px] font-black uppercase">Received</span>
                                    </div>
                                    <div>
                                      <p className="text-lg font-black tracking-tighter leading-none">{formatBytes(iface['rx-bytes'])}</p>
                                      <p className="text-[10px] font-bold text-slate-500 mt-1">{iface['rx-packets']?.toLocaleString()} Packets</p>
                                    </div>
                                  </div>
                                  <div className="space-y-3">
                                    <div className="flex items-center gap-2 text-primary">
                                      <ArrowUp className="w-3 h-3" />
                                      <span className="text-[10px] font-black uppercase">Transmitted</span>
                                    </div>
                                    <div>
                                      <p className="text-lg font-black tracking-tighter leading-none">{formatBytes(iface['tx-bytes'])}</p>
                                      <p className="text-[10px] font-bold text-slate-500 mt-1">{iface['tx-packets']?.toLocaleString()} Packets</p>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                      {activeTab === 'routes' && (
                        <div className="overflow-x-auto">
                          <table className="w-full text-left text-xs">
                            <thead>
                              <tr className="border-b dark:border-white/5">
                                <th className="py-3 px-4 font-black uppercase text-slate-500">Protocol</th>
                                <th className="py-3 px-4 font-black uppercase text-slate-500">Network</th>
                                <th className="py-3 px-4 font-black uppercase text-slate-500">Next Hop</th>
                                <th className="py-3 px-4 font-black uppercase text-slate-500">Interface</th>
                              </tr>
                            </thead>
                            <tbody>
                              {routingTable.map((route, i) => (
                                <tr key={i} className="border-b dark:border-white/5 hover:bg-slate-50 dark:hover:bg-white/5 transition-colors">
                                  <td className="py-3 px-4"><span className={`px-2 py-1 rounded font-bold uppercase text-[10px] ${route.selected ? 'bg-success/10 text-success' : 'bg-slate-100 text-slate-500'}`}>{route.protocol}</span></td>
                                  <td className="py-3 px-4 font-mono font-bold">{route.prefix}</td>
                                  <td className="py-3 px-4 font-mono">{route.next_hop?.next_hop || 'Direct'}</td>
                                  <td className="py-3 px-4 text-slate-500">{route.next_hop?.interface || '-'}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                      {activeTab === 'vpn' && (
                        <div className="space-y-8 animate-in fade-in duration-500">
                          {/* VPN Service Toggles */}
                          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            {['ipsec', 'l2tp', 'openconnect', 'pptp', 'sstp'].map(svc => (
                              <div key={svc} className="p-6 bg-slate-50 dark:bg-white/5 rounded-3xl border dark:border-white/5 space-y-4">
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-3">
                                    <div className={`p-2 rounded-lg ${(configStatus?.vpn as any)?.[svc] ? 'bg-success/10 text-success' : 'bg-slate-200 dark:bg-white/10 text-slate-400'}`}>
                                      <Lock className="w-4 h-4" />
                                    </div>
                                    <span className="font-black uppercase text-xs">{svc} Service</span>
                                  </div>
                                  <div className={`w-2 h-2 rounded-full ${(configStatus?.vpn as any)?.[svc] ? 'bg-success shadow-glow' : 'bg-slate-300'}`} />
                                </div>
                                <button onClick={() => toggleVpnService(svc, (configStatus?.vpn as any)?.[svc])} disabled={configLoading} className={`w-full py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${(configStatus?.vpn as any)?.[svc] ? 'bg-danger/10 text-danger hover:bg-danger hover:text-white' : 'bg-success/10 text-success hover:bg-success hover:text-white'}`}>
                                  {(configStatus?.vpn as any)?.[svc] ? 'Disable' : 'Enable'}
                                </button>
                              </div>
                            ))}
                          </div>

                          {/* Site-to-Site IPsec Manager */}
                          <div className="space-y-6">
                            <div className="flex items-center justify-between px-2">
                              <h4 className="text-lg font-black tracking-tight">IPsec Site-to-Site Tunnels</h4>
                              <button 
                                onClick={() => setShowIpsecForm(!showIpsecForm)}
                                className="btn-primary px-4 py-2 text-[10px] font-black uppercase flex items-center gap-2"
                              >
                                {showIpsecForm ? <CloseIcon className="w-3 h-3" /> : <Plus className="w-3 h-3" />}
                                {showIpsecForm ? 'Cancel' : 'New Tunnel'}
                              </button>
                            </div>

                            {showIpsecForm && (
                              <form onSubmit={handleSaveIPsecPeer} className="bg-primary/5 border border-primary/20 rounded-3xl p-8 animate-in slide-in-from-top-4 duration-300">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                  <div className="space-y-4">
                                    <h5 className="text-[10px] font-black text-primary uppercase tracking-widest">General Settings</h5>
                                    <div className="space-y-2">
                                      <label className="text-[10px] font-bold text-slate-500 uppercase ml-1">Peer Name (ID)</label>
                                      <input required className="w-full bg-white dark:bg-dark-900 border dark:border-white/10 rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-primary" placeholder="e.g. office-to-datacenter" value={ipsecForm.peerName} onChange={e => setIpsecForm({...ipsecForm, peerName: e.target.value})} />
                                    </div>
                                    <div className="space-y-2">
                                      <label className="text-[10px] font-bold text-slate-500 uppercase ml-1">Pre-Shared Key (Secret)</label>
                                      <input required type="password" title="Enter PSK" className="w-full bg-white dark:bg-dark-900 border dark:border-white/10 rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-primary" value={ipsecForm.presharedKey} onChange={e => setIpsecForm({...ipsecForm, presharedKey: e.target.value})} />
                                    </div>
                                  </div>
                                  <div className="space-y-4">
                                    <h5 className="text-[10px] font-black text-primary uppercase tracking-widest">Network Topology</h5>
                                    <div className="grid grid-cols-2 gap-4">
                                      <div className="space-y-2">
                                        <label className="text-[10px] font-bold text-slate-500 uppercase ml-1">Local IP</label>
                                        <input required className="w-full bg-white dark:bg-dark-900 border dark:border-white/10 rounded-xl px-4 py-3 text-sm" placeholder="1.2.3.4" value={ipsecForm.localAddr} onChange={e => setIpsecForm({...ipsecForm, localAddr: e.target.value})} />
                                      </div>
                                      <div className="space-y-2">
                                        <label className="text-[10px] font-bold text-slate-500 uppercase ml-1">Remote IP</label>
                                        <input required className="w-full bg-white dark:bg-dark-900 border dark:border-white/10 rounded-xl px-4 py-3 text-sm" placeholder="5.6.7.8" value={ipsecForm.remoteAddr} onChange={e => setIpsecForm({...ipsecForm, remoteAddr: e.target.value})} />
                                      </div>
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                      <div className="space-y-2">
                                        <label className="text-[10px] font-bold text-slate-500 uppercase ml-1">Local Network</label>
                                        <input required className="w-full bg-white dark:bg-dark-900 border dark:border-white/10 rounded-xl px-4 py-3 text-sm" placeholder="192.168.1.0/24" value={ipsecForm.localPrefix} onChange={e => setIpsecForm({...ipsecForm, localPrefix: e.target.value})} />
                                      </div>
                                      <div className="space-y-2">
                                        <label className="text-[10px] font-bold text-slate-500 uppercase ml-1">Remote Network</label>
                                        <input required className="w-full bg-white dark:bg-dark-900 border dark:border-white/10 rounded-xl px-4 py-3 text-sm" placeholder="10.0.0.0/24" value={ipsecForm.remotePrefix} onChange={e => setIpsecForm({...ipsecForm, remotePrefix: e.target.value})} />
                                      </div>
                                    </div>
                                  </div>
                                </div>
                                <div className="mt-8 flex justify-end">
                                  <button type="submit" disabled={configLoading} className="btn-primary px-10 py-3 flex items-center gap-3">
                                    {configLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                                    Deploy Configuration
                                  </button>
                                </div>
                              </form>
                            )}

                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                              {Object.entries(routerConfig?.vpn?.ipsec?.['site-to-site']?.peer || {}).map(([name, peer]: any) => (
                                <div key={name} className="bg-white dark:bg-white/5 rounded-3xl border border-slate-200 dark:border-white/10 p-6 space-y-4">
                                  <div className="flex justify-between items-start">
                                    <div>
                                      <h5 className="font-black text-slate-900 dark:text-white">{name}</h5>
                                      <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mt-1">Remote: {peer['remote-address']}</p>
                                    </div>
                                    <div className="status-badge bg-success/10 text-success">active</div>
                                  </div>
                                  <div className="grid grid-cols-2 gap-4 py-4 border-y border-slate-100 dark:border-white/5">
                                    <div>
                                      <p className="text-[9px] font-black text-slate-400 uppercase">Local Subnet</p>
                                      <p className="text-xs font-bold font-mono">{peer.tunnel?.['0']?.local?.prefix || 'N/A'}</p>
                                    </div>
                                    <div>
                                      <p className="text-[9px] font-black text-slate-400 uppercase">Remote Subnet</p>
                                      <p className="text-xs font-bold font-mono">{peer.tunnel?.['0']?.remote?.prefix || 'N/A'}</p>
                                    </div>
                                  </div>
                                  <div className="flex gap-2">
                                    <button className="flex-1 bg-slate-100 dark:bg-white/5 py-2 rounded-xl text-[9px] font-black uppercase hover:bg-primary/10 hover:text-primary transition-all">Edit Tunnel</button>
                                    <button className="p-2 text-slate-400 hover:text-danger"><Trash2 className="w-4 h-4" /></button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                      )}
                      {['conntrack', 'top', 'arp', 'leases', 'nat', 'logs'].includes(activeTab) && (
                        <pre className="bg-slate-900 text-slate-300 p-8 rounded-3xl font-mono text-xs overflow-x-auto min-h-[400px]">
                          {activeTab === 'conntrack' ? conntrack : 
                           activeTab === 'top' ? processes : 
                           activeTab === 'arp' ? arpTable : 
                           activeTab === 'leases' ? dhcpLeases : 
                           activeTab === 'nat' ? natTranslations : 
                           logs.join('\n')}
                        </pre>
                      )}
                      {activeTab === 'ping' && (
                        <div className="space-y-6">
                          <form onSubmit={handlePing} className="flex gap-4">
                            <input className="flex-1 bg-slate-50 dark:bg-dark-900 border dark:border-white/10 rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-primary" placeholder="8.8.8.8" value={pingTarget} onChange={e => setPingTarget(e.target.value)} />
                            <button type="submit" disabled={pingLoading} className="btn-primary px-8 flex items-center justify-center gap-2">{pingLoading ? <RefreshCw className="animate-spin w-4 h-4" /> : <Play className="w-4 h-4" />} Ping</button>
                          </form>
                          <pre className="bg-slate-900 text-slate-300 p-8 rounded-3xl font-mono text-xs min-h-[200px]">{pingOutput}</pre>
                        </div>
                      )}
                      {activeTab === 'traceroute' && (
                        <div className="space-y-6">
                          <form onSubmit={handleTraceroute} className="flex gap-4">
                            <input className="flex-1 bg-slate-50 dark:bg-dark-900 border dark:border-white/10 rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-primary" placeholder="google.com" value={tracerouteTarget} onChange={e => setTracerouteTarget(e.target.value)} />
                            <button type="submit" disabled={tracerouteLoading} className="btn-primary px-8 flex items-center justify-center gap-2">{tracerouteLoading ? <RefreshCw className="animate-spin w-4 h-4" /> : <Terminal className="w-4 h-4" />} Trace</button>
                          </form>
                          <pre className="bg-slate-900 text-slate-300 p-8 rounded-3xl font-mono text-xs min-h-[300px]">{tracerouteOutput}</pre>
                        </div>
                      )}
                      {activeTab === 'command' && (
                        <div className="space-y-6">
                          <form onSubmit={handleCommand} className="flex gap-4">
                            <div className="flex-1 relative">
                              <input className="w-full bg-white dark:bg-dark-900 border dark:border-white/10 rounded-xl py-3 px-4 outline-none focus:ring-2 focus:ring-primary font-mono text-sm" placeholder="e.g. show interfaces or set vpn..." value={customCommand} onChange={e => setCustomCommand(e.target.value)} />
                            </div>
                            <button type="submit" disabled={commandLoading} className="btn-primary px-8 flex items-center justify-center gap-2">{commandLoading ? <RefreshCw className="animate-spin w-4 h-4" /> : <Play className="w-4 h-4" />} Run</button>
                          </form>
                          <pre className="bg-slate-950 text-slate-200 p-8 rounded-3xl border dark:border-white/5 font-mono text-[11px] overflow-x-auto min-h-[500px] shadow-2xl">{commandOutput || 'Enter command...'}</pre>
                        </div>
                      )}
                    </>
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

function SidebarCategory({ label }: any) { return <h4 className="px-4 text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">{label}</h4>; }
function SidebarItem({ active, onClick, icon, label }: any) {
  return (
    <button onClick={onClick} className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-bold transition-all ${active ? 'bg-primary/10 text-primary border border-primary/20' : 'text-slate-500 hover:bg-slate-50 dark:hover:bg-white/5'}`}>
      {icon} <span>{label}</span>
    </button>
  );
}
function SummaryCard({ label, value, progress, color }: any) {
  return (
    <div className="glass-card p-6">
      <p className="text-[10px] font-black text-slate-500 uppercase mb-1">{label}</p>
      <h4 className="text-2xl font-black mb-4">{value}</h4>
      <div className="h-1 w-full bg-slate-100 dark:bg-white/5 rounded-full overflow-hidden">
        <div className={`h-full ${color === 'primary' ? 'bg-primary' : 'bg-success'}`} style={{ width: `${progress}%` }} />
      </div>
    </div>
  );
}
function DashboardCard({ title, children }: any) {
  return (
    <div className="glass-card p-8">
      <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-widest border-l-2 border-primary pl-3 mb-6">{title}</h3>
      {children}
    </div>
  );
}
function DetailRow({ label, value }: any) {
  return (
    <div className="flex justify-between p-3 bg-slate-50 dark:bg-white/5 rounded-xl">
      <span className="text-[10px] font-black text-slate-500 uppercase">{label}</span>
      <span className="text-xs font-bold">{value}</span>
    </div>
  );
}
