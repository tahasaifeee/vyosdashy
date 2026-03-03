#!/bin/bash

# VyOS Manager Master Script (Install, Update, Uninstall, Reconfigure)

set -e

echo "----------------------------------------"
echo "   VyOS UI Manager - Master Script"
echo "----------------------------------------"

# Function to install a package if it's missing
install_if_missing() {
    local pkg=$1
    if ! command -v "$pkg" >/dev/null 2>&1; then
        echo "Installing missing dependency: $pkg..."
        if command -v apt-get >/dev/null 2>&1; then
            sudo apt-get update -qq
            sudo apt-get install -y "$pkg" >/dev/null
        elif command -v yum >/dev/null 2>&1; then
            sudo yum install -y "$pkg" >/dev/null
        else
            echo "Error: Package manager not found. Please install '$pkg' manually."
            exit 1
        fi
    fi
}

# Helper for interactive input
prompt_user() {
    local prompt_text=$1
    local default_value=$2
    local result_var=$3
    local input_val

    printf "%s" "$prompt_text" >&2
    if read -r input_val < /dev/tty; then
        if [ -z "$input_val" ]; then
            eval "$result_var=\"$default_value\""
        else
            eval "$result_var=\"$input_val\""
        fi
    else
        eval "$result_var=\"$default_value\""
    fi
}

# Detect Docker Compose command
detect_docker_compose() {
    if docker compose version >/dev/null 2>&1; then
        echo "docker compose"
    elif docker-compose version >/dev/null 2>&1; then
        echo "docker-compose"
    else
        echo ""
    fi
}

# Function to generate a random secret key
generate_secret_key() {
    if python3 -c 'import secrets; print(secrets.token_urlsafe(32))' 2>/dev/null; then
        return
    fi
    if openssl rand -base64 32 2>/dev/null; then
        return
    fi
    echo "ERROR: Cannot generate a secure secret key. Install python3 or openssl." >&2
    exit 1
}

# Get public IP
get_public_ip() {
    curl -s --max-time 2 https://ipinfo.io/ip || curl -s --max-time 2 https://api.ipify.org || echo "localhost"
}

# Ensure basic dependencies are present
install_if_missing curl
install_if_missing git
install_if_missing python3
install_if_missing sudo

DOCKER_COMPOSE_CMD=$(detect_docker_compose)

# --- MODULES ---

check_status_and_logs() {
    echo ""
    echo "--- System Status & Logs ---"
    if [ -z "$DOCKER_COMPOSE_CMD" ]; then
        echo "Error: Docker Compose not found."
        return
    fi

    echo "Container Status:"
    $DOCKER_COMPOSE_CMD ps
    
    echo ""
    prompt_user "Would you like to see the last 20 lines of backend logs? (y/N): " "n" show_logs
    if [[ "$show_logs" =~ ^[Yy]$ ]]; then
        echo "--- Backend Logs ---"
        $DOCKER_COMPOSE_CMD logs --tail=20 backend
    fi

    echo ""
    prompt_user "Would you like to see the last 20 lines of database logs? (y/N): " "n" show_db_logs
    if [[ "$show_db_logs" =~ ^[Yy]$ ]]; then
        echo "--- Database Logs ---"
        $DOCKER_COMPOSE_CMD logs --tail=20 db
    fi

    echo ""
    prompt_user "Follow live logs? (Ctrl+C to stop) (y/N): " "n" follow_logs
    if [[ "$follow_logs" =~ ^[Yy]$ ]]; then
        $DOCKER_COMPOSE_CMD logs -f
    fi
}

create_admin_user() {
    echo ""
    echo "--- Admin User Setup ---"
    prompt_user "Create/Update admin user? (y/N): " "n" create_admin
    if [[ "$create_admin" =~ ^[Yy]$ ]]; then
        prompt_user "Admin Email [admin@example.com]: " "admin@example.com" ADMIN_EMAIL
        prompt_user "Admin Password: " "secure_password" ADMIN_PASSWORD
        prompt_user "Admin Full Name [Admin User]: " "Admin User" ADMIN_NAME
        
        echo "Creating admin user in database..."
        # Wait for the DB to be ready
        sleep 5
        # Try to find the backend container name
        BACKEND_CONTAINER=$(docker ps --format "{{.Names}}" | grep "backend" | head -n 1)
        if [ -n "$BACKEND_CONTAINER" ]; then
            docker exec -i "$BACKEND_CONTAINER" python app/create_first_user.py "$ADMIN_EMAIL" "$ADMIN_PASSWORD" "$ADMIN_NAME" "admin" || \
            echo "Failed to create user. Please check container logs: $DOCKER_COMPOSE_CMD logs backend"
        else
            echo "Error: Backend container not found. Is the app running?"
        fi
    fi
}

