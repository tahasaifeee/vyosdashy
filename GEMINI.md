# VyOS UI Manager - GEMINI.md

## Project Overview

A modern web dashboard for managing multiple VyOS router instances via their REST API. This project provides a centralized interface for monitoring and configuring routers across different sites.

- **Frontend**: Next.js 14 (App Router), TypeScript, Tailwind CSS, Lucide Icons, Axios, Recharts.
- **Backend**: FastAPI (Python 3.10+), SQLAlchemy (Async), PostgreSQL, Pydantic, Redis, Celery (for future tasks).
- **Core Functionality**: Interfaces with VyOS REST API (HTTPS + API Key) for versions 1.4 (Sagitta) and 1.5 (Circinus).
- **Security**: JWT-based authentication and Role-Based Access Control (RBAC).

## Building and Running

### Automated Setup (Recommended)
The easiest way to set up the project is using the provided `setup.sh` script, which generates `.env` files and optionally starts the application with Docker Compose.
```bash
chmod +x setup.sh
./setup.sh
```

### Docker Compose
Run the entire stack (Database, Redis, Backend, Frontend) with Docker:
```bash
docker-compose up --build
```

### Manual Development Setup

#### Backend
1. Navigate to the `backend` directory: `cd backend`
2. Create and activate a virtual environment: `python -m venv venv && source venv/bin/activate` (or `venv\Scripts\activate` on Windows)
3. Install dependencies: `pip install -r requirements.txt`
4. Run the development server: `uvicorn app.main:app --reload`
   - API Docs: `http://localhost:8000/docs`

#### Frontend
1. Navigate to the `frontend` directory: `cd frontend`
2. Install dependencies: `npm install`
3. Run the development server: `npm run dev`
   - Dashboard: `http://localhost:3000`

## Project Structure

- `backend/app/`: FastAPI application code.
  - `api/v1/endpoints/`: REST API route handlers.
  - `core/`: Configuration (`config.py`), database setup (`database.py`), and security (`security.py`).
  - `models/`: SQLAlchemy database models.
  - `schemas/`: Pydantic models for validation and serialization.
  - `services/`: Business logic, including `vyos.py` (VyOS API client) and `metrics_service.py`.
- `frontend/src/`: Next.js application code.
  - `app/`: App Router pages and layouts.
  - `components/`: Reusable React components.
  - `lib/api.ts`: Axios instance with JWT interceptor.
  - `services/`: Frontend API service layers.
- `docker-compose.yml`: Orchestration for all services.
- `setup.sh`: Interactive configuration and setup script.

## Development Conventions

### Backend
- **Async First**: Use `async`/`await` for all database and I/O operations.
- **Service Pattern**: Logic for external integrations (like VyOS API) should reside in `app/services/`.
- **Validation**: Use Pydantic schemas for all request/response validation.
- **Background Tasks**: Real-time metrics collection is handled via FastAPI lifespan events starting `run_metrics_collector()`.

### Frontend
- **App Router**: Follow Next.js 14 App Router patterns.
- **Axios Interceptor**: All API calls should use the `api` instance from `@/lib/api` to ensure JWT tokens are automatically included.
- **Styling**: Use Tailwind CSS and follow the existing component patterns for consistency.

### VyOS Integration
- **VyOSClient**: The `backend/app/services/vyos.py` contains the `VyOSClient` class for interacting with routers.
- **Self-Signed Certs**: Routers typically use self-signed certificates; `urllib3.disable_warnings` is used, and `verify=False` is set in the client.
- **Commit/Save**: Configuration changes must be followed by `commit()` and `save()` to be persistent.
