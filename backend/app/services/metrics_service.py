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
        # Example: 10:20:30 up 1 day,  2:30,  1 user,  load average: 0.05, 0.10, 0.15
        load_match = re.search(r"load average:\s+([\d.]+),\s+([\d.]+),\s+([\d.]+)", text)
        uptime_seconds = 0
        load_avg = {"1m": 0.0, "5m": 0.0, "15m": 0.0}
        
        if load_match:
            load_avg = {
                "1m": float(load_match.group(1)),
                "5m": float(load_match.group(2)),
                "15m": float(load_match.group(3))
            }
        
        # Simple uptime parsing (very approximate)
        if "up" in text:
            uptime_part = text.split("up")[1].split(",")[0].strip()
            # This is a placeholder; real parsing would be more complex
            uptime_seconds = 3600 # default
            
        return uptime_seconds, load_avg

    @staticmethod
    async def collect_metrics_by_id(router_id: int):
        async with AsyncSessionLocal() as db:
            result = await db.execute(select(Router).where(Router.id == router_id))
            router = result.scalars().first()
            if not router:
                return

            old_status = router.status
            client = VyOSClient(hostname=router.hostname, api_key=router.api_key)
            test_res = await client.test_connection()
            is_online = test_res.get("success") is True
            new_status = RouterStatus.ONLINE if is_online else RouterStatus.OFFLINE
            router.status = new_status
            router.last_seen = datetime.now(timezone.utc)

            # Alert on status change
            if old_status != RouterStatus.UNKNOWN and old_status != new_status:
                severity = AlertSeverity.CRITICAL if new_status == RouterStatus.OFFLINE else AlertSeverity.INFO
                message = f"Router '{router.name}' status changed to {new_status}"
                db.add(Alert(router_id=router.id, severity=severity, message=message, alert_type="status_change"))

            if is_online:
                try:
                    # Attempt concurrent fetches
                    iface_config_res, bgp_config_res, counters, sys_info = await asyncio.gather(
                        client.get_interface_config(),    # REST /retrieve
                        client.get_bgp_config(),          # REST /retrieve
                        client.get_interface_counters(),  # GraphQL
                        client.get_system_info(),         # GraphQL
                    )

                    iface_data = iface_config_res.get("data") if iface_config_res.get("success") else None
                    bgp_data = bgp_config_res.get("data") if bgp_config_res.get("success") else None

                    # Merge GraphQL interface counters
                    if isinstance(counters, list) and isinstance(iface_data, dict):
                        for counter in counters:
                            ifname = counter.get("ifname", "")
                            for iface_type, ifaces in iface_data.items():
                                if isinstance(ifaces, dict) and ifname in ifaces:
                                    ifaces[ifname]["rx-bytes"] = counter.get("rx_bytes", 0)
                                    ifaces[ifname]["tx-bytes"] = counter.get("tx_bytes", 0)
                                    ifaces[ifname]["rx-packets"] = counter.get("rx_packets", 0)
                                    ifaces[ifname]["tx-packets"] = counter.get("tx_packets", 0)

                    # Initialize default metrics
                    cpu_usage = 0.0
                    memory_usage = 0.0
                    uptime = 0
                    load_avg = {"1m": 0.0, "5m": 0.0, "15m": 0.0}
                    active_sessions = 0

                    # Use GraphQL if available
                    if isinstance(sys_info, dict):
                        cpu_load = sys_info.get("cpu_load_average") or {}
                        load_avg = {
                            "1m": float(cpu_load.get("one_minute", 0.0)),
                            "5m": float(cpu_load.get("five_minute", 0.0)),
                            "15m": float(cpu_load.get("fifteen_minute", 0.0))
                        }
                        cpu_usage = load_avg["1m"]
                        mem = sys_info.get("memory") or {}
                        total = mem.get("total", 0)
                        used = mem.get("used", 0)
                        if total > 0:
                            memory_usage = round(used / total * 100, 1)
                        try:
                            uptime = int(sys_info.get("uptime", "0"))
                        except:
                            uptime = 0
                    else:
                        # FALLBACK: Try Legacy /show text commands
                        print(f"[{router.name}] GraphQL unavailable, attempting legacy fallback...")
                        legacy_uptime_text = await client.get_legacy_system_stats()
                        if not legacy_uptime_text.startswith("Error:"):
                            uptime, load_avg = MetricsService.parse_legacy_uptime(legacy_uptime_text)
                            cpu_usage = load_avg["1m"]
                        
                        # We try to mark it online even with config-only data
                        if iface_data:
                            # Use config data as baseline even without counters
                            pass

                    # Ensure we save SOMETHING if the router is reachable
                    metrics = RouterMetrics(
                        router_id=router.id,
                        interfaces=iface_data if isinstance(iface_data, dict) else {},
                        bgp_neighbors=bgp_data if isinstance(bgp_data, dict) else {},
                        cpu_usage=cpu_usage,
                        memory_usage=memory_usage,
                        uptime=uptime,
                        load_average=load_avg,
                        active_sessions=active_sessions
                    )
                    db.add(metrics)

                    # Alerts
                    if cpu_usage > 4.0:
                        db.add(Alert(router_id=router.id, severity=AlertSeverity.WARNING, message=f"High CPU Load ({cpu_usage}) on {router.name}", alert_type="cpu_high"))
                    if memory_usage > 90.0:
                        db.add(Alert(router_id=router.id, severity=AlertSeverity.CRITICAL, message=f"Memory Critical ({memory_usage}%) on {router.name}", alert_type="mem_high"))

                except Exception as e:
                    print(f"Error collecting metrics for {router.name}: {e}")

            db.add(router)
            await db.commit()

    @staticmethod
    async def collect_all_metrics():
        async with AsyncSessionLocal() as db:
            result = await db.execute(select(Router.id).where(Router.is_enabled == True))
            router_ids = result.scalars().all()

        tasks = [MetricsService.collect_metrics_by_id(rid) for rid in router_ids]
        await asyncio.gather(*tasks)


async def run_metrics_collector():
    while True:
        try:
            await MetricsService.collect_all_metrics()
        except Exception as e:
            print(f"Metrics collection failed: {e}")
        await asyncio.sleep(30)
