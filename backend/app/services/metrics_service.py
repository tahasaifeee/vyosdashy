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
                    interfaces_res = await client.get_interface_stats()
                    bgp_res = await client.get_bgp_summary()

                    iface_data = interfaces_res.get("data")
                    bgp_data = bgp_res.get("data") if bgp_res.get("success") else None

                    # Log what we got so issues are visible in `docker logs`
                    print(f"[{router.name}] interfaces success={interfaces_res.get('success')}, "
                          f"data_type={type(iface_data).__name__}")
                    if not interfaces_res.get("success"):
                        print(f"[{router.name}] interfaces error: {interfaces_res.get('error')}")

                    metrics = RouterMetrics(
                        router_id=router.id,
                        interfaces=iface_data if isinstance(iface_data, dict) else None,
                        bgp_neighbors=bgp_data if isinstance(bgp_data, dict) else None,
                        cpu_usage=0.0,
                        memory_usage=0.0,
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