reconfigure() {
    echo ""
    echo "--- Reconfiguration ---"
    
    # Try to guess the external API URL
    PUBLIC_IP=$(get_public_ip)
    DEFAULT_API_URL="http://${PUBLIC_IP}:8000"

    echo "Please provide the following information (press Enter for defaults):"

    prompt_user "Project Name [VyOS UI Manager]: " "VyOS UI Manager" PROJECT_NAME
    prompt_user "Postgres User [postgres]: " "postgres" POSTGRES_USER
    prompt_user "Postgres Password [secure_password]: " "secure_password" POSTGRES_PASSWORD
    prompt_user "Postgres Database [vyos_manager]: " "vyos_manager" POSTGRES_DB
    prompt_user "Postgres Server [db]: " "db" POSTGRES_SERVER

    GENERATED_KEY=$(generate_secret_key)
    prompt_user "Secret Key (press Enter to use generated): " "$GENERATED_KEY" SECRET_KEY
    prompt_user "Backend CORS Origins (Comma separated IPs/Domains) [http://localhost:3000,http://localhost:8000,http://${PUBLIC_IP}:3000]: " "http://localhost:3000,http://localhost:8000,http://${PUBLIC_IP}:3000" BACKEND_CORS_ORIGINS
    prompt_user "Next Public API URL [${DEFAULT_API_URL}]: " "$DEFAULT_API_URL" NEXT_PUBLIC_API_URL
    prompt_user "Redis URL [redis://redis:6379/0]: " "redis://redis:6379/0" REDIS_URL

    DATABASE_URL="postgresql+asyncpg://${POSTGRES_USER}:${POSTGRES_PASSWORD}@${POSTGRES_SERVER}:5432/${POSTGRES_DB}"

    # Generate .env file without single quotes around values
    cat << EOF > .env
# Project Settings
PROJECT_NAME=${PROJECT_NAME}
SECRET_KEY=${SECRET_KEY}

# Database Settings
POSTGRES_SERVER=${POSTGRES_SERVER}
POSTGRES_USER=${POSTGRES_USER}
POSTGRES_PASSWORD=${POSTGRES_PASSWORD}
POSTGRES_DB=${POSTGRES_DB}
DATABASE_URL=${DATABASE_URL}

# Backend Settings
BACKEND_CORS_ORIGINS=${BACKEND_CORS_ORIGINS}
REDIS_URL=${REDIS_URL}

# Frontend Settings
NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}
EOF

    cp .env backend/.env
    echo ".env files updated."
    
    if [ -n "$DOCKER_COMPOSE_CMD" ]; then
        prompt_user "Rebuild and restart containers to apply changes? (y/N): " "n" restart
        if [[ "$restart" =~ ^[Yy]$ ]]; then
            $DOCKER_COMPOSE_CMD up -d --build --force-recreate
            check_status_and_logs
        fi
        create_admin_user
    fi
}

update_app() {
    echo ""
    echo "--- Updating VyOS UI Manager ---"

    if [ ! -f ".env" ]; then
        echo "WARNING: .env file not found. Running reconfiguration first..."
        reconfigure
        return
    fi

    # Always preserve backend/.env — it holds real DB credentials and the secret key
    [ -f "backend/.env" ] && cp backend/.env /tmp/vyos_backend_env_backup

    # Migration: if backend/.env is still tracked by git, remove it from the index
    if git ls-files --error-unmatch backend/.env >/dev/null 2>&1; then
        echo "Note: Removing backend/.env from git tracking (settings preserved)..."
        git checkout -- backend/.env
        git rm --cached backend/.env
    fi

    echo "Pulling latest changes from repository..."
    git fetch origin

    git diff --name-only HEAD FETCH_HEAD 2>/dev/null | while IFS= read -r f; do
        if [ -f "$f" ] && ! git ls-files --error-unmatch "$f" >/dev/null 2>&1; then
            echo "  Clearing untracked file for update: $f"
            rm -f "$f"
        fi
    done

    git merge FETCH_HEAD

    # Restore actual backend configuration after merge
    if [ -f /tmp/vyos_backend_env_backup ]; then
        cp /tmp/vyos_backend_env_backup backend/.env
        rm -f /tmp/vyos_backend_env_backup
        echo "Backend configuration restored."
    fi

    if [ -n "$DOCKER_COMPOSE_CMD" ]; then
        echo "Rebuilding and restarting containers..."
        $DOCKER_COMPOSE_CMD up -d --build --force-recreate
        check_status_and_logs
        create_admin_user
    else
        echo "Update complete. (Docker Compose not found, please restart manually)"
    fi
    echo "Update finished successfully."
}

