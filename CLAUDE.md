# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

VyOS UI Manager — a web dashboard for managing multiple VyOS router instances (v1.4/v1.5) via their REST API. Built with a FastAPI backend and a Next.js 14 frontend, orchestrated via Docker Compose.

## Commands

### Full Stack (Docker) — preferred for production
```bash
docker compose up -d --build --force-recreate   # Build, recreate, and start all services
docker compose up -d --build --force-recreate --no-deps backend  # Backend only (faster)
docker compose down                              # Stop all services
docker compose logs backend --tail=50 -f        # Tail backend logs
```

> Always use `--force-recreate` after any `.env` change. `docker compose restart` does NOT reload env vars — it preserves the values baked in at container creation time. Only `up -d` (which recreates the container) picks up fresh env vars.

### Backend (FastAPI)
```bash
cd backend
python -m venv venv && source venv/bin/activate   # Linux/macOS
# Windows: venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload  # Dev server — http://localhost:8000/docs
```

### Frontend (Next.js)
```bash
cd frontend
npm install
npm run dev     # Dev server at http://localhost:3000
npm run build   # Production build
npm run lint    # ESLint check
```

### Create First Admin User
The registration endpoint requires superuser auth, so use the direct DB script:
```bash
# Via docker exec (use -i not -it for non-interactive contexts)
docker exec -i <backend-container> python app/create_first_user.py admin@example.com password "Admin User" admin

# Via setup.sh (option 2 → Reconfigure → prompts for admin user)
./setup.sh
```

## Architecture

### Backend (`backend/app/`)
- `main.py` — FastAPI entry point. Lifespan runs `Base.metadata.create_all`, then executes inline `ALTER TABLE` SQL to add columns (`load_average`, `active_sessions`, `uptime`, `disk_usage`) that were added after initial schema creation. Also exposes `GET /health` (`{"status": "ok"}`) and `GET /info` (VyOS-spec info endpoint with `version`/`hostname` query params). CORS falls back to `["*"]` if `BACKEND_CORS_ORIGINS` is empty.
- `core/config.py` — Pydantic `Settings`. `SECRET_KEY` has **no default** — app crashes at startup if missing. `BACKEND_CORS_ORIGINS` is `List[str]` (plain strings, not `AnyHttpUrl`) to prevent Pydantic v2 from normalizing URLs and adding trailing slashes that break CORS matching.
- `core/security.py` — JWT (HS256) creation/verification and bcrypt password hashing. Tokens expire in 60 minutes. Uses `datetime.now(timezone.utc)` (not deprecated `utcnow()`).
- `api/deps.py` — `get_current_user` decodes JWT, handles `TypeError`/`ValueError` on bad `sub` claim, returns 403 (not 500) on invalid tokens. `get_current_active_superuser` for admin-only endpoints.
- `api/v1/endpoints/login.py` — OAuth2 token endpoint. User-not-found and wrong-password checks are combined into one branch to prevent user enumeration.
- `api/v1/endpoints/users.py` — `POST /` requires superuser. `GET /me` is `async def`.
- `api/v1/endpoints/routers.py` — Router CRUD. On create, triggers immediate metrics collection via FastAPI `BackgroundTasks` (not `asyncio.create_task`).
- `api/v1/endpoints/metrics.py` — `limit` is capped at 1000 via `Query(ge=1, le=1000)`. Both endpoints validate `router_id` existence (404 if not found).
- `api/v1/endpoints/alerts.py` — Alerts CRUD: list (paginated, newest-first), unread count, mark-all-read. Alerts are auto-created by `metrics_service.py` on status changes—there is no manual alert creation endpoint.
- `services/vyos.py` — `VyOSClient` wraps the `pyvyos` library (`VyDevice`). All sync `pyvyos` calls are wrapped in `asyncio.to_thread()` to avoid blocking the event loop. `commit()` is a no-op (pyvyos applies set/delete atomically); `save()` calls `device.config_file_save()`. For metrics, GraphQL (`/graphql`) is tried first (VyOS 1.4+ only), with legacy `show` text commands as fallback for older routers. `verify=False` for all requests.
- `services/metrics_service.py` — `collect_all_metrics()` iterates enabled routers sequentially (not truly parallel). `collect_metrics_by_id()` opens its own `AsyncSessionLocal`. On status change (excluding initial `UNKNOWN→*`), inserts an `Alert`. Metrics loop starts via `asyncio.create_task()` in lifespan with a 10s initial delay.

