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
                    interfaces_res, bgp_res, resources_res = await asyncio.gather(
                        client.get_interface_stats(),
                        client.get_bgp_summary(),
                        client.get_resource_usage(),
                    )

                    iface_data = interfaces_res.get("data")
                    bgp_data = bgp_res.get("data") if bgp_res.get("success") else None
                    resources_data = resources_res.get("data")

                    # Log every poll so `docker logs` shows exactly what VyOS returns
                    print(f"[{router.name}] ifaces={interfaces_res.get('success')} "
                          f"type={type(iface_data).__name__} | "
                          f"bgp={bgp_res.get('success')} | "
                          f"resources={resources_res.get('success')} "
                          f"type={type(resources_data).__name__}")
                    if not interfaces_res.get("success"):
                        print(f"[{router.name}] ifaces error: {interfaces_res.get('error')}")
                    if resources_data:
                        print(f"[{router.name}] resources sample: {str(resources_data)[:200]}")

                    # Parse CPU/memory if resources returned a structured dict
                    cpu_usage = 0.0
                    memory_usage = 0.0
                    if isinstance(resources_data, dict):
                        # VyOS may return: {"cpu-load": {"1min": 0.45}, "memory": {"used": ..., "total": ...}}
                        cpu_load = resources_data.get("cpu-load") or resources_data.get("cpu_load", {})
                        if isinstance(cpu_load, dict):
                            cpu_usage = float(cpu_load.get("1min") or cpu_load.get("one-min", 0.0))
                        mem = resources_data.get("memory", {})
                        if isinstance(mem, dict):
                            used = mem.get("used", "")
                            total = mem.get("total", "")
                            # Values may be strings like "2.3 GB" or raw integers
                            try:
                                u = float(str(used).split()[0])
                                t = float(str(total).split()[0])
                                if t > 0:
                                    memory_usage = round(u / t * 100, 1)
                            except (ValueError, IndexError):
                                pass

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
                    print(f"Error fetching metrics for {router.name}: {e}")
                    traceback.print_exc()

            db.add(router)
            await db.commit()

    @staticmethod
    async def collect_all_metrics():
        async with AsyncSessionLocal() as db:
            result = await db.execute(select(Router.id).where(Router.is_enabled == True))
            router_ids = result.scalars().all()

        # Each collect_metrics_by_id opens its own session — safe to gather in parallel
        tasks = [MetricsService.collect_metrics_by_id(rid) for rid in router_ids]
        await asyncio.gather(*tasks)


# Background runner function
async def run_metrics_collector():
    while True:
        try:
            print("Starting metrics collection...")
            await MetricsService.collect_all_metrics()
            print("Metrics collection completed.")
        except Exception as e:
            print(f"Metrics collection failed: {e}")

        # Poll every 30 seconds
        await asyncio.sleep(30)