uninstall_app() {
    echo ""
    echo "--- Uninstalling VyOS UI Manager ---"
    prompt_user "Are you SURE you want to uninstall? This will stop all containers. (y/N): " "n" confirm
    if [[ ! "$confirm" =~ ^[Yy]$ ]]; then
        echo "Uninstall cancelled."
        return
    fi

    if [ -n "$DOCKER_COMPOSE_CMD" ]; then
        prompt_user "Do you want to delete all database volumes? (CAUTION: Data will be lost) (y/N): " "n" del_volumes
        if [[ "$del_volumes" =~ ^[Yy]$ ]]; then
            $DOCKER_COMPOSE_CMD down -v
        else
            $DOCKER_COMPOSE_CMD down
        fi
    fi

    echo "Removing installation directory..."
    cd ..
    if [[ "$(basename "$PWD")" != "vyosdashy" ]]; then
        rm -rf vyosdashy
        echo "VyOS UI Manager has been uninstalled."
        exit 0
    else
        echo "Error: Could not determine directory safety. Please delete the 'vyosdashy' folder manually."
    fi
}

install_app() {
    echo ""
    echo "--- Fresh Installation ---"
    
    if [ ! -d ".git" ]; then
        if [ -d "vyosdashy" ]; then
            cd vyosdashy
        else
            echo "Cloning repository..."
            git clone https://github.com/tahasaifeee/vyosdashy.git vyosdashy
            cd vyosdashy
        fi
    fi

    reconfigure

    prompt_user "Do you want to start the application with docker? (y/N): " "n" run_docker
    if [[ "$run_docker" =~ ^[Yy]$ ]]; then
        if ! command -v docker >/dev/null 2>&1; then
            prompt_user "Docker not found. Install it? (y/N): " "n" inst_docker
            if [[ "$inst_docker" =~ ^[Yy]$ ]]; then
                curl -fsSL https://get.docker.com | sh
                if command -v systemctl >/dev/null 2>&1; then
                    sudo systemctl start docker
                    sudo systemctl enable docker
                fi
            fi
        fi

        DOCKER_COMPOSE_CMD=$(detect_docker_compose)
        if [ -z "$DOCKER_COMPOSE_CMD" ]; then
            prompt_user "Docker Compose not found. Install it? (y/N): " "n" inst_compose
            if [[ "$inst_compose" =~ ^[Yy]$ ]]; then
                if command -v apt-get >/dev/null 2>&1; then
                    sudo apt-get update && sudo apt-get install -y docker-compose-plugin
                    DOCKER_COMPOSE_CMD="docker compose"
                else
                    sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
                    sudo chmod +x /usr/local/bin/docker-compose
                    DOCKER_COMPOSE_CMD="docker-compose"
                fi
            fi
        fi

        if [ -n "$DOCKER_COMPOSE_CMD" ]; then
            $DOCKER_COMPOSE_CMD up -d --build --force-recreate
            echo "Waiting for database to initialize..."
            sleep 10
            check_status_and_logs
            create_admin_user
            echo "Application started!"
            echo "Frontend: http://localhost:3000"
            echo "Backend: http://localhost:8000"
        else
            echo "Installation finished, but Docker Compose is missing. Start it manually when ready."
        fi
    fi
}

# --- MAIN LOGIC ---

IS_INSTALLED=false
if [ -d ".git" ] || ([ -d "vyosdashy" ] && [ -d "vyosdashy/.git" ]); then
    IS_INSTALLED=true
fi

if [ "$IS_INSTALLED" = true ]; then
    if [ ! -d ".git" ] && [ -d "vyosdashy" ]; then
        cd vyosdashy
    fi

    echo "Existing installation detected."
    echo "1) Update (Pull latest code and rebuild)"
    echo "2) Reconfigure (Update .env settings and Admin user)"
    echo "3) Check Status & Logs"
    echo "4) Uninstall (Stop and remove everything)"
    echo "5) Exit"
    prompt_user "Select an option [1-5]: " "5" choice

    case $choice in
        1) update_app ;;
        2) reconfigure ;;
        3) check_status_and_logs ;;
        4) uninstall_app ;;
        *) exit 0 ;;
    esac
else
    install_app
fi
