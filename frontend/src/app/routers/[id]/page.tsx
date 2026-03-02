'use client';

import { useState, useEffect, useMemo } from 'react';
import { useParams } from 'next/navigation';
import api from '@/lib/api';
import { XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area } from 'recharts';
import {
  Activity, ArrowDown, ArrowUp, Cpu, Server, ShieldCheck,
  Network, Globe, Lock, Radio, GitBranch, HardDrive,
  CheckCircle2, XCircle, Route, Wifi, TerminalSquare, RefreshCw,
} from 'lucide-react';
import Navbar from '@/components/Navbar';

// ─── VyOS data helpers ───────────────────────────────────────────────────────

function getIfaceRoot(interfaces: any) {
  return interfaces?.interface ?? interfaces;
}
function getIfaceRx(d: any) {
  return parseInt(d?.['rx-bytes'] ?? d?.stats?.rx_bytes ?? 0) || 0;
}
function getIfaceTx(d: any) {
  return parseInt(d?.['tx-bytes'] ?? d?.stats?.tx_bytes ?? 0) || 0;
}
function sumIfaceBytes(interfaces: any) {
  let rx = 0, tx = 0;
  if (!interfaces) return { rx, tx };
  const root = getIfaceRoot(interfaces);
  Object.values(root).forEach((ifaces: any) => {
    if (typeof ifaces !== 'object') return;
    Object.values(ifaces).forEach((iface: any) => { rx += getIfaceRx(iface); tx += getIfaceTx(iface); });
  });
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
  const keys = Object.keys(raw);
  if (keys.length > 0 && (keys[0].includes('.') || keys[0].includes(':'))) return raw;
  return null;
}

