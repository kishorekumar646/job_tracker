#!/bin/bash

# Job Tracker - Run both backend and frontend for Job Application Portal
# Usage: ./run.sh (from project root)

set -e

GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${BLUE}Starting Job Tracker...${NC}"

# Detect OS and set paths accordingly
if [[ "$OSTYPE" == "msys" ]] || [[ "$OSTYPE" == "win32" ]] || [[ "$OSTYPE" == "cygwin" ]]; then
    IS_WINDOWS=true
else
    IS_WINDOWS=false
fi

# Find Python executable
if command -v python &> /dev/null; then
    PYTHON="python"
elif command -v python3 &> /dev/null; then
    PYTHON="python3"
else
    echo -e "${RED}Error: Python not found. Please install Python 3.x${NC}"
    exit 1
fi

# Check for Node.js/npm
if ! command -v npm &> /dev/null && ! command -v node &> /dev/null; then
    echo -e "${RED}Error: Node.js/npm not found. Please install Node.js${NC}"
    exit 1
fi

# Kill any existing processes on ports
echo -e "${BLUE}Cleaning up ports...${NC}"
if ! $IS_WINDOWS; then
    pkill -f "uvicorn.*8886" 2>/dev/null || true
    pkill -f "vite.*5173" 2>/dev/null || true
    lsof -ti tcp:8886 2>/dev/null | xargs kill -9 2>/dev/null || true
    lsof -ti tcp:5173 2>/dev/null | xargs kill -9 2>/dev/null || true
fi
sleep 1

# Start backend
echo -e "${GREEN}Starting backend on port 8886...${NC}"
cd job_portal

# Create virtual environment if needed
if [ ! -d "venv" ]; then
    echo -e "${BLUE}Creating virtual environment...${NC}"
    $PYTHON -m venv venv
fi

# Install dependencies (don't activate venv, use venv's pip/python directly)
echo -e "${BLUE}Installing dependencies...${NC}"
if $IS_WINDOWS; then
    ./venv/Scripts/pip install -q fastapi uvicorn sqlalchemy aiosqlite pydantic-settings python-multipart 2>/dev/null || true
    ./venv/Scripts/python main.py &
else
    source venv/bin/activate
    pip install -q fastapi uvicorn[standard] sqlalchemy aiosqlite pydantic-settings python-multipart 2>/dev/null || true
    python main.py &
fi
BACKEND_PID=$!
cd ..

# Wait for backend to be ready
sleep 3
echo -e "${GREEN}Backend running at http://localhost:8886${NC}"

# Start frontend
echo -e "${GREEN}Starting frontend on port 5173...${NC}"
cd frontend
npm install --quiet 2>/dev/null || npm.cmd install --quiet 2>/dev/null || true
npm run dev &
FRONTEND_PID=$!
cd ..

echo -e ""
echo -e "${GREEN}Both servers running!${NC}"
echo -e "  Backend: http://localhost:8886"
echo -e "  Frontend: http://localhost:5173"
echo -e ""
echo -e "${BLUE}Press Ctrl+C to stop both servers${NC}"

# Cleanup function
cleanup() {
    echo -e "\n${BLUE}Shutting down servers...${NC}"
    kill $BACKEND_PID 2>/dev/null || true
    kill $FRONTEND_PID 2>/dev/null || true
    exit 0
}

trap cleanup INT TERM

wait