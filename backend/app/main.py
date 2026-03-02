from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import asyncio
from contextlib import asynccontextmanager

from app.core.config import settings
from app.api.api import api_router
from app.services.metrics_service import run_metrics_collector

@asynccontextmanager
async def lifespan(app: FastAPI):
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
origins = []
if settings.BACKEND_CORS_ORIGINS:
    if isinstance(settings.BACKEND_CORS_ORIGINS, str):
        origins = [i.strip() for i in settings.BACKEND_CORS_ORIGINS.split(",")]
    else:
        origins = [str(origin) for origin in settings.BACKEND_CORS_ORIGINS]

# Default origins for local development if nothing is specified
if not origins:
    origins = ["*"]

# CORS Middleware with robust settings
# If "*" is in origins, we use allow_origin_regex=".*" to allow credentials with wildcards
if "*" in origins:
    app.add_middleware(
        CORSMiddleware,
        allow_origin_regex=".*",
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
else:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=origins,
        allow_credentials=True,
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