function formatBytes(bytes: any) {
  const b = parseInt(bytes);
  if (isNaN(b) || b === 0) return '0 B';
  const k = 1024, sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(b) / Math.log(k));
  return parseFloat((b / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function RouterDashboard() {
  const { id } = useParams();
  const [metrics, setMetrics] = useState<any[]>([]);
  const [latest, setLatest] = useState<any>(null);
  const [routerInfo, setRouterInfo] = useState<any>(null);
  const [routerConfig, setRouterConfig] = useState<any>(null);
  const [vyosInfo, setVyosInfo] = useState<any>(null);
  const [cardStats, setCardStats] = useState({ cpu: '...', mem: '...', rx: '...', tx: '...' });
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const fetchData = async () => {
    try {
      const [infoRes, latestRes, historyRes, configRes] = await Promise.all([
        api.get(`/routers/${id}`),
        api.get(`/metrics/${id}/latest`),
        api.get(`/metrics/${id}/history?limit=30`),
        api.get(`/routers/${id}/config`),
      ]);
      const latestData = latestRes.data;
      setRouterInfo(infoRes.data);
      setLatest(latestData);
      if (configRes.data) {
        setRouterConfig(configRes.data.config || {});
        setVyosInfo(configRes.data.info || {});
      }
      setLastUpdated(new Date());
      const { rx: totalRx, tx: totalTx } = sumIfaceBytes(latestData?.interfaces);
      setCardStats({
        cpu: latestData?.cpu_usage != null ? `${latestData.cpu_usage}%` : 'N/A',
        mem: latestData?.memory_usage != null ? `${latestData.memory_usage}%` : 'N/A',
        rx: formatBytes(totalRx),
        tx: formatBytes(totalTx),
      });
      if (Array.isArray(historyRes.data)) {
        const POLL = 30;
        const rawPoints = historyRes.data.map((m: any) => {
          const { rx, tx } = sumIfaceBytes(m.interfaces);
          return { time: new Date(m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), totalBytes: rx + tx };
        });
        setMetrics(rawPoints.map((p: any, i: number) => ({
          time: p.time,
          throughput: i === 0 ? 0 : Math.round(Math.max(0, p.totalBytes - rawPoints[i - 1].totalBytes) / POLL / 1024 / 1024 * 8 * 100) / 100,
        })));
      }
    } catch (_) {
    } finally {
      setLoading(false);
    }
  };

  // ── Derived from live VyOS config ─────────────────────────────────────────
  const configStatus = useMemo(() => {
    if (!routerConfig) return null;
    const bgpCfg = routerConfig.protocols?.bgp;
    const fwCfg = routerConfig.firewall;
    const dhcpCfg = routerConfig.service?.['dhcp-server'];
    const wgCfg = routerConfig.interfaces?.wireguard;
    return {
      bgp: !!bgpCfg,
      bgpPeers: Object.keys(bgpCfg?.neighbor || {}).length,
      bgpAs: bgpCfg?.['local-as'] ?? bgpCfg?.['system-as'] ?? bgpCfg?.parameters?.['local-as'],
      ospf: !!routerConfig.protocols?.ospf,
      isis: !!routerConfig.protocols?.isis,
      firewall: !!(fwCfg?.ipv4 || fwCfg?.ipv6 || fwCfg?.name),
      fwPolicies: Object.keys(fwCfg?.ipv4?.name || fwCfg?.name || {}).length,
      dhcp: !!dhcpCfg,
      dhcpPools: Object.keys(dhcpCfg?.['shared-network-name'] || {}).length,
      wireguard: !!wgCfg,
      wgPeers: Object.values(wgCfg || {}).reduce((n: number, w: any) => n + Object.keys(w?.peer || {}).length, 0) as number,
      openvpn: !!routerConfig.interfaces?.openvpn,
      ssh: !!routerConfig.service?.ssh,
      dns: !!routerConfig.service?.dns?.forwarding,
      ntp: !!routerConfig.system?.ntp,
      snmp: !!routerConfig.service?.snmp,
    };
  }, [routerConfig]);

  const staticRoutes = useMemo(() => {
    const routes: any[] = [];
    const s = routerConfig?.protocols?.static;
    if (!s) return routes;
    Object.entries(s.route || {}).forEach(([dest, d]: any) => {
      if (d.blackhole) {
        routes.push({ dest, via: 'Blackhole', distance: d.blackhole?.distance || '254', proto: 'IPv4', type: 'blackhole' });
      } else {
        Object.entries(d['next-hop'] || {}).forEach(([nh, nhd]: any) =>
          routes.push({ dest, via: nh, distance: nhd?.distance || '1', proto: 'IPv4', type: 'static' }));
      }
    });
    Object.entries(s.route6 || {}).forEach(([dest, d]: any) => {
      Object.entries((d as any)['next-hop'] || {}).forEach(([nh, nhd]: any) =>
        routes.push({ dest, via: nh, distance: nhd?.distance || '1', proto: 'IPv6', type: 'static' }));
    });
    return routes;
  }, [routerConfig]);

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

  // ── Rendering helpers ─────────────────────────────────────────────────────
  const renderInterfaces = () => {
    if (!latest?.interfaces) return (
      <tr><td colSpan={5} className="py-6 text-center text-sm text-gray-400 italic">No interface data yet — waiting for next poll.</td></tr>
    );
    const root = getIfaceRoot(latest.interfaces);
    const rows: any[] = [];
    Object.entries(root).forEach(([type, ifaces]: [string, any]) => {
      if (typeof ifaces !== 'object') return;
      Object.entries(ifaces).forEach(([name, data]: [string, any]) => {
        const state = data?.state ?? data?.['oper-state'];
        const addr = Array.isArray(data?.address) ? data.address[0] : (data?.address || '—');
        rows.push(
          <tr key={`${type}-${name}`} className="text-sm hover:bg-gray-50 dark:hover:bg-gray-700/50 transition">
            <td className="py-3 font-mono font-medium">{name}
              <span className="ml-1.5 text-xs text-gray-400 font-sans font-normal">({type})</span>
            </td>
            <td className="py-3">
              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${state === 'up' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400'}`}>
                {state ? state.toUpperCase() : 'N/A'}
              </span>
            </td>
            <td className="py-3 font-mono text-xs">{addr}</td>
            <td className="py-3 text-xs text-blue-600">{formatBytes(getIfaceRx(data))}</td>
            <td className="py-3 text-xs text-purple-600">{formatBytes(getIfaceTx(data))}</td>
          </tr>
        );
      });
    });
    return rows;
  };

  const renderBGP = () => {
    const neighbors = extractBgpNeighbors(latest?.bgp_neighbors);
    if (!neighbors || Object.keys(neighbors).length === 0)
      return <p className="text-sm text-gray-400 italic">No BGP neighbors configured.</p>;
    return Object.entries(neighbors).map(([peer, data]: [string, any]) => {
      const state = data?.state ?? data?.['session-state'];
      const remoteAs = data?.['remote-as'] ?? data?.remote_as;
      return (
        <div key={peer} className="flex items-center justify-between py-2 border-b border-gray-100 dark:border-gray-700 last:border-0">
          <div>
            <div className="font-mono text-sm font-medium">{peer}</div>
            <div className="text-xs text-gray-400">{remoteAs ? `AS ${remoteAs}` : 'Remote AS unknown'}</div>
          </div>
          <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${state === 'Established' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
            {state || 'Configured'}
          </span>
        </div>
      );
    });
  };

  useEffect(() => {
    fetchData();
    const iv = setInterval(fetchData, 30000);
    return () => clearInterval(iv);
  }, [id]);

  if (loading) return (
    <div className="flex justify-center items-center min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600" />
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <Navbar />
      <div className="max-w-7xl mx-auto p-6 space-y-6">

        {/* ── Header ── */}
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{routerInfo?.name}</h1>
            <div className="flex items-center gap-3 mt-1 text-sm text-gray-500">
              <span className="flex items-center gap-1"><Server className="w-3.5 h-3.5" />{routerInfo?.hostname}</span>
              {routerInfo?.site && <><span>·</span><span>{routerInfo.site}</span></>}
              {vyosInfo?.version && <><span>·</span><span className="text-blue-600 font-medium">{vyosInfo.version}</span></>}
            </div>
          </div>
          <div className="flex items-center gap-3">
            {lastUpdated && (
              <span className="text-xs text-gray-400 flex items-center gap-1">
                <RefreshCw className="w-3 h-3" />
                {lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
              </span>
            )}
            <span className={`px-3 py-1 rounded-full text-xs font-semibold uppercase ${routerInfo?.status === 'online' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
              {routerInfo?.status}
            </span>
          </div>
        </div>

        {/* ── KPI Cards ── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiCard icon={<Cpu className="w-5 h-5 text-blue-500" />} label="CPU" value={cardStats.cpu} color="blue" />
          <KpiCard icon={<Activity className="w-5 h-5 text-emerald-500" />} label="Memory" value={cardStats.mem} color="emerald" />
          <KpiCard icon={<ArrowDown className="w-5 h-5 text-sky-500" />} label="Total RX" value={cardStats.rx} color="sky" />
          <KpiCard icon={<ArrowUp className="w-5 h-5 text-purple-500" />} label="Total TX" value={cardStats.tx} color="purple" />
        </div>

        {/* ── Config Status Badges ── */}
        {configStatus && (
          <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-4">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Configuration Status</p>
            <div className="flex flex-wrap gap-2">
              <ServiceBadge icon={<GitBranch className="w-3.5 h-3.5" />} label="BGP" active={configStatus.bgp}
                detail={configStatus.bgp ? `${configStatus.bgpPeers} peer${configStatus.bgpPeers !== 1 ? 's' : ''}${configStatus.bgpAs ? ` · AS${configStatus.bgpAs}` : ''}` : undefined} />
              <ServiceBadge icon={<Network className="w-3.5 h-3.5" />} label="OSPF" active={configStatus.ospf} />
              <ServiceBadge icon={<Globe className="w-3.5 h-3.5" />} label="IS-IS" active={configStatus.isis} />
              <ServiceBadge icon={<ShieldCheck className="w-3.5 h-3.5" />} label="Firewall" active={configStatus.firewall}
                detail={configStatus.firewall && configStatus.fwPolicies ? `${configStatus.fwPolicies} polic${configStatus.fwPolicies !== 1 ? 'ies' : 'y'}` : undefined} />
              <ServiceBadge icon={<HardDrive className="w-3.5 h-3.5" />} label="DHCP" active={configStatus.dhcp}
                detail={configStatus.dhcp ? `${configStatus.dhcpPools} pool${configStatus.dhcpPools !== 1 ? 's' : ''}` : undefined} />
              <ServiceBadge icon={<Radio className="w-3.5 h-3.5" />} label="WireGuard" active={configStatus.wireguard}
                detail={configStatus.wireguard ? `${configStatus.wgPeers} peer${configStatus.wgPeers !== 1 ? 's' : ''}` : undefined} />
              <ServiceBadge icon={<Lock className="w-3.5 h-3.5" />} label="OpenVPN" active={configStatus.openvpn} />
              <ServiceBadge icon={<TerminalSquare className="w-3.5 h-3.5" />} label="SSH" active={configStatus.ssh} />
              <ServiceBadge icon={<Globe className="w-3.5 h-3.5" />} label="DNS Fwd" active={configStatus.dns} />
              <ServiceBadge icon={<Wifi className="w-3.5 h-3.5" />} label="SNMP" active={configStatus.snmp} />
            </div>
          </div>
        )}

        {/* ── Main Grid ── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

          {/* Left column */}
          <div className="lg:col-span-2 space-y-6">

            {/* Traffic Chart */}
            <Card title="Traffic History (Mbps)">
              <div className="h-52">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={metrics}>
                    <defs>
                      <linearGradient id="grad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.15} />
                        <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis dataKey="time" axisLine={false} tickLine={false} tick={{ fontSize: 11 }} dy={8} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11 }} width={36} />
                    <Tooltip contentStyle={{ borderRadius: '10px', border: 'none', boxShadow: '0 4px 20px rgba(0,0,0,0.1)', fontSize: 12 }}
                      formatter={(v: any) => [`${v} Mbps`, 'Throughput']} />
                    <Area type="monotone" dataKey="throughput" stroke="#3b82f6" strokeWidth={2} fillOpacity={1} fill="url(#grad)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </Card>

            {/* Interfaces */}
            <Card title="Interfaces">
              <div className="overflow-x-auto -mx-6 px-6">
                <table className="w-full text-left">
                  <thead>
                    <tr className="text-xs text-gray-400 uppercase border-b border-gray-100 dark:border-gray-700">
                      <th className="pb-2 font-medium">Interface</th>
                      <th className="pb-2 font-medium">State</th>
                      <th className="pb-2 font-medium">IP Address</th>
                      <th className="pb-2 font-medium">RX</th>
                      <th className="pb-2 font-medium">TX</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50 dark:divide-gray-700/50">
                    {renderInterfaces()}
                  </tbody>
                </table>
              </div>
            </Card>

            {/* Static Routes */}
            {staticRoutes.length > 0 && (
              <Card title={`Static Routes (${staticRoutes.length})`}>
                <div className="overflow-x-auto -mx-6 px-6">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="text-xs text-gray-400 uppercase border-b border-gray-100 dark:border-gray-700">
                        <th className="pb-2 font-medium">Destination</th>
                        <th className="pb-2 font-medium">Next Hop</th>
                        <th className="pb-2 font-medium">Distance</th>
                        <th className="pb-2 font-medium">Proto</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50 dark:divide-gray-700/50">
                      {staticRoutes.map((r, i) => (
                        <tr key={i} className="text-sm hover:bg-gray-50 dark:hover:bg-gray-700/50 transition">
                          <td className="py-2.5 font-mono font-medium">{r.dest}</td>
                          <td className={`py-2.5 font-mono text-xs ${r.type === 'blackhole' ? 'text-red-500' : 'text-gray-600 dark:text-gray-400'}`}>{r.via}</td>
                          <td className="py-2.5 text-xs text-gray-500">{r.distance}</td>
                          <td className="py-2.5">
                            <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${r.proto === 'IPv6' ? 'bg-purple-100 text-purple-600' : 'bg-blue-100 text-blue-600'}`}>{r.proto}</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            )}

            {/* DHCP Pools */}
            {dhcpPools.length > 0 && (
              <Card title={`DHCP Server Pools (${dhcpPools.length})`}>
                <div className="space-y-2">
                  {dhcpPools.map((p, i) => (
                    <div key={i} className="flex items-center justify-between py-2 border-b border-gray-100 dark:border-gray-700 last:border-0">
                      <div>
                        <div className="font-medium text-sm">{p.name}</div>
                        <div className="font-mono text-xs text-gray-400">{p.subnet}</div>
                      </div>
                      <div className="text-right text-xs text-gray-500">
                        {p.start && p.stop ? <div>{p.start} – {p.stop}</div> : null}
                        {p.router ? <div className="text-gray-400">GW {p.router}</div> : null}
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            )}
          </div>

          {/* Right column */}
          <div className="space-y-6">

            {/* System Info */}
            <Card title="System">
              <div className="space-y-2.5">
                <InfoRow label="Hostname" value={vyosInfo?.hostname || routerInfo?.hostname || '—'} mono />
                <InfoRow label="Version" value={vyosInfo?.version || routerInfo?.version || '—'} />
                <InfoRow label="Last Seen" value={routerInfo?.last_seen ? new Date(routerInfo.last_seen).toLocaleString() : '—'} />
                {routerConfig?.system?.['host-name'] && (
                  <InfoRow label="Config Name" value={routerConfig.system['host-name']} mono />
                )}
                {routerConfig?.system?.['domain-name'] && (
                  <InfoRow label="Domain" value={routerConfig.system['domain-name']} mono />
                )}
                {routerConfig?.service?.ssh && (
                  <InfoRow label="SSH Port" value={routerConfig.service.ssh.port || '22'} />
                )}
                {configStatus?.ntp && routerConfig?.system?.ntp?.server && (
                  <InfoRow label="NTP Servers" value={Object.keys(routerConfig.system.ntp.server).slice(0, 2).join(', ')} mono />
                )}
              </div>
            </Card>

            {/* BGP */}
            <Card title="BGP Neighbors">
              {configStatus?.bgpAs && (
                <div className="mb-3 pb-3 border-b border-gray-100 dark:border-gray-700">
                  <span className="text-xs text-gray-400">Local AS </span>
                  <span className="font-mono font-semibold text-sm">{configStatus.bgpAs}</span>
                </div>
              )}
              {renderBGP()}
            </Card>

            {/* DNS Forwarders */}
            {configStatus?.dns && routerConfig?.service?.dns?.forwarding && (
              <Card title="DNS Forwarding">
                <div className="space-y-1.5">
                  {routerConfig.service.dns.forwarding['name-server'] && (
                    (Array.isArray(routerConfig.service.dns.forwarding['name-server'])
                      ? routerConfig.service.dns.forwarding['name-server']
                      : Object.keys(routerConfig.service.dns.forwarding['name-server'])
                    ).map((ns: string) => (
                      <div key={ns} className="font-mono text-sm text-gray-600 dark:text-gray-400 flex items-center gap-2">
                        <Globe className="w-3.5 h-3.5 text-blue-400 flex-shrink-0" />{ns}
                      </div>
                    ))
                  )}
                  {routerConfig.service.dns.forwarding['listen-address'] && (
                    <div className="pt-1 text-xs text-gray-400">
                      Listen: {Array.isArray(routerConfig.service.dns.forwarding['listen-address'])
                        ? routerConfig.service.dns.forwarding['listen-address'].join(', ')
                        : routerConfig.service.dns.forwarding['listen-address']}
                    </div>
                  )}
                </div>
              </Card>
            )}

            {/* Operational Tasks */}
            <div className="bg-gradient-to-br from-blue-600 to-blue-700 rounded-2xl p-5 text-white">
              <h4 className="font-bold mb-1">Quick Actions</h4>
              <p className="text-blue-200 text-xs mb-4">Run operational commands on this router.</p>
              <div className="space-y-2">
                <button className="w-full py-2 bg-white/10 hover:bg-white/20 rounded-lg text-sm font-medium transition flex items-center justify-center gap-2">
                  <Route className="w-4 h-4" /> View Routes
                </button>
                <button className="w-full py-2 bg-white/10 hover:bg-white/20 rounded-lg text-sm font-medium transition flex items-center justify-center gap-2">
                  <TerminalSquare className="w-4 h-4" /> CLI Console
                </button>
              </div>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function KpiCard({ icon, label, value, color }: any) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl p-5 border border-gray-200 dark:border-gray-700">
      <div className="flex items-center gap-2 mb-2">
        {icon}
        <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">{label}</span>
      </div>
      <div className="text-2xl font-bold text-gray-900 dark:text-white">{value}</div>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 border border-gray-200 dark:border-gray-700">
      <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider mb-4">{title}</h3>
      {children}
    </div>
  );
}

function ServiceBadge({ icon, label, active, detail }: any) {
  return (
    <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition ${
      active
        ? 'bg-green-50 text-green-700 border-green-200 dark:bg-green-900/20 dark:text-green-400 dark:border-green-800'
        : 'bg-gray-50 text-gray-400 border-gray-200 dark:bg-gray-800 dark:border-gray-700'
    }`}>
      {active ? <CheckCircle2 className="w-3 h-3 flex-shrink-0" /> : <XCircle className="w-3 h-3 flex-shrink-0" />}
      {icon}
      <span>{label}</span>
      {active && detail && <span className="opacity-70">· {detail}</span>}
    </div>
  );
}

function InfoRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex justify-between items-baseline gap-2">
      <span className="text-xs text-gray-400 flex-shrink-0">{label}</span>
      <span className={`text-sm text-gray-700 dark:text-gray-300 truncate text-right ${mono ? 'font-mono' : ''}`}>{value}</span>
    </div>
  );
}
