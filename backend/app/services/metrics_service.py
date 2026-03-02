import asyncio
from datetime import datetime, timezone
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from app.models.router import Router, RouterStatus
from app.models.metrics import RouterMetrics
from app.services.vyos import VyOSClient
from app.core.database import AsyncSessionLocal


class MetricsService:
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
            router.status = RouterStatus.ONLINE if is_online else RouterStatus.OFFLINE
            router.last_seen = datetime.now(timezone.utc)

            if is_online:
                try:
                    # Run all fetches concurrently
                    iface_config_res, bgp_config_res, counters, sys_info = await asyncio.gather(
                        client.get_interface_config(),    # REST /retrieve showConfig
                        client.get_bgp_config(),          # REST /retrieve showConfig
                        client.get_interface_counters(),  # GraphQL (None if unavailable)
                        client.get_system_info(),         # GraphQL (None if unavailable)
                    )

                    iface_data = iface_config_res.get("data") if iface_config_res.get("success") else None
                    bgp_data = bgp_config_res.get("data") if bgp_config_res.get("success") else None

                    # Merge GraphQL interface counters into the config data
                    # Counters is a list: [{"ifname": "eth0", "rx_bytes": N, "tx_bytes": N, ...}]
                    if isinstance(counters, list) and isinstance(iface_data, dict):
                        for counter in counters:
                            ifname = counter.get("ifname", "")
                            # Find this interface in the config tree and attach counters
                            for iface_type, ifaces in iface_data.items():
                                if isinstance(ifaces, dict) and ifname in ifaces:
                                    ifaces[ifname]["rx-bytes"] = counter.get("rx_bytes", 0)
                                    ifaces[ifname]["tx-bytes"] = counter.get("tx_bytes", 0)
                                    ifaces[ifname]["rx-packets"] = counter.get("rx_packets", 0)
                                    ifaces[ifname]["tx-packets"] = counter.get("tx_packets", 0)

                    # Parse CPU/memory from GraphQL system info
                    cpu_usage = 0.0
                    memory_usage = 0.0
                    if isinstance(sys_info, dict):
                        cpu_load = sys_info.get("cpu_load_average") or {}
                        cpu_usage = float(cpu_load.get("one_minute", 0.0))

                        mem = sys_info.get("memory") or {}
                        total = mem.get("total", 0)
                        used = mem.get("used", 0)
                        if total and total > 0:
                            memory_usage = round(used / total * 100, 1)

                    # Log what we got on every poll
                    print(
                        f"[{router.name}] iface_config={iface_config_res.get('success')} "
                        f"bgp={bgp_config_res.get('success')} "
                        f"counters={'ok' if counters else 'n/a (no GraphQL)'} "
                        f"sysinfo={'ok' if sys_info else 'n/a (no GraphQL)'}"
                    )

                    metrics = RouterMetrics(
                        router_id=router.id,
                        interfaces=iface_data if isinstance(iface_data, dict) else None,
                        bgp_neighbors=bgp_data if isinstance(bgp_data, dict) else None,
                        cpu_usage=cpu_usage,
                        memory_usage=memory_usage,
                    )
                    db.add(metrics)

                except Exception as e:
                    import traceback
                    print(f"Error collecting metrics for {router.name}: {e}")
                    traceback.print_exc()

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
            print("Starting metrics collection...")
            await MetricsService.collect_all_metrics()
            print("Metrics collection completed.")
        except Exception as e:
            print(f"Metrics collection failed: {e}")
        await asyncio.sleep(30)
