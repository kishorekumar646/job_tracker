#!/bin/bash

# Job Tracker - Run both backend and frontend
# Usage: ./run_all.sh

set -e

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${BLUE}Starting Job Tracker...${NC}"

# Find Python executable
PYTHON=""
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

# Start backend in background
echo -e "${GREEN}Starting backend on port 8886...${NC}"
cd backend
export PYTHONPATH=$(pwd):$PYTHONPATH

$PYTHON -m uvicorn main:app --host 0.0.0.0 --port 8886 &
BACKEND_PID=$!
cd ..

# Wait for backend to start
sleep 2

# Start frontend
echo -e "${GREEN}Starting frontend on port 5173...${NC}"
cd frontend
npm run dev &
FRONTEND_PID=$!
cd ..

# Function to cleanup on exit
cleanup() {
    echo -e "\n${BLUE}Shutting down servers...${NC}"
    kill $BACKEND_PID 2>/dev/null || true
    kill $FRONTEND_PID 2>/dev/null || true
    exit 0
}

# Handle Ctrl+C
trap cleanup INT TERM

echo -e "${GREEN}Both servers running!${NC}"
echo -e "  Backend: http://localhost:8886"
echo -e "  Frontend: http://localhost:5173"

# Wait for processes
wait
