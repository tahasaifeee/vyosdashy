import asyncio
import datetime
from typing import Any, List, Dict
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
    router = Router(**router_in.dict())
    db.add(router)
    await db.commit()
    await db.refresh(router)
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
    result = await db.execute(select(Router).where(Router.id == id))
    router = result.scalars().first()
    if not router:
        raise HTTPException(status_code=404, detail="Router not found")
    client = VyOSClient(hostname=router.hostname, api_key=router.api_key)
    test_res, info_res = await asyncio.gather(client.test_connection(), client.get_info())
    is_online = test_res.get("success") is True
    router.status = RouterStatus.ONLINE if is_online else RouterStatus.OFFLINE
    router.last_seen = datetime.datetime.now(timezone.utc)
    if info_res.get("success") and info_res.get("data"):
        router.version = info_res["data"].get("version")
    db.add(router)
    await db.commit()
    await db.refresh(router)
    return {"id": id, "name": router.name, "is_online": is_online, "error": test_res.get("error")}

@router.get("/{id}/config")
async def get_router_config(
    *,
    db: AsyncSession = Depends(deps.get_db),
    id: int,
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    result = await db.execute(select(Router).where(Router.id == id))
    router_obj = result.scalars().first()
    if not router_obj:
        raise HTTPException(status_code=404, detail="Router not found")
    client = VyOSClient(hostname=router_obj.hostname, api_key=router_obj.api_key)
    config_res, info_data = await asyncio.gather(client.get_config([]), client.get_version_info())
    config_data = config_res.get("data") if config_res.get("success") else {}
    if not info_data.get("hostname") and config_data.get("system", {}).get("host-name"):
        info_data["hostname"] = config_data["system"]["host-name"]
    if info_data.get("version") and info_data["version"] != "N/A":
        router_obj.version = info_data["version"]
        db.add(router_obj)
        await db.commit()
        await db.refresh(router_obj)
    return {"config": config_data, "info": info_data, "db_router": RouterSchema.from_orm(router_obj)}

@router.get("/{id}/routes")
async def get_router_routes(
    *,
    db: AsyncSession = Depends(deps.get_db),
    id: int,
    current_user: User = Depends(deps.get_current_user),
) -> Any:
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
    result = await db.execute(select(Router).where(Router.id == id))
    router_obj = result.scalars().first()
    if not router_obj:
        raise HTTPException(status_code=404, detail="Router not found")
    client = VyOSClient(hostname=router_obj.hostname, api_key=router_obj.api_key)
    output = await client.ping(host, count)
    return {"output": output}

@router.post("/{id}/traceroute")
async def traceroute_from_router(
    *,
    db: AsyncSession = Depends(deps.get_db),
    id: int,
    host: str = Body(..., embed=True),
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    result = await db.execute(select(Router).where(Router.id == id))
    router_obj = result.scalars().first()
    if not router_obj:
        raise HTTPException(status_code=404, detail="Router not found")
    client = VyOSClient(hostname=router_obj.hostname, api_key=router_obj.api_key)
    output = await client.traceroute(host)
    return {"output": output}

@router.post("/{id}/monitor/traffic")
async def monitor_traffic_capture(
    *,
    db: AsyncSession = Depends(deps.get_db),
    id: int,
    interface: str = Body(..., embed=True),
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    result = await db.execute(select(Router).where(Router.id == id))
    router_obj = result.scalars().first()
    if not router_obj:
        raise HTTPException(status_code=404, detail="Router not found")
    client = VyOSClient(hostname=router_obj.hostname, api_key=router_obj.api_key)
    output = await client.capture_traffic(interface)
    return {"output": output}

@router.get("/{id}/top")
async def get_router_processes(
    *,
    db: AsyncSession = Depends(deps.get_db),
    id: int,
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    result = await db.execute(select(Router).where(Router.id == id))
    router_obj = result.scalars().first()
    if not router_obj:
        raise HTTPException(status_code=404, detail="Router not found")
    client = VyOSClient(hostname=router_obj.hostname, api_key=router_obj.api_key)
    output = await client.show_text(["system", "processes"])
    return {"output": output}

@router.post("/{id}/command")
async def run_router_command(
    *,
    db: AsyncSession = Depends(deps.get_db),
    id: int,
    command: str = Body(..., embed=True),
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    """
    Run any VyOS command (show, set, delete, commit, save, etc.)
    """
    result = await db.execute(select(Router).where(Router.id == id))
    router_obj = result.scalars().first()
    if not router_obj:
        raise HTTPException(status_code=404, detail="Router not found")
    client = VyOSClient(hostname=router_obj.hostname, api_key=router_obj.api_key)
    output = await client.run_raw_command(command)
    return {"output": output}

@router.get("/{id}/bgp/summary")
async def get_bgp_summary(
    *,
    db: AsyncSession = Depends(deps.get_db),
    id: int,
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    """
    Fetch BGP neighbor summary.
    """
    result = await db.execute(select(Router).where(Router.id == id))
    router_obj = result.scalars().first()
    if not router_obj:
        raise HTTPException(status_code=404, detail="Router not found")
    client = VyOSClient(hostname=router_obj.hostname, api_key=router_obj.api_key)
    output = await client.show_text(["bgp", "summary"])
    return {"output": output}

@router.get("/{id}/static-routes")
async def get_static_routes(
    *,
    db: AsyncSession = Depends(deps.get_db),
    id: int,
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    """
    Fetch all static routes (including blackholes).
    """
    result = await db.execute(select(Router).where(Router.id == id))
    router_obj = result.scalars().first()
    if not router_obj:
        raise HTTPException(status_code=404, detail="Router not found")
    client = VyOSClient(hostname=router_obj.hostname, api_key=router_obj.api_key)
    # Get config for static protocols
    res = await client.get_config(["protocols", "static"])
    return res.get("data", {})

@router.get("/{id}/vpn/ipsec/status")
async def get_vpn_ipsec_status(
    *,
    db: AsyncSession = Depends(deps.get_db),
    id: int,
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    result = await db.execute(select(Router).where(Router.id == id))
    router_obj = result.scalars().first()
    if not router_obj:
        raise HTTPException(status_code=404, detail="Router not found")
    client = VyOSClient(hostname=router_obj.hostname, api_key=router_obj.api_key)
    status = await client.get_vpn_ipsec_status()
    return {"status": status}

@router.get("/{id}/vpn/ipsec/config")
async def get_vpn_ipsec_config(
    *,
    db: AsyncSession = Depends(deps.get_db),
    id: int,
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    result = await db.execute(select(Router).where(Router.id == id))
    router_obj = result.scalars().first()
    if not router_obj:
        raise HTTPException(status_code=404, detail="Router not found")
    client = VyOSClient(hostname=router_obj.hostname, api_key=router_obj.api_key)
    config = await client.get_vpn_ipsec_config()
    return config

@router.get("/{id}/vpn/openconnect/status")
async def get_vpn_openconnect_status(
    *,
    db: AsyncSession = Depends(deps.get_db),
    id: int,
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    result = await db.execute(select(Router).where(Router.id == id))
    router_obj = result.scalars().first()
    if not router_obj:
        raise HTTPException(status_code=404, detail="Router not found")
    client = VyOSClient(hostname=router_obj.hostname, api_key=router_obj.api_key)
    status = await client.get_vpn_openconnect_status()
    return {"status": status}

@router.get("/{id}/vpn/openconnect/config")
async def get_vpn_openconnect_config(
    *,
    db: AsyncSession = Depends(deps.get_db),
    id: int,
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    result = await db.execute(select(Router).where(Router.id == id))
    router_obj = result.scalars().first()
    if not router_obj:
        raise HTTPException(status_code=404, detail="Router not found")
    client = VyOSClient(hostname=router_obj.hostname, api_key=router_obj.api_key)
    config = await client.get_vpn_openconnect_config()
    return config

@router.post("/{id}/static-routes")
async def add_static_route(
    *,
    db: AsyncSession = Depends(deps.get_db),
    id: int,
    network: str = Body(...),
    next_hop: str = Body(None),
    blackhole: bool = Body(False),
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    result = await db.execute(select(Router).where(Router.id == id))
    router_obj = result.scalars().first()
    if not router_obj:
        raise HTTPException(status_code=404, detail="Router not found")
    client = VyOSClient(hostname=router_obj.hostname, api_key=router_obj.api_key)
    
    path = ["protocols", "static", "route", network]
    if blackhole:
        res = await client.set_config(path + ["blackhole"])
    elif next_hop:
        res = await client.set_config(path + ["next-hop", next_hop])
    else:
        raise HTTPException(status_code=400, detail="Must provide next_hop or blackhole=True")

    if not res.get("success"):
        raise HTTPException(status_code=400, detail=res.get("error"))
    
    await client.save()
    return {"success": True}

@router.get("/{id}/snmp")
async def get_snmp_config(
    *,
    db: AsyncSession = Depends(deps.get_db),
    id: int,
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    result = await db.execute(select(Router).where(Router.id == id))
    router_obj = result.scalars().first()
    if not router_obj:
        raise HTTPException(status_code=404, detail="Router not found")
    client = VyOSClient(hostname=router_obj.hostname, api_key=router_obj.api_key)
    res = await client.get_config(["service", "snmp"])
    return res.get("data", {})

@router.post("/{id}/config/timezone")
async def update_router_timezone(
    *,
    db: AsyncSession = Depends(deps.get_db),
    id: int,
    timezone: str = Body(..., embed=True),
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    result = await db.execute(select(Router).where(Router.id == id))
    router_obj = result.scalars().first()
    if not router_obj:
        raise HTTPException(status_code=404, detail="Router not found")
    client = VyOSClient(hostname=router_obj.hostname, api_key=router_obj.api_key)
    res_set = await client.set_config(["system", "time-zone", timezone])
    if not res_set.get("success"):
        raise HTTPException(status_code=400, detail=f"Failed to set timezone: {res_set.get('error')}")
    await client.save()
    return {"success": True}

@router.put("/{id}/config/vpn")
async def update_vpn_service_config(
    *,
    db: AsyncSession = Depends(deps.get_db),
    id: int,
    service: str = Body(...),
    enabled: bool = Body(...),
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    result = await db.execute(select(Router).where(Router.id == id))
    router_obj = result.scalars().first()
    if not router_obj:
        raise HTTPException(status_code=404, detail="Router not found")
    client = VyOSClient(hostname=router_obj.hostname, api_key=router_obj.api_key)
    path = ["vpn", service]
    if enabled:
        res = await client.set_config(path)
    else:
        res = await client.delete_config(path)
    if not res.get("success"):
        raise HTTPException(status_code=400, detail=res.get("error") or "Failed to update config")
    await client.save()
    return {"success": True}

@router.put("/{id}/firewall/settings")
async def update_firewall_global_settings(
    *,
    db: AsyncSession = Depends(deps.get_db),
    id: int,
    setting: str = Body(...),
    enabled: bool = Body(...),
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    result = await db.execute(select(Router).where(Router.id == id))
    router_obj = result.scalars().first()
    if not router_obj:
        raise HTTPException(status_code=404, detail="Router not found")
    client = VyOSClient(hostname=router_obj.hostname, api_key=router_obj.api_key)
    path = ["firewall", setting]
    val = "enable" if enabled else "disable"
    res = await client.set_config(path, val)
    if not res.get("success"):
        raise HTTPException(status_code=400, detail=res.get("error") or "Failed to update firewall setting")
    await client.save()
    return {"success": True}

@router.post("/{id}/firewall/groups/{group_name}/address")
async def add_firewall_group_address(
    *,
    db: AsyncSession = Depends(deps.get_db),
    id: int,
    group_name: str,
    address: str = Body(..., embed=True),
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    result = await db.execute(select(Router).where(Router.id == id))
    router_obj = result.scalars().first()
    if not router_obj:
        raise HTTPException(status_code=404, detail="Router not found")
    client = VyOSClient(hostname=router_obj.hostname, api_key=router_obj.api_key)
    path = ["firewall", "group", "address-group", group_name, "address", address]
    res = await client.set_config(path)
    if not res.get("success"):
        raise HTTPException(status_code=400, detail=res.get("error") or "Failed to add address")
    await client.save()
    return {"success": True}

@router.delete("/{id}/firewall/groups/{group_name}/address/{address:path}")
async def remove_firewall_group_address(
    *,
    db: AsyncSession = Depends(deps.get_db),
    id: int,
    group_name: str,
    address: str,
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    result = await db.execute(select(Router).where(Router.id == id))
    router_obj = result.scalars().first()
    if not router_obj:
        raise HTTPException(status_code=404, detail="Router not found")
    client = VyOSClient(hostname=router_obj.hostname, api_key=router_obj.api_key)
    path = ["firewall", "group", "address-group", group_name, "address", address]
    res = await client.delete_config(path)
    if not res.get("success"):
        raise HTTPException(status_code=400, detail=res.get("error") or "Failed to remove address")
    await client.save()
    return {"success": True}

@router.post("/{id}/config/batch")
async def batch_configure_router(
    *,
    db: AsyncSession = Depends(deps.get_db),
    id: int,
    commands: List[Dict[str, Any]] = Body(...),
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    """
    Execute multiple configuration commands in one transaction.
    """
    result = await db.execute(select(Router).where(Router.id == id))
    router_obj = result.scalars().first()
    if not router_obj:
        raise HTTPException(status_code=404, detail="Router not found")
    client = VyOSClient(hostname=router_obj.hostname, api_key=router_obj.api_key)
    res = await client.batch_configure(commands)
    if not res.get("success"):
        raise HTTPException(status_code=400, detail=res.get("error"))
    return {"success": True}

@router.get("/{id}/config/full")
async def get_full_router_config(
    *,
    db: AsyncSession = Depends(deps.get_db),
    id: int,
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    """
    Retrieve the complete running configuration.
    """
    result = await db.execute(select(Router).where(Router.id == id))
    router_obj = result.scalars().first()
    if not router_obj:
        raise HTTPException(status_code=404, detail="Router not found")
    client = VyOSClient(hostname=router_obj.hostname, api_key=router_obj.api_key)
    res = await client.get_config([])
    return res.get("data", {})

@router.post("/{id}/config/script")
async def apply_config_script(
    *,
    db: AsyncSession = Depends(deps.get_db),
    id: int,
    script: str = Body(..., embed=True),
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    """
    Apply a multi-line script of 'set' or 'delete' commands.
    """
    result = await db.execute(select(Router).where(Router.id == id))
    router_obj = result.scalars().first()
    if not router_obj:
        raise HTTPException(status_code=404, detail="Router not found")
    
    commands = []
    for line in script.splitlines():
        line = line.strip()
        if not line or line.startswith('#'): continue
        parts = line.split()
        op = parts[0].lower()
        if op in ['set', 'delete']:
            commands.append({"op": op, "path": parts[1:]})
    
    if not commands:
        return {"success": True, "message": "No commands to execute"}

    client = VyOSClient(hostname=router_obj.hostname, api_key=router_obj.api_key)
    res = await client.batch_configure(commands)
    if not res.get("success"):
        raise HTTPException(status_code=400, detail=res.get("error"))
    
    return {"success": True, "count": len(commands)}

@router.delete("/{id}", response_model=RouterSchema)
async def delete_router(
    *,
    db: AsyncSession = Depends(deps.get_db),
    id: int,
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    result = await db.execute(select(Router).where(Router.id == id))
    router = result.scalars().first()
    if not router:
        raise HTTPException(status_code=404, detail="Router not found")
    await db.delete(router)
    await db.commit()
    return router
