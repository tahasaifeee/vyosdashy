from typing import Any, List

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from app.api import deps
from app.models.metrics import RouterMetrics
from app.models.router import Router
from app.models.user import User

router = APIRouter()

@router.get("/{router_id}/latest")
async def get_latest_metrics(
    router_id: int,
    db: AsyncSession = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    """
    Get latest metrics for a specific router.
    """
    router_result = await db.execute(select(Router).where(Router.id == router_id))
    if not router_result.scalars().first():
        raise HTTPException(status_code=404, detail="Router not found")

    stmt = (
        select(RouterMetrics)
        .where(RouterMetrics.router_id == router_id)
        .order_by(RouterMetrics.timestamp.desc())
        .limit(1)
    )
    result = await db.execute(stmt)
    metrics = result.scalars().first()
    if not metrics:
        return {"status": "offline", "data": None}
    return {
        "id": metrics.id,
        "router_id": metrics.router_id,
        "timestamp": metrics.timestamp,
        "cpu_usage": metrics.cpu_usage,
        "memory_usage": metrics.memory_usage,
        "uptime": metrics.uptime,
        "interfaces": metrics.interfaces,
        "bgp_neighbors": metrics.bgp_neighbors,
    }

@router.get("/{router_id}/history")
async def get_metrics_history(
    router_id: int,
    limit: int = Query(default=60, ge=1, le=1000),
    db: AsyncSession = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    """
    Get historical metrics for a router (for charts).
    """
    router_result = await db.execute(select(Router).where(Router.id == router_id))
    if not router_result.scalars().first():
        raise HTTPException(status_code=404, detail="Router not found")

    stmt = (
        select(RouterMetrics)
        .where(RouterMetrics.router_id == router_id)
        .order_by(RouterMetrics.timestamp.desc())
        .limit(limit)
    )
    result = await db.execute(stmt)
    metrics = result.scalars().all()
    # Reverse to get chronological order for charts
    return metrics[::-1]
