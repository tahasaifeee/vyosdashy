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

                    metrics = RouterMetrics(
                        router_id=router.id,
                        interfaces=interfaces_res.get("data"),
                        bgp_neighbors=bgp_res.get("data"),
                        cpu_usage=0.0,
                        memory_usage=0.0,
                    )
                    db.add(metrics)
                except Exception as e:
                    print(f"Error fetching metrics for {router.name}: {e}")

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
