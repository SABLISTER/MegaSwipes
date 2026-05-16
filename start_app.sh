#!/bin/bash

# Ensure we are in the project root
cd "$(dirname "$0")"
PROJECT_DIR="$(pwd)"

# Function to load NVM
load_nvm() {
    export NVM_DIR="$HOME/.nvm"
    if [ -s "$NVM_DIR/nvm.sh" ]; then
        . "$NVM_DIR/nvm.sh"
    elif [ -s "/usr/local/nvm/nvm.sh" ]; then
        . "/usr/local/nvm/nvm.sh"
    else
        echo "Warning: NVM not found in standard locations."
    fi
}

load_nvm

# Install and use correct node version
echo "Setting up Node.js environment..."
if command -v nvm &> /dev/null; then
    nvm install 20.11.0
    nvm use 20.11.0
else
    echo "nvm command not found, skipping nvm setup..."
fi

# Create logs directory if it doesn't exist
mkdir -p "$PROJECT_DIR/logs"

# Check if session exists
if screen -list | grep -q "megaswipes"; then
    echo "Session 'megaswipes' already exists. Killing it..."
    screen -S megaswipes -X quit
    sleep 1
fi

# Start screen session
echo "Starting MegaSwipes in screen session 'megaswipes'..."
screen -dmS megaswipes

# Setup Backend (Window 0)
screen -S megaswipes -p 0 -X title backend
# We need to source nvm in the screen shell too because it's a new shell
screen -S megaswipes -p 0 -X stuff "export NVM_DIR=\"$HOME/.nvm\" && [ -s \"\$NVM_DIR/nvm.sh\" ] && . \"\$NVM_DIR/nvm.sh\" && nvm use 20.11.0\n"
screen -S megaswipes -p 0 -X stuff "npm run dev:backend 2>&1 | tee -a $PROJECT_DIR/logs/backend.log\n"

# Setup Frontend (Window 1)
screen -S megaswipes -X screen -t frontend
screen -S megaswipes -p 1 -X stuff "export NVM_DIR=\"$HOME/.nvm\" && [ -s \"\$NVM_DIR/nvm.sh\" ] && . \"\$NVM_DIR/nvm.sh\" && nvm use 20.11.0\n"
screen -S megaswipes -p 1 -X stuff "npm run dev:frontend 2>&1 | tee -a $PROJECT_DIR/logs/frontend.log\n"

echo "Done! Backend and Frontend are running in screen session 'megaswipes'."
echo ""
echo "Log files available at:"
echo "  - $PROJECT_DIR/logs/backend.log   (raw backend output)"
echo "  - $PROJECT_DIR/logs/frontend.log  (Vite dev server)"
echo "  - $PROJECT_DIR/logs/access.log    (HTTP requests)"
echo "  - $PROJECT_DIR/logs/error.log     (errors only)"
echo "  - $PROJECT_DIR/logs/app.log       (all application logs)"
echo ""
echo "Use 'screen -r megaswipes' to view live logs."
echo "Use 'tail -f $PROJECT_DIR/logs/backend.log' to follow logs."
