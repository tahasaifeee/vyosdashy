# VyOS UI Manager

A modern web dashboard for managing multiple VyOS router instances via their REST API.

## One-Click Installation

Run the following command on your server to install and set up everything automatically:

```bash
bash -c "$(curl -fsSL https://raw.githubusercontent.com/tahasaifeee/vyosdashy/main/setup.sh)"
```

## Features
- **Phase 1: Core Foundation** (Completed)
  - JWT Authentication & RBAC
  - Router Registry (CRUD)
  - VyOS API Connector (version aware)
  - Connectivity Testing

## VyOS Router Configuration

### Compatible Versions
This dashboard is designed to work with **VyOS 1.4 (Sagitta)** and **VyOS 1.5 (Circinus)**, as these versions have the modern REST API required for remote management.

### Configuration Steps
Before adding a router to the dashboard, you must enable the HTTPS API on your VyOS instance. Run the following commands in VyOS configuration mode:

```bash
# 1. Enable HTTPS API
set service https api keys id MY_API_KEY key YOUR_SECRET_API_KEY

# 2. (Optional) Set the listening address (e.g., your management IP)
set service https virtual-host vyos.example.com listen-address 0.0.0.0

# 3. (Optional) Set a custom port (default is 443)
set service https port 443

# 4. Apply and Save
commit
save
```

*Note: The dashboard communicates with the router over HTTPS using the API key you defined above.*

## Tech Stack
- **Frontend**: Next.js 14, Tailwind CSS, Lucide Icons, Axios
- **Backend**: FastAPI (Python), SQLAlchemy (PostgreSQL), Pydantic
- **Infrastructure**: Docker Compose, Redis (for future tasks)

## Quick Start (Manual)

If you have already cloned the repository, you can run the setup script locally:

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
    The script will:
    *   Ask for project details (Postgres credentials, CORS, etc.).
    *   Generate a secure `SECRET_KEY`.
    *   Create the necessary `.env` files.
    *   Optionally start the application using Docker Compose.

3.  **Access the application:**
    *   Frontend: `http://your-server-ip:3000`
    *   Backend API: `http://your-server-ip:8000`
    *   API Docs: `http://your-server-ip:8000/docs`

## Setup First User
Since there is no "Sign Up" page (for security), you can create the first user via the API docs at `http://localhost:8000/docs#/users/create_user_api_v1_users__post`.

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
- `/backend`: FastAPI application
- `/frontend`: Next.js application
- `docker-compose.yml`: Orchestration
- `setup.sh`: Automated configuration script
