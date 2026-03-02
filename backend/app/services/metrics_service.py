import asyncio
from datetime import datetime
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from app.models.router import Router, RouterStatus
from app.models.metrics import RouterMetrics
from app.services.vyos import VyOSClient
from app.core.database import AsyncSessionLocal

class MetricsService:
    @staticmethod
    async def collect_metrics_for_router(db: AsyncSession, router: Router):
        client = VyOSClient(hostname=router.hostname, api_key=router.api_key)
        
        # 1. Check Connectivity
        is_online = client.test_connection()
        router.status = RouterStatus.ONLINE if is_online else RouterStatus.OFFLINE
        router.last_seen = datetime.now()
        
        if is_online:
            # 2. Fetch Detailed Metrics
            try:
                # Parallel fetch if possible, but requests is synchronous
                interfaces_res = client.get_interface_stats()
                bgp_res = client.get_bgp_summary()
                
                # Create Metric Entry
                metrics = RouterMetrics(
                    router_id=router.id,
                    interfaces=interfaces_res.get("data"),
                    bgp_neighbors=bgp_res.get("data"),
                    # Add cpu/mem/uptime later when we finalize the command path
                )
                db.add(metrics)
            except Exception as e:
                print(f"Error fetching metrics for {router.name}: {e}")
        
        db.add(router)
        await db.commit()

    @staticmethod
    async def collect_all_metrics():
        async with AsyncSessionLocal() as db:
            result = await db.execute(select(Router).where(Router.is_enabled == True))
            routers = result.scalars().all()
            
            # Use gather to process in parallel
            tasks = [MetricsService.collect_metrics_for_router(db, r) for r in routers]
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
        
        # Poll every 30 seconds as per plan
        await asyncio.sleep(30)
