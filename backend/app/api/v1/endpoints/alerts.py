from typing import Any, List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import desc, func

from app.api import deps
from app.models.alert import Alert
from app.models.user import User

router = APIRouter()

@router.get("/", response_model=List[Any])
async def read_alerts(
    db: AsyncSession = Depends(deps.get_db),
    skip: int = 0,
    limit: int = 50,
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    """
    Retrieve alerts.
    """
    result = await db.execute(select(Alert).order_by(desc(Alert.timestamp)).offset(skip).limit(limit))
    alerts = result.scalars().all()
    # Map to dict for easier JSON response if needed, or use a schema
    return alerts

@router.get("/unread-count")
async def get_unread_count(
    db: AsyncSession = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    """
    Get count of unread alerts.
    """
    result = await db.execute(select(func.count()).where(Alert.is_read == False).select_from(Alert))
    count = result.scalar_one()
    return {"count": count}

@router.post("/mark-all-read")
async def mark_all_read(
    db: AsyncSession = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    """
    Mark all alerts as read.
    """
    result = await db.execute(select(Alert).where(Alert.is_read == False))
    alerts = result.scalars().all()
    for alert in alerts:
        alert.is_read = True
    await db.commit()
    return {"status": "ok"}
