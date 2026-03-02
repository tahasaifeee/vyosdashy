import asyncio
from sqlalchemy.future import select
from sqlalchemy import text
from app.core.database import AsyncSessionLocal, engine
from app.models.metrics import RouterMetrics
from app.models.router import Router

async def diagnose():
    print("--- Database Diagnosis ---")
    async with AsyncSessionLocal() as db:
        # Check Routers
        result = await db.execute(select(Router))
        routers = result.scalars().all()
        print(f"Total Routers: {len(routers)}")
        for r in routers:
            print(f"  - ID: {r.id}, Name: {r.name}, Status: {r.status}")

        # Check Metrics Count
        result = await db.execute(text("SELECT count(*) FROM router_metrics"))
        count = result.scalar()
        print(f"Total Metric Records: {count}")

        # Check Schema
        try:
            result = await db.execute(text("SELECT * FROM router_metrics LIMIT 1"))
            cols = result.keys()
            print(f"Columns in router_metrics: {list(cols)}")
        except Exception as e:
            print(f"Error reading router_metrics: {e}")

if __name__ == "__main__":
    asyncio.run(diagnose())
