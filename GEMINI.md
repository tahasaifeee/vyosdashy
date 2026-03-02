# VyOS UI Manager - Project Overview

A modern web dashboard for managing multiple VyOS router instances via their REST and GraphQL APIs.

## Project Overview

The VyOS UI Manager is a full-stack application designed to provide a centralized interface for monitoring and managing VyOS routers (v1.4/v1.5). It supports both legacy REST endpoints and the newer GraphQL API.

### Key Technologies
- **Frontend**: Next.js 14 (App Router, TypeScript), Tailwind CSS, Lucide Icons, Recharts, Axios.
- **Backend**: FastAPI (Python), SQLAlchemy (Async), Pydantic v2, Jose/Passlib (JWT).
- **Infrastructure**: Docker Compose, PostgreSQL 15, Redis.

### Architecture
1.  **Backend API**: RESTful API with JWT authentication. Includes a 30s background metrics polling loop.
2.  **Frontend SPA**: Next.js application using a centralized Axios instance with JWT interceptors.
3.  **Data Flow**: Frontend -> JWT Auth -> FastAPI -> SQLAlchemy (Postgres) / VyOS API.

---

## Building and Running

### Quick Start (Recommended)
Use the `setup.sh` script for automated configuration, environment setup, and deployment.
```bash
chmod +x setup.sh
./setup.sh
```

### Docker Commands
- **Start All**: `docker compose up -d --build --force-recreate`
- **Stop All**: `docker compose down`
- **Logs**: `docker compose logs backend -f`
- **Note**: Always use `--force-recreate` after `.env` changes as `restart` does not reload environment variables.

### Local Development
- **Backend**: `cd backend && uvicorn app.main:app --reload` (requires venv and `pip install -r requirements.txt`).
- **Frontend**: `cd frontend && npm install && npm run dev`.

### Creating the First User
Since registration is restricted to superusers, use the bootstrap script:
```bash
docker exec -i <backend-container> python app/create_first_user.py admin@example.com password "Admin User" admin
```

---

## API Documentation Reference

The backend provides interactive OpenAPI docs at `http://localhost:8000/docs`.

### Authentication
- **Endpoint**: `POST /api/v1/login/access-token`
- **Flow**: Standard OAuth2 Password flow. Returns a JWT stored in `localStorage` on the frontend.
- **Expiration**: 60 minutes.

### Routers (`/api/v1/routers`)
- `GET /`: List all registered routers for the current user.
- `POST /`: Register a new VyOS router. Triggers an immediate background metrics collection.
- `GET /{id}`: Get detailed info for a specific router.
- `PUT /{id}`: Update router configuration.
- `DELETE /{id}`: Remove a router from the registry.

### Metrics (`/api/v1/metrics`)
- `GET /router/{router_id}/latest`: Get the most recent metrics for a router.
- `GET /router/{router_id}/history`: Get historical metrics (default limit 100, max 1000).

---

## Development Conventions

### Backend Guidelines
- **Async Everywhere**: All I/O (DB, VyOS API) must use `async/await`.
- **Dependency Injection**: Use `get_db` for sessions and `get_current_user` / `get_current_active_superuser` for auth.
- **No Alembic**: Database schemas are managed via `Base.metadata.create_all` on startup. Drop tables to apply schema changes in development.
- **VyOS Writes**: Always follow `set_config` or `delete_config` with `commit()` and `save()` to persist changes on the router.
- **CORS**: `BACKEND_CORS_ORIGINS` in `.env` must be a comma-separated list of strings. Do not use trailing slashes.

### Frontend Guidelines
- **Axios Instance**: Always use `src/lib/api.ts`. It handles base URL logic, JWT injection, and 401/403 auto-redirects.
- **Performance Charts**: Throughput is calculated as the delta between consecutive byte counter samples divided by the 30s interval.
- **Styling**: Use Tailwind CSS utility classes.

### Security
- **API Keys**: Currently stored in plaintext in the database (Encryption is a planned feature).
- **User Enumeration**: Login errors are generic ("Incorrect email or password") to prevent user discovery.
