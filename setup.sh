#!/bin/bash

# VyOS Manager Setup Script

set -e

echo "----------------------------------------"
echo "   VyOS UI Manager - Setup Script"
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

# Helper for interactive input that works with curl | bash
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

# Ensure basic dependencies are present
install_if_missing curl
install_if_missing git
install_if_missing python3
install_if_missing sudo

# Check if we are inside a git repo or if we need to clone
if [ ! -d ".git" ]; then
    if [ -d "vyosdashy" ]; then
        echo "Directory 'vyosdashy' already exists. Entering directory..."
        cd vyosdashy
        if [ ! -d ".git" ]; then
             echo "Error: 'vyosdashy' exists but is not a git repository. Please remove it and try again."
             exit 1
        fi
        echo "Updating repository..."
        git pull
    else
        echo "It looks like you are running this script outside of the repository."
        echo "Cloning the repository to 'vyosdashy'..."
        git clone https://github.com/tahasaifeee/vyosdashy.git vyosdashy
        cd vyosdashy
    fi
fi

# Function to generate a random secret key
generate_secret_key() {
    python3 -c 'import secrets; print(secrets.token_urlsafe(32))' 2>/dev/null || \
    openssl rand -base64 32 2>/dev/null || \
    echo "temporary-secret-key-$(date +%s)"
}

# Check if .env already exists
if [ -f .env ]; then
    prompt_user ".env file already exists. Overwrite? (y/N): " "n" overwrite
    if [[ ! "$overwrite" =~ ^[Yy]$ ]]; then
        echo "Setup aborted."
        exit 0
    fi
fi

# Gather Information
echo ""
echo "Please provide the following information (press Enter for defaults):"

prompt_user "Project Name [VyOS UI Manager]: " "VyOS UI Manager" PROJECT_NAME
prompt_user "Postgres User [postgres]: " "postgres" POSTGRES_USER
prompt_user "Postgres Password [secure_password]: " "secure_password" POSTGRES_PASSWORD
prompt_user "Postgres Database [vyos_manager]: " "vyos_manager" POSTGRES_DB
prompt_user "Postgres Server [db]: " "db" POSTGRES_SERVER

GENERATED_KEY=$(generate_secret_key)
prompt_user "Secret Key (press Enter to use generated): " "$GENERATED_KEY" SECRET_KEY
prompt_user "Backend CORS Origins [http://localhost:3000,http://localhost:8000]: " '["http://localhost:3000", "http://localhost:8000"]' BACKEND_CORS_ORIGINS
prompt_user "Next Public API URL [http://localhost:8000]: " "http://localhost:8000" NEXT_PUBLIC_API_URL
prompt_user "Redis URL [redis://redis:6379/0]: " "redis://redis:6379/0" REDIS_URL

# Construct DATABASE_URL
DATABASE_URL="postgresql+asyncpg://${POSTGRES_USER}:${POSTGRES_PASSWORD}@${POSTGRES_SERVER}:5432/${POSTGRES_DB}"

# Create root .env file
cat << EOF > .env
# Project Settings
PROJECT_NAME="${PROJECT_NAME}"
SECRET_KEY="${SECRET_KEY}"

# Database Settings
POSTGRES_SERVER=${POSTGRES_SERVER}
POSTGRES_USER=${POSTGRES_USER}
POSTGRES_PASSWORD=${POSTGRES_PASSWORD}
POSTGRES_DB=${POSTGRES_DB}
DATABASE_URL=${DATABASE_URL}

# Backend Settings
BACKEND_CORS_ORIGINS='${BACKEND_CORS_ORIGINS}'
REDIS_URL=${REDIS_URL}

# Frontend Settings
NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}
EOF

# Copy/Sync to backend/.env for the app to pick up if it's running locally or via volume
cp .env backend/.env

echo ""
echo ".env files have been created successfully."
echo "----------------------------------------"

# Ask to run docker-compose
prompt_user "Do you want to start the application with docker? (y/N): " "n" run_docker
if [[ "$run_docker" =~ ^[Yy]$ ]]; then
    echo "Checking for Docker..."
    if ! command -v docker >/dev/null 2>&1; then
        echo "Docker is not installed."
        prompt_user "Would you like to install Docker now? (y/N): " "n" install_docker
        if [[ "$install_docker" =~ ^[Yy]$ ]]; then
            echo "Installing Docker..."
            curl -fsSL https://get.docker.com | sh
            # Start and enable docker if on systemd
            if command -v systemctl >/dev/null 2>&1; then
                sudo systemctl start docker
                sudo systemctl enable docker
            fi
        else
            echo "Please install Docker and then run the script again."
            exit 1
        fi
    fi

    echo "Checking for Docker Compose..."
    if docker compose version >/dev/null 2>&1; then
        DOCKER_COMPOSE_CMD="docker compose"
    elif docker-compose version >/dev/null 2>&1; then
        DOCKER_COMPOSE_CMD="docker-compose"
    else
        echo "Docker Compose is not found."
        prompt_user "Would you like to install Docker Compose plugin? (y/N): " "n" install_compose
        if [[ "$install_compose" =~ ^[Yy]$ ]]; then
            # Assuming Debian/Ubuntu based on common server environments
            if command -v apt-get >/dev/null 2>&1; then
                sudo apt-get update
                sudo apt-get install -y docker-compose-plugin
                DOCKER_COMPOSE_CMD="docker compose"
            else
                # Fallback to manual download if not on apt
                sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
                sudo chmod +x /usr/local/bin/docker-compose
                DOCKER_COMPOSE_CMD="docker-compose"
            fi
        else
            echo "Please install Docker Compose and then run: docker compose up -d"
            exit 1
        fi
    fi

    echo "Starting Docker containers using '$DOCKER_COMPOSE_CMD'..."
    $DOCKER_COMPOSE_CMD up -d --build
    echo ""
    echo "Application started!"
    echo "Frontend: http://localhost:3000"
    echo "Backend API: http://localhost:8000"
    echo "API Documentation: http://localhost:8000/docs"
else
    echo "Setup complete. You can start the application later with 'docker compose up -d'."
fi
