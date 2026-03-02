from typing import Any, List

from fastapi import APIRouter, Depends, HTTPException
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
    return metrics

@router.get("/{router_id}/history")
async def get_metrics_history(
    router_id: int,
    limit: int = 60, # ~30 mins of history if polled every 30s
    db: AsyncSession = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    """
    Get historical metrics for a router (for charts).
    """
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
