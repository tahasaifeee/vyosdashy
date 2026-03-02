from typing import Any, List

from fastapi import APIRouter, Body, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from app.api import deps
from app.models.router import Router
from app.models.user import User
from app.schemas.router import Router as RouterSchema, RouterCreate, RouterUpdate

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
    db: AsyncSession = Depends(deps.get_db),
    router_in: RouterCreate,
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    """
    Create new router.
    """
    router = Router(**router_in.dict())
    db.add(router)
    await db.commit()
    await db.refresh(router)
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
    
    from app.services.vyos import VyOSClient
    client = VyOSClient(hostname=router.hostname, api_key=router.api_key)
    is_online = client.test_connection()
    
    # Update status in DB
    from app.models.router import RouterStatus
    router.status = RouterStatus.ONLINE if is_online else RouterStatus.OFFLINE
    import datetime
    router.last_seen = datetime.datetime.now()
    
    db.add(router)
    await db.commit()
    await db.refresh(router)
    
    return {"id": id, "name": router.name, "is_online": is_online}

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
