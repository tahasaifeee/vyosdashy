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

## Quick Start (Production/Server)

We've provided a master setup script that handles environment configuration and Docker deployment.

1.  **Clone the repository:**
    ```bash
    git clone <repository-url>
    cd vyosdashy
    ```

2.  **Run the setup script:**
    ```bash
    chmod +x setup.sh
    ./setup.sh
    ```
    The script will:
    *   Ask for project details (Postgres credentials, CORS, etc.).
    *   Generate a secure `SECRET_KEY`.
    *   Create the necessary `.env` files.
    *   Optionally start the application using Docker Compose.

3.  **Access the application:**
    *   Frontend: `http://your-server-ip:3000`
    *   Backend API: `http://your-server-ip:8000`
    *   API Docs: `http://your-server-ip:8000/docs`

## Manual Development Setup

If you prefer to run services manually for development:

### 1. Launch with Docker
```bash
docker-compose up --build
```
This will start:
- PostgreSQL (Port 5432)
- Redis (Port 6379)
- Backend (Port 8000)
- Frontend (Port 3000)

### 2. Setup First User
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

### 3. Access UI
Go to `http://localhost:3000/login` and sign in with the user you created.

## Project Structure
- `/backend`: FastAPI application
- `/frontend`: Next.js application
- `docker-compose.yml`: Orchestration
- `setup.sh`: Automated configuration script
