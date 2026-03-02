# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

VyOS UI Manager — a web dashboard for managing multiple VyOS router instances (v1.4/v1.5) via their REST API. Built with a FastAPI backend and a Next.js 14 frontend, orchestrated via Docker Compose.

## Commands

### Full Stack (Docker)
```bash
docker-compose up --build      # Build and start all services
docker-compose up              # Start without rebuild
docker-compose down            # Stop all services
```

### Backend (FastAPI)
```bash
cd backend
python -m venv venv && source venv/bin/activate   # Create venv (Linux/macOS)
# Windows: venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload  # Dev server at http://localhost:8000
# API docs: http://localhost:8000/docs
```

### Frontend (Next.js)
```bash
cd frontend
npm install
npm run dev     # Dev server at http://localhost:3000
npm run build   # Production build
npm run lint    # ESLint check
```

### Create First User (no sign-up page by design)
```bash
curl -X POST "http://localhost:8000/api/v1/users/" \
  -H "Content-Type: application/json" \
  -d '{"email": "admin@example.com", "password": "securepassword", "full_name": "Admin", "role": "admin"}'
```

## Architecture

### Backend (`backend/app/`)
- `main.py` — FastAPI app entry point. Uses a `lifespan` context manager to: create all DB tables via `Base.metadata.create_all` (no Alembic — schema changes require manual handling), then start the background metrics polling loop as an `asyncio.create_task`.
- `core/config.py` — Pydantic `Settings` loaded from `.env`. Required env vars: `POSTGRES_SERVER`, `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`. Optional: `DATABASE_URL`, `REDIS_URL`, `SECRET_KEY`.
- `core/database.py` — Async SQLAlchemy engine + `AsyncSessionLocal` session factory.
- `core/security.py` — JWT creation/verification and password hashing.
- `api/v1/endpoints/` — Route handlers: `login.py` (OAuth2 token), `users.py`, `routers.py`, `metrics.py`.
- `api/deps.py` — FastAPI dependency injectors: `get_db` (async session), `get_current_user` (JWT → User), `get_current_active_superuser`.
- `services/vyos.py` — `VyOSClient` class. All router API calls go through here. Uses `httpx.AsyncClient` with `verify=False` (self-signed certs). Key methods: `test_connection`, `get_config`, `set_config`, `commit`, `save`, `get_interface_stats`, `get_bgp_summary`.
- `services/metrics_service.py` — `MetricsService` with `collect_all_metrics()` that polls all enabled routers in parallel. `run_metrics_collector()` loops every 30 seconds and is started in `main.py` lifespan.

### Frontend (`frontend/src/`)
- `lib/api.ts` — Axios instance that auto-reads `NEXT_PUBLIC_API_URL` env var. Request interceptor automatically injects `Bearer` JWT token from `localStorage`. **All API calls must use this instance**, not raw fetch/axios.
- `app/` — Next.js 14 App Router pages: `login/`, `page.tsx` (router list dashboard), `routers/[id]/page.tsx` (per-router detail).
- `services/` — Frontend service layer wrapping `api.ts` calls.
- `components/` — Reusable React components (Tailwind + Lucide Icons + Recharts).

### Data Flow
1. Frontend authenticates → receives JWT → stores in `localStorage`
2. All subsequent requests include `Authorization: Bearer <token>` via interceptor
3. Backend validates JWT in `deps.get_current_user` → injects `User` into route handlers
4. Router CRUD endpoints in `api/v1/endpoints/routers.py` interact with PostgreSQL via async SQLAlchemy
5. Background task in `metrics_service.py` polls each enabled router every 30s, updating `Router.status` and inserting `RouterMetrics` rows

### VyOS API Pattern
All VyOS interactions follow the REST API pattern:
- `POST /retrieve` with `{"op": "showConfig"/"show", "path": [...]}` for reads
- `POST /configure` with `{"op": "set"/"delete", "path": [...]}` for writes
- Always follow writes with `POST /commit` then `POST /save`
- The `VyOSClient._post()` method handles auth via `key` form field (not a header)

## Environment Variables

Backend `.env` (at project root):
```
SECRET_KEY=<generated>
POSTGRES_SERVER=db
POSTGRES_USER=postgres
POSTGRES_PASSWORD=<set>
POSTGRES_DB=vyos_manager
DATABASE_URL=postgresql+asyncpg://...
REDIS_URL=redis://redis:6379/0
NEXT_PUBLIC_API_URL=http://localhost:8000
```

Run `./setup.sh` to generate `.env` files interactively.

## Key Conventions

- **Async everywhere**: All DB and I/O operations use `async/await`. Do not introduce synchronous blocking calls in endpoint handlers or services.
- **No Alembic**: Schema is managed via `create_all` on startup. For schema changes in dev, the easiest path is dropping and recreating tables. Plan for proper migrations before production.
- **VyOS config changes**: Always call `commit()` + `save()` after any `set_config()` or `delete_config()` call to persist changes on the router.
- **Router status**: After any connectivity test, update `router.status` (enum: `online`/`offline`/`unknown`) and `router.last_seen` in the DB.
- **API key security**: Router API keys are stored in plaintext in the DB (`router.api_key`). Encryption is a noted TODO.
