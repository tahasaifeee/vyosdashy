import asyncio
from typing import Any, List

from fastapi import APIRouter, BackgroundTasks, Body, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from app.api import deps
from app.models.router import Router
from app.models.user import User
from app.schemas.router import Router as RouterSchema, RouterCreate, RouterUpdate
from app.services.vyos import VyOSClient

router = APIRouter()

@router.get("/", response_model=List[RouterSchema])
async def read_routers(
    db: AsyncSession = Depends(deps.get_db),
    skip: int = 0,
    limit: int = 100,
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    """
    Retrieve routers.
    """
    result = await db.execute(select(Router).offset(skip).limit(limit))
    routers = result.scalars().all()
    return routers

@router.post("/", response_model=RouterSchema)
async def create_router(
    *,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(deps.get_db),
    router_in: RouterCreate,
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    """
    Create new router and trigger immediate connectivity test.
    """
    router = Router(**router_in.dict())
    db.add(router)
    await db.commit()
    await db.refresh(router)

    # Trigger immediate background collection so user doesn't see "Unknown" for 30s
    from app.services.metrics_service import MetricsService
    background_tasks.add_task(MetricsService.collect_metrics_by_id, router.id)

    return router

@router.get("/{id}", response_model=RouterSchema)
async def read_router(
    *,
    db: AsyncSession = Depends(deps.get_db),
    id: int,
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    """
    Get router by ID.
    """
    result = await db.execute(select(Router).where(Router.id == id))
    router = result.scalars().first()
    if not router:
        raise HTTPException(status_code=404, detail="Router not found")
    return router

@router.put("/{id}", response_model=RouterSchema)
async def update_router(
    *,
    db: AsyncSession = Depends(deps.get_db),
    id: int,
    router_in: RouterUpdate,
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    """
    Update a router.
    """
    result = await db.execute(select(Router).where(Router.id == id))
    router = result.scalars().first()
    if not router:
        raise HTTPException(status_code=404, detail="Router not found")
    
    update_data = router_in.dict(exclude_unset=True)
    for field, value in update_data.items():
        setattr(router, field, value)
        
    db.add(router)
    await db.commit()
    await db.refresh(router)
    return router

@router.post("/{id}/test-connection")
async def test_router_connection(
    *,
    db: AsyncSession = Depends(deps.get_db),
    id: int,
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    """
    Test connectivity to a VyOS router.
    """
    result = await db.execute(select(Router).where(Router.id == id))
    router = result.scalars().first()
    if not router:
        raise HTTPException(status_code=404, detail="Router not found")
    
    client = VyOSClient(hostname=router.hostname, api_key=router.api_key)
    test_res, info_res = await asyncio.gather(
        client.test_connection(),
        client.get_info(),
    )
    is_online = test_res.get("success") is True

    from app.models.router import RouterStatus
    from datetime import timezone
    import datetime
    router.status = RouterStatus.ONLINE if is_online else RouterStatus.OFFLINE
    router.last_seen = datetime.datetime.now(timezone.utc)
    if info_res.get("success") and info_res.get("data"):
        router.version = info_res["data"].get("version")
    
    db.add(router)
    await db.commit()
    await db.refresh(router)
    
    return {
        "id": id, 
        "name": router.name, 
        "is_online": is_online,
        "error": test_res.get("error")
    }

@router.get("/{id}/config")
async def get_router_config(
    *,
    db: AsyncSession = Depends(deps.get_db),
    id: int,
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    """
    Fetch live VyOS full configuration and system info for the dashboard.
    Returns: { config: {...}, info: { version, hostname, banner } }
    """
    result = await db.execute(select(Router).where(Router.id == id))
    router_obj = result.scalars().first()
    if not router_obj:
        raise HTTPException(status_code=404, detail="Router not found")

    client = VyOSClient(hostname=router_obj.hostname, api_key=router_obj.api_key)
    config_res, info_res = await asyncio.gather(
        client.get_config([]),
        client.get_info(),
    )
    return {
        "config": config_res.get("data") if config_res.get("success") else {},
        "info": info_res.get("data") if info_res.get("success") else {},
    }


@router.delete("/{id}", response_model=RouterSchema)
async def delete_router(
    *,
    db: AsyncSession = Depends(deps.get_db),
    id: int,
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    """
    Delete a router.
    """
    result = await db.execute(select(Router).where(Router.id == id))
    router = result.scalars().first()
    if not router:
        raise HTTPException(status_code=404, detail="Router not found")
        
    await db.delete(router)
    await db.commit()
    return router
