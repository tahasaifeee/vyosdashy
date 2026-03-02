from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import asyncio
from contextlib import asynccontextmanager

from app.core.config import settings
from app.api.api import api_router
from app.services.metrics_service import run_metrics_collector
from sqlalchemy import text
from app.core.database import Base, engine

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Ensure all tables are created
    async with engine.begin() as conn:
        # We need to import models here to ensure they are registered with Base.metadata
        from app.models.user import User
        from app.models.router import Router
        from app.models.metrics import RouterMetrics
        from app.models.alert import Alert
        await conn.run_sync(Base.metadata.create_all)
        
        # Manual migration for existing tables
        try:
            await conn.execute(text("ALTER TABLE router_metrics ADD COLUMN IF NOT EXISTS load_average JSON"))
            await conn.execute(text("ALTER TABLE router_metrics ADD COLUMN IF NOT EXISTS active_sessions INTEGER DEFAULT 0"))
            await conn.execute(text("ALTER TABLE router_metrics ADD COLUMN IF NOT EXISTS uptime INTEGER DEFAULT 0"))
            await conn.execute(text("ALTER TABLE router_metrics ADD COLUMN IF NOT EXISTS disk_usage FLOAT DEFAULT 0.0"))
        except Exception as e:
            print(f"Migration notice: {e}")
        
    # Start background tasks
    task = asyncio.create_task(run_metrics_collector())
    yield
    # Clean up
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

# CORS — use configured origins if provided, fall back to ["*"] for local dev.
# Bearer tokens in headers (not cookies) work with wildcard origins and don't
# require allow_credentials=True.
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

@app.get("/info")
def get_service_info(version: bool = True, hostname: bool = True):
    """
    Public endpoint providing service information.
    Matches VyOS API pattern.
    """
    data = {"banner": "Welcome to VyOS UI Manager"}
    if version:
        data["version"] = "0.5.0-beta"
    if hostname:
        data["hostname"] = "vyos-dashy-manager"
        
    return {
        "success": True,
        "data": data,
        "error": None
    }

@app.get("/")
def read_root():
    return {"message": "Welcome to VyOS UI Manager API"}
