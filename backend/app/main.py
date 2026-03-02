from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import asyncio
from contextlib import asynccontextmanager

from app.core.config import settings
from app.api.api import api_router
from app.services.metrics_service import run_metrics_collector
from app.core.database import Base, engine

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Ensure all tables are created
    async with engine.begin() as conn:
        # We need to import models here to ensure they are registered with Base.metadata
        from app.models.user import User
        from app.models.router import Router
        from app.models.metrics import RouterMetrics
        await conn.run_sync(Base.metadata.create_all)
        
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

# Set all CORS enabled origins
# We use allow_origins=["*"] and allow_credentials=False because we use Bearer tokens in headers,
# which works with wildcards and doesn't require the 'Credentials' flag.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router, prefix=settings.API_V1_STR)

@app.get("/health")
def health_check():
    return {"status": "ok"}

@app.get("/")
def read_root():
    return {"message": "Welcome to VyOS UI Manager API"}
