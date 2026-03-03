from fastapi import FastAPI, Request, Query, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import asyncio
from contextlib import asynccontextmanager
from typing import Optional, Dict, Any
from pydantic import ValidationError

from app.core.config import settings
from app.api.api import api_router
from app.services.metrics_service import run_metrics_collector
from sqlalchemy import text
from app.core.database import Base, engine
from app.schemas.info import InfoQueryParams

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Ensure all tables are created
    async with engine.begin() as conn:
        from app.models.user import User
        from app.models.router import Router
        from app.models.metrics import RouterMetrics
        from app.models.alert import Alert
        await conn.run_sync(Base.metadata.create_all)
        
        try:
            await conn.execute(text("ALTER TABLE router_metrics ADD COLUMN IF NOT EXISTS load_average JSON"))
            await conn.execute(text("ALTER TABLE router_metrics ADD COLUMN IF NOT EXISTS active_sessions INTEGER DEFAULT 0"))
            await conn.execute(text("ALTER TABLE router_metrics ADD COLUMN IF NOT EXISTS uptime INTEGER DEFAULT 0"))
            await conn.execute(text("ALTER TABLE router_metrics ADD COLUMN IF NOT EXISTS disk_usage FLOAT DEFAULT 0.0"))
        except Exception as e:
            print(f"Migration notice: {e}")
        
    task = asyncio.create_task(run_metrics_collector())
    yield
    task.cancel()
    try:
        await task
    except asyncio.CancelledError:
        pass

app = FastAPI(
    title=settings.PROJECT_NAME,
    openapi_url=f"{settings.API_V1_STR}/openapi.json",
    lifespan=lifespan
)

cors_origins = [str(o) for o in settings.BACKEND_CORS_ORIGINS] if settings.BACKEND_CORS_ORIGINS else ["*"]
app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router, prefix=settings.API_V1_STR)

@app.get("/health")
def health_check():
    return {"status": "ok"}

# ── VyOS-Compliant /info Implementation ──────────────────────────────────────

@app.get("/info")
async def get_service_info(request: Request):
    """
    Public endpoint providing service information.
    Strictly follows VyOS API specification.
    """
    try:
        # Capture raw query params for strict validation
        raw_params = dict(request.query_params)
        params = InfoQueryParams(**raw_params)
        
        data = {
            "version": "0.5.0-beta" if params.version == "true" else "",
            "hostname": "vyos-dashy-manager" if params.hostname == "true" else "",
            "banner": "Welcome to VyOS UI Manager"
        }
        
        return {
            "success": True,
            "data": data,
            "error": None
        }
    except ValidationError as e:
        # Match the VyOS error format precisely
        # Extract the specific Pydantic error and format as a stringified dict-like structure
        err = e.errors()[0]
        error_msg = f"{{'type': '{err['type']}', 'loc': {err['loc']}, 'msg': '{err['msg']}', 'input': '{err['input']}'}}"
        
        return JSONResponse(
            status_code=400,
            content={
                "success": False,
                "error": error_msg,
                "data": None
            }
        )

@app.get("/")
def read_root():
    return {"message": "Welcome to VyOS UI Manager API"}
