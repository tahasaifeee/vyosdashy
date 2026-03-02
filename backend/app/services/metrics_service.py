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
            router.last_seen = datetime.now()
            
            if is_online:
                try:
                    interfaces_res = await client.get_interface_stats()
                    bgp_res = await client.get_bgp_summary()
                    metrics = RouterMetrics(
                        router_id=router.id,
                        interfaces=interfaces_res.get("data"),
                        bgp_neighbors=bgp_res.get("data"),
                    )
                    db.add(metrics)
                except Exception as e:
                    print(f"Error fetching metrics for {router.name}: {e}")
            
            db.add(router)
            await db.commit()

    @staticmethod
    async def collect_metrics_for_router(router: Router):
        async with AsyncSessionLocal() as db:
            # Re-merge the router into the current session to avoid 'detached' error
            router = await db.merge(router)
            
            client = VyOSClient(hostname=router.hostname, api_key=router.api_key)
            
            # 1. Check Connectivity
            test_res = await client.test_connection()
            is_online = test_res.get("success") is True
            router.status = RouterStatus.ONLINE if is_online else RouterStatus.OFFLINE
            router.last_seen = datetime.now()
            
            if is_online:
                # 2. Fetch Detailed Metrics
                try:
                    # Async fetch
                    interfaces_res = await client.get_interface_stats()
                    bgp_res = await client.get_bgp_summary()
                    
                    # Create Metric Entry
                    metrics = RouterMetrics(
                        router_id=router.id,
                        interfaces=interfaces_res.get("data"),
                        bgp_neighbors=bgp_res.get("data"),
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
            
            # Use gather to process in parallel, but with separate sessions
            tasks = [MetricsService.collect_metrics_for_router(r) for r in routers]
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
