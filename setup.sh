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
    python3 -c 'import secrets; print(secrets.token_urlsafe(32))' 2>/dev/null || \
    openssl rand -base64 32 2>/dev/null || \
    echo "temporary-secret-key-$(date +%s)"
}

# Ensure basic dependencies are present
install_if_missing curl
install_if_missing git
install_if_missing python3
install_if_missing sudo

DOCKER_COMPOSE_CMD=$(detect_docker_compose)

# --- MODULES ---

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
        docker exec -it vyosdashy-backend-1 python app/create_first_user.py "$ADMIN_EMAIL" "$ADMIN_PASSWORD" "$ADMIN_NAME" "admin" || \
        echo "Failed to create user. Please check container logs: docker logs vyosdashy-backend-1"
    fi
}

reconfigure() {
    echo ""
    echo "--- Reconfiguration ---"
    echo "Please provide the following information (press Enter for defaults):"

    prompt_user "Project Name [VyOS UI Manager]: " "VyOS UI Manager" PROJECT_NAME
    prompt_user "Postgres User [postgres]: " "postgres" POSTGRES_USER
    prompt_user "Postgres Password [secure_password]: " "secure_password" POSTGRES_PASSWORD
    prompt_user "Postgres Database [vyos_manager]: " "vyos_manager" POSTGRES_DB
    prompt_user "Postgres Server [db]: " "db" POSTGRES_SERVER

    GENERATED_KEY=$(generate_secret_key)
    prompt_user "Secret Key (press Enter to use generated): " "$GENERATED_KEY" SECRET_KEY
    prompt_user "Backend CORS Origins [http://localhost:3000,http://localhost:8000]: " "http://localhost:3000,http://localhost:8000" BACKEND_CORS_ORIGINS
    prompt_user "Next Public API URL [http://localhost:8000]: " "http://localhost:8000" NEXT_PUBLIC_API_URL
    prompt_user "Redis URL [redis://redis:6379/0]: " "redis://redis:6379/0" REDIS_URL

    DATABASE_URL="postgresql+asyncpg://${POSTGRES_USER}:${POSTGRES_PASSWORD}@${POSTGRES_SERVER}:5432/${POSTGRES_DB}"

    # Generate .env file without single quotes around values to avoid Docker parsing issues
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
        prompt_user "Restart containers to apply changes? (y/N): " "n" restart
        if [[ "$restart" =~ ^[Yy]$ ]]; then
            $DOCKER_COMPOSE_CMD up -d
        fi
        create_admin_user
    fi
}

update_app() {
    echo ""
    echo "--- Updating VyOS UI Manager ---"
    echo "Pulling latest changes from repository..."
    git pull
    
    if [ -n "$DOCKER_COMPOSE_CMD" ]; then
        echo "Rebuilding and restarting containers..."
        $DOCKER_COMPOSE_CMD up -d --build
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
            $DOCKER_COMPOSE_CMD up -d --build
            echo "Waiting for database to initialize..."
            sleep 10
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
    echo "3) Uninstall (Stop and remove everything)"
    echo "4) Exit"
    prompt_user "Select an option [1-4]: " "4" choice

    case $choice in
        1) update_app ;;
        2) reconfigure ;;
        3) uninstall_app ;;
        *) exit 0 ;;
    esac
else
    install_app
fi
