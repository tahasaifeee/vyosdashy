import asyncio
import re
from datetime import datetime, timezone
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from app.models.router import Router, RouterStatus
from app.models.metrics import RouterMetrics
from app.models.alert import Alert, AlertSeverity
from app.services.vyos import VyOSClient
from app.core.database import AsyncSessionLocal


class MetricsService:
    @staticmethod
    def parse_legacy_uptime(text: str):
        """Parse uptime and load average from 'show system uptime' output."""
        load_avg = {"1m": 0.0, "5m": 0.0, "15m": 0.0}
        uptime_seconds = 0
        
        try:
            # Load Average
            load_match = re.search(r"load average:\s+([\d.]+),\s+([\d.]+),\s+([\d.]+)", text)
            if load_match:
                load_avg = {
                    "1m": float(load_match.group(1)),
                    "5m": float(load_match.group(2)),
                    "15m": float(load_match.group(3))
                }
            
            # Uptime (e.g., "up 2 days, 14:35")
            up_match = re.search(r"up\s+(.*?),\s+\d+:\d+", text)
            if up_match:
                uptime_str = up_match.group(1)
                if "day" in uptime_str:
                    days = int(re.search(r"(\d+)", uptime_str).group(1))
                    uptime_seconds += days * 86400
            
            time_match = re.search(r"(\d+):(\d+)(?::(\d+))?", text)
            if time_match:
                h = int(time_match.group(1))
                m = int(time_match.group(2))
                uptime_seconds += (h * 3600) + (m * 60)
        except:
            pass
            
        return uptime_seconds, load_avg

    @staticmethod
    def parse_legacy_memory(text: str):
        """Parse memory usage percentage from 'show system memory' output."""
        try:
            # Total: 2048 MB, Used: 512 MB
            total_match = re.search(r"Total:\s+(\d+)", text)
            used_match = re.search(r"Used:\s+(\d+)", text)
            if total_match and used_match:
                total = float(total_match.group(1))
                used = float(used_match.group(1))
                if total > 0:
                    return round((used / total) * 100, 1)
            
            # Fallback for alternative format: Mem: 2048 512 ...
            parts = text.split()
            if "Mem:" in parts:
                idx = parts.index("Mem:")
                total = float(parts[idx+1])
                used = float(parts[idx+2])
                return round((used / total) * 100, 1)
        except:
            pass
        return 0.0

    @staticmethod
    def parse_legacy_storage(text: str):
        """Parse storage percentage from 'show system storage' output."""
        try:
            # Look for root partition / and get percentage
            # Example: /dev/sda1       10G  2G   8G  20% /
            match = re.search(r"(\d+)%\s+/$", text, re.MULTILINE)
            if match:
                return float(match.group(1))
        except:
            pass
        return 0.0

    @staticmethod
    def parse_legacy_interface_counters(text: str):
        """Parse counters from 'show interfaces counters' text output."""
        counters = []
        try:
            lines = text.splitlines()
            start_index = -1
            for i, line in enumerate(lines):
                if "Interface" in line and "Rx" in line:
                    start_index = i + 2
                    break
            
            if start_index != -1:
                for line in lines[start_index:]:
                    if not line.strip(): continue
                    parts = line.split()
                    if len(parts) >= 5:
                        counters.append({
                            "ifname": parts[0],
                            "rx_packets": int(parts[1].replace(',', '')),
                            "rx_bytes": int(parts[2].replace(',', '')),
                            "tx_packets": int(parts[3].replace(',', '')),
                            "tx_bytes": int(parts[4].replace(',', ''))
                        })
        except:
            pass
        return counters

    @staticmethod
    async def collect_metrics_by_id(router_id: int):
        async with AsyncSessionLocal() as db:
            result = await db.execute(select(Router).where(Router.id == router_id))
            router = result.scalars().first()
            if not router:
                return

            client = VyOSClient(hostname=router.hostname, api_key=router.api_key)
            test_res = await client.test_connection()
            is_online = test_res.get("success") is True
            
            old_status = router.status
            new_status = RouterStatus.ONLINE if is_online else RouterStatus.OFFLINE
            router.status = new_status
            router.last_seen = datetime.now(timezone.utc)

            if old_status != RouterStatus.UNKNOWN and old_status != new_status:
                db.add(Alert(router_id=router.id, severity=AlertSeverity.CRITICAL if not is_online else AlertSeverity.INFO, 
                             message=f"Router {router.name} is now {new_status}", alert_type="status_change"))

            if is_online:
                # Update metadata
                try:
                    info_data = await client.get_version_info()
                    if info_data.get("version"): router.version = info_data["version"]
                except: pass

                iface_data, bgp_data = {}, {}
                cpu_usage, memory_usage, disk_usage, uptime = 0.0, 0.0, 0.0, 0
                load_avg = {"1m": 0.0, "5m": 0.0, "15m": 0.0}

                # 1. Config (REST)
                try:
                    res_if = await client.get_interface_config()
                    if res_if.get("success") and res_if.get("data"):
                        iface_data = res_if.get("data", {})
                    
                    # If config is empty, try to get at least names via show
                    if not iface_data:
                        iface_text = await client.get_legacy_interface_stats()
                        # Very basic check: if we got text, we know interfaces exist
                        # The UI prefers the structured data from get_interface_config
                except: pass

                try:
                    res_bgp = await client.get_bgp_config()
                    if res_bgp.get("success"): bgp_data = res_bgp.get("data", {})
                except: pass

                # 2. System Metrics
                sys_info = None
                try:
                    sys_info = await client.get_system_info()
                except: pass

                if sys_info and isinstance(sys_info, dict):
                    cpu_l = sys_info.get("cpu_load_average") or {}
                    load_avg = {"1m": float(cpu_l.get("one_minute", 0)), "5m": float(cpu_l.get("five_minute", 0)), "15m": float(cpu_l.get("fifteen_minute", 0))}
                    cpu_usage = load_avg["1m"]
                    mem = sys_info.get("memory") or {}
                    if mem.get("total", 0) > 0:
                        memory_usage = round(mem.get("used", 0) / mem.get("total") * 100, 1)
                    uptime = int(sys_info.get("uptime", 0))
                else:
                    # Legacy Fallback
                    try:
                        up_text = await client.get_legacy_system_stats()
                        uptime, load_avg = MetricsService.parse_legacy_uptime(up_text)
                        cpu_usage = load_avg["1m"]
                        
                        mem_text = await client.get_legacy_memory_stats()
                        memory_usage = MetricsService.parse_legacy_memory(mem_text)
                    except: pass

                # 3. Disk Usage (Always legacy/CLI)
                try:
                    storage_text = await client.get_legacy_storage_stats()
                    disk_usage = MetricsService.parse_legacy_storage(storage_text)
                except: pass

                # 4. Interface Counters
                counters = None
                try:
                    counters = await client.get_interface_counters()
                except: pass

                if not counters:
                    try:
                        c_text = await client.get_legacy_interface_counters()
                        counters = MetricsService.parse_legacy_interface_counters(c_text)
                    except: pass

                if isinstance(counters, list):
                    for c in counters:
                        ifname = c.get("ifname")
                        for _, ifaces in iface_data.items():
                            if isinstance(ifaces, dict) and ifname in ifaces:
                                ifaces[ifname].update({
                                    "rx-bytes": c.get("rx_bytes", 0), "tx-bytes": c.get("tx_bytes", 0),
                                    "rx-packets": c.get("rx_packets", 0), "tx-packets": c.get("tx_packets", 0)
                                })

                metrics = RouterMetrics(
                    router_id=router.id,
                    interfaces=iface_data,
                    bgp_neighbors=bgp_data,
                    cpu_usage=cpu_usage,
                    memory_usage=memory_usage,
                    disk_usage=disk_usage,
                    uptime=uptime,
                    load_average=load_avg,
                    active_sessions=0
                )
                db.add(metrics)

            db.add(router)
            await db.commit()

    @staticmethod
    async def collect_all_metrics():
        async with AsyncSessionLocal() as db:
            result = await db.execute(select(Router.id).where(Router.is_enabled == True))
            ids = result.scalars().all()
        for rid in ids:
            try:
                await MetricsService.collect_metrics_by_id(rid)
            except Exception as e:
                print(f"Error in collection for router {rid}: {e}")

async def run_metrics_collector():
    # Initial delay to let the app start up completely
    await asyncio.sleep(10)
    while True:
        await MetricsService.collect_all_metrics()
        await asyncio.sleep(30)
