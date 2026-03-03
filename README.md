# VyOS UI Manager

A modern web dashboard for managing multiple VyOS router instances via their REST and GraphQL APIs.

[![Docker](https://img.shields.io/badge/docker-2496ED?style=for-the-badge&logo=docker&logoColor=white)](https://www.docker.com/)
[![Next.js](https://img.shields.io/badge/next.js-000000?style=for-the-badge&logo=nextdotjs&logoColor=white)](https://nextjs.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-005571?style=for-the-badge&logo=fastapi)](https://fastapi.tiangolo.com/)

## Features
- **Centralized Dashboard**: Manage multiple VyOS routers from a single interface.
- **Real-time Monitoring**: 30s background metrics polling for CPU, Memory, Disk, and Network interfaces.
- **Interactive Charts**: Visualize historical throughput and resource usage using Recharts.
- **Router Registry**: CRUD operations for managing router endpoints, API keys, and configurations.
- **Connectivity Testing**: Instantly verify API connectivity and version status.
- **Secure Authentication**: JWT-based authentication with role-based access control (RBAC).

## One-Click Installation

Run the following command on your server to install and set up everything automatically:

```bash
bash -c "$(curl -fsSL https://raw.githubusercontent.com/tahasaifeee/vyosdashy/main/setup.sh)"
```

## VyOS Router Configuration

### Compatible Versions
This dashboard supports **VyOS 1.4 (Sagitta)** and **VyOS 1.5 (Circinus)**. It leverages both legacy REST endpoints and the modern GraphQL API for enhanced performance.

### Configuration Steps
Before adding a router, enable the HTTPS API on your VyOS instance:

```bash
# 1. Enable HTTPS API with your chosen key
set service https api keys id MY_API_KEY key YOUR_SECRET_API_KEY

# 2. (Optional) Set the listening address
set service https virtual-host vyos.example.com listen-address 0.0.0.0

# 3. (Optional) Set a custom port (default is 443)
set service https port 443

# 4. Apply and Save
commit
save
```

## Tech Stack
- **Frontend**: Next.js 14 (App Router), TypeScript, Tailwind CSS, Lucide Icons, Recharts, Axios.
- **Backend**: FastAPI (Python), SQLAlchemy (Async), Pydantic v2, Jose/Passlib (JWT).
- **Database**: PostgreSQL 15, Redis (Metrics caching).
- **Infrastructure**: Docker Compose.

## Quick Start (Manual)

If you have cloned the repository locally:

1.  **Clone the repository:**
    ```bash
    git clone https://github.com/tahasaifeee/vyosdashy.git
    cd vyosdashy
    ```

2.  **Run the setup script:**
    ```bash
    chmod +x setup.sh
    ./setup.sh
    ```

3.  **Start the application:**
    ```bash
    docker compose up -d --build
    ```

4.  **Access points:**
    *   Frontend: `http://localhost:3000`
    *   Backend API: `http://localhost:8000`
    *   API Docs: `http://localhost:8000/docs`

## Setup First User
The interactive `setup.sh` script is the easiest way to create your initial admin user during installation or by running the script later and choosing "Reconfigure".

If you need to create a user manually after the containers are running:

```bash
# Using Docker (Replace with actual backend container name if different)
docker exec -it vyosdashy-backend-1 python app/create_first_user.py admin@example.com password "Admin User" admin
```

Or via `curl`:
```bash
curl -X POST "http://localhost:8000/api/v1/users/" -H "Content-Type: application/json" -d '{
  "email": "admin@example.com",
  "password": "securepassword",
  "full_name": "Admin User",
  "role": "admin"
}'
```

## Project Structure
- `/backend`: FastAPI application (Asynchronous architecture)
- `/frontend`: Next.js 14 application (Tailwind & TypeScript)
- `docker-compose.yml`: Full-stack orchestration
- `setup.sh`: Interactive configuration script

## License
MIT
