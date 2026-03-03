import asyncio
import datetime
from typing import Any, List
from datetime import timezone

from fastapi import APIRouter, BackgroundTasks, Body, Depends, HTTPException, status, Request
from fastapi.responses import JSONResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from pydantic import ValidationError

from app.api import deps
from app.models.router import Router, RouterStatus
from app.models.user import User
from app.schemas.router import Router as RouterSchema, RouterCreate, RouterUpdate
from app.services.vyos import VyOSClient
from app.schemas.info import InfoQueryParams

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

    # Run fetches concurrently
    config_res, info_data = await asyncio.gather(
        client.get_config([]),
        client.get_version_info(),
    )

    config_data = config_res.get("data") if config_res.get("success") else {}

    # Ensure hostname is populated from config if not in info
    if not info_data.get("hostname") and config_data.get("system", {}).get("host-name"):
        info_data["hostname"] = config_data["system"]["host-name"]

    # Update database version if we found it
    if info_data.get("version") and info_data["version"] != "N/A":
        router_obj.version = info_data["version"]
        db.add(router_obj)
        await db.commit()
        await db.refresh(router_obj)

    return {
        "config": config_data,
        "info": info_data,
        "db_router": router_obj # Pass the refreshed router object
    }

@router.get("/{id}/info")
async def get_router_info_proxy(
    request: Request,
    id: int,
    db: AsyncSession = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    """
    Proxy the /info endpoint of a specific VyOS router with strict validation.
    """
    try:
        raw_params = dict(request.query_params)
        params = InfoQueryParams(**raw_params)
        
        result = await db.execute(select(Router).where(Router.id == id))
        router_obj = result.scalars().first()
        if not router_obj:
            raise HTTPException(status_code=404, detail="Router not found")

        client = VyOSClient(hostname=router_obj.hostname, api_key=router_obj.api_key)
        # Convert internal string params back to bools for the client
        return await client.get_info(
            version=(params.version == "true"), 
            hostname=(params.hostname == "true")
        )
    except ValidationError as e:
        err = e.errors()[0]
        error_msg = f"{{'type': '{err['type']}', 'loc': {err['loc']}, 'msg': '{err['msg']}', 'input': '{err['input']}'}}"
        return JSONResponse(status_code=400, content={"success": False, "error": error_msg, "data": None})

@router.get("/{id}/routes")
async def get_router_routes(
    *,
    db: AsyncSession = Depends(deps.get_db),
    id: int,
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    """
    Fetch live IPv4 routing table.
    """
    result = await db.execute(select(Router).where(Router.id == id))
    router_obj = result.scalars().first()
    if not router_obj:
        raise HTTPException(status_code=404, detail="Router not found")

    client = VyOSClient(hostname=router_obj.hostname, api_key=router_obj.api_key)
    routes = await client.get_routing_table()
    return routes or []

@router.get("/{id}/logs")
async def get_router_logs(
    *,
    db: AsyncSession = Depends(deps.get_db),
    id: int,
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    """
    Fetch last system logs.
    """
    result = await db.execute(select(Router).where(Router.id == id))
    router_obj = result.scalars().first()
    if not router_obj:
        raise HTTPException(status_code=404, detail="Router not found")

    client = VyOSClient(hostname=router_obj.hostname, api_key=router_obj.api_key)
    logs = await client.get_system_logs()
    return logs or []

@router.get("/{id}/connections")
async def get_router_connections(
    *,
    db: AsyncSession = Depends(deps.get_db),
    id: int,
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    """
    Fetch connection statistics.
    """
    result = await db.execute(select(Router).where(Router.id == id))
    router_obj = result.scalars().first()
    if not router_obj:
        raise HTTPException(status_code=404, detail="Router not found")

    client = VyOSClient(hostname=router_obj.hostname, api_key=router_obj.api_key)
    stats = await client.get_active_connections()
    return {"stats": stats}

@router.post("/{id}/ping")
async def ping_from_router(
    *,
    db: AsyncSession = Depends(deps.get_db),
    id: int,
    host: str = Body(..., embed=True),
    count: int = Body(4, embed=True),
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    """
    Run ping command from the router to a target host.
    """
    result = await db.execute(select(Router).where(Router.id == id))
    router_obj = result.scalars().first()
    if not router_obj:
        raise HTTPException(status_code=404, detail="Router not found")

    client = VyOSClient(hostname=router_obj.hostname, api_key=router_obj.api_key)
    output = await client.ping(host, count)
    return {"output": output}

@router.post("/{id}/config/timezone")
async def update_router_timezone(
    *,
    db: AsyncSession = Depends(deps.get_db),
    id: int,
    timezone: str = Body(..., embed=True),
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    """
    Update the system timezone on the VyOS router.
    """
    result = await db.execute(select(Router).where(Router.id == id))
    router_obj = result.scalars().first()
    if not router_obj:
        raise HTTPException(status_code=404, detail="Router not found")

    client = VyOSClient(hostname=router_obj.hostname, api_key=router_obj.api_key)
    
    # 1. Set config
    res_set = await client.set_config(["system", "time-zone", timezone])
    if not res_set.get("success"):
        raise HTTPException(status_code=400, detail=f"Failed to set timezone: {res_set.get('error') or res_set.get('data')}")
    
    # 2. Save config
    res_save = await client.save()
    
    return {"success": True, "message": f"Timezone updated to {timezone}"}

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
