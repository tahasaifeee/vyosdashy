# VyOS UI Manager

A modern web dashboard for managing multiple VyOS router instances via their REST API.

## Features
- **Phase 1: Core Foundation** (Completed)
  - JWT Authentication & RBAC
  - Router Registry (CRUD)
  - VyOS API Connector (version aware)
  - Connectivity Testing

## Tech Stack
- **Frontend**: Next.js 14, Tailwind CSS, Lucide Icons, Axios
- **Backend**: FastAPI (Python), SQLAlchemy (PostgreSQL), Pydantic
- **Infrastructure**: Docker Compose, Redis (for future tasks)

## How to Run

### 1. Prerequisites
- Docker & Docker Compose
- Node.js (for local development)
- Python 3.11+ (for local development)

### 2. Launch with Docker
```bash
docker-compose up --build
```
This will start:
- PostgreSQL (Port 5432)
- Redis (Port 6379)
- Backend (Port 8000)
- Frontend (Port 3000)

### 3. Setup First User
Since there is no "Sign Up" page in Phase 1 (for security), you can create the first user via the API docs at `http://localhost:8000/docs#/users/create_user_api_v1_users__post`.

Or via `curl`:
```bash
curl -X POST "http://localhost:8000/api/v1/users/" -H "Content-Type: application/json" -d '{
  "email": "admin@example.com",
  "password": "securepassword",
  "full_name": "Admin User",
  "role": "admin"
}'
```

### 4. Access UI
Go to `http://localhost:3000/login` and sign in with the user you created.

## Project Structure
- `/backend`: FastAPI application
- `/frontend`: Next.js application
- `docker-compose.yml`: Orchestration