### Frontend (`frontend/src/`)
- `lib/api.ts` — Axios instance. Reads `NEXT_PUBLIC_API_URL` env var, falls back to `window.location.hostname:8000`. JWT injected from `localStorage` on every request via interceptor. **All API calls must use this instance.**
- `app/routers/page.tsx` — Router list + Add/Delete modal. Error message on add failure shows `err.response?.data?.detail` (backend error) or fallback text.
- `app/routers/[id]/page.tsx` — Per-router dashboard. Throughput chart computes **delta between consecutive samples** divided by 30s poll interval (Mbps), not raw cumulative byte counters. Polls every 30s via `setInterval`.
- `app/login/page.tsx` — Login form, stores JWT in `localStorage` on success.

### Data Flow
1. Frontend authenticates → JWT stored in `localStorage`
2. All requests include `Authorization: Bearer <token>` via Axios interceptor
3. Backend validates JWT in `deps.get_current_user` → `User` injected into route handlers
4. Router CRUD → PostgreSQL via async SQLAlchemy
5. Background `metrics_service.py` polls every enabled router every 30s → updates `Router.status` + inserts `RouterMetrics` rows

### VyOS API Pattern
VyOS clients interact via `pyvyos.VyDevice`. Use `asyncio.to_thread()` for all synchronous pyvyos calls:
- `device.retrieve_show_config(path)` — read config tree
- `device.show(path)` — operational data (returns text)
- `device.configure_set(path)` / `device.configure_delete(path)` — write; pyvyos commits atomically, no separate commit step needed
- `device.config_file_save()` — persist to disk; **required after any write**
- `/graphql` — used directly via httpx for `ShowInterfaceCounters`, `ShowSystemInformation`, `ShowIpRoute` (VyOS 1.4+ only). Falls back to `show_text()` for older routers.
- `GET /info?version=true&hostname=true` — managed via httpx directly (not in pyvyos)
- All connections use `verify=False` (self-signed certs)

## Environment Variables

Two `.env` files are kept in sync by `setup.sh`:
- **Root `.env`** — read by Docker Compose `env_file:` to set container environment variables
- **`backend/.env`** — volume-mounted into the backend container as `/app/.env`, read directly by Pydantic `BaseSettings`

Both must match. `reconfigure` in `setup.sh` writes root `.env` then `cp .env backend/.env`.

```
SECRET_KEY=<generate: python3 -c "import secrets; print(secrets.token_hex(32))">
POSTGRES_SERVER=db
POSTGRES_USER=postgres
POSTGRES_PASSWORD=<set>
POSTGRES_DB=vyos_manager
DATABASE_URL=postgresql+asyncpg://postgres:<password>@db:5432/vyos_manager
REDIS_URL=redis://redis:6379/0
BACKEND_CORS_ORIGINS=http://<server-ip>:3000,http://localhost:3000
NEXT_PUBLIC_API_URL=http://<server-ip>:8000
```

`BACKEND_CORS_ORIGINS` must include the **actual server IP** (not just localhost), otherwise all browser API calls are blocked by CORS. `setup.sh` auto-detects the public IP and includes it in the default.

## Key Conventions

- **Async everywhere**: All DB and I/O in `async/await`. No blocking calls in route handlers or services.
- **No Alembic**: Schema managed by `create_all` on startup, with inline `ALTER TABLE IF NOT EXISTS` in the lifespan for additive column changes. Drop and recreate tables for non-additive schema changes in dev.
- **VyOS writes**: Always `commit()` + `save()` after `set_config()` / `delete_config()`.
- **Router status**: After any connectivity test, update `router.status` (`online`/`offline`/`unknown`) and `router.last_seen` with `datetime.now(timezone.utc)`.
- **API keys**: Stored in plaintext in `routers.api_key` — encryption is a TODO.
- **User registration**: Gated behind `get_current_active_superuser`. Use `create_first_user.py` script to bootstrap the first admin user.
- **CORS origins**: Use plain `str` not `AnyHttpUrl` in config. Pydantic v2 normalizes `AnyHttpUrl` by adding trailing slashes, which silently breaks CORS matching in FastAPI's middleware.

## setup.sh Behaviour

The script auto-detects whether an installation exists (`.git` present) and shows:
- **Option 1 — Update**: `git fetch` + clean untracked conflicts + `git merge` + `docker compose up -d --build --force-recreate`
- **Option 2 — Reconfigure**: Re-prompts all settings, rewrites `.env` files, `docker compose up -d --build --force-recreate`
- **Option 3 — Uninstall**: `docker compose down [-v]` + removes directory

The update path handles the one-time migration where `backend/.env` was previously tracked by git: backs it up, removes from index, fetches, clears any other untracked conflicts, merges, then restores `backend/.env`.
