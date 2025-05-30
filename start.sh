#!/bin/bash

# Skynet Agent Startup Script with Local ChromaDB

set -e

echo "🚀 Starting Skynet Agent with local ChromaDB..."

# Create necessary directories
mkdir -p data/chroma data/memory

# Check if Python is available
if ! command -v python3 &> /dev/null && ! command -v python &> /dev/null; then
    echo "❌ Python is required but not installed"
    echo "   Please install Python 3.8+ and try again"
    exit 1
fi

# Determine Python command
PYTHON_CMD="python3"
if ! command -v python3 &> /dev/null; then
    PYTHON_CMD="python"
fi

echo "🐍 Using Python: $($PYTHON_CMD --version)"

# Check if pip is available
if ! command -v pip3 &> /dev/null && ! command -v pip &> /dev/null; then
    echo "❌ pip is required but not installed"
    echo "   Please install pip and try again"
    exit 1
fi

# Determine pip command
PIP_CMD="pip3"
if ! command -v pip3 &> /dev/null; then
    PIP_CMD="pip"
fi

# Install ChromaDB if not already installed
echo "🔄 Installing/updating ChromaDB..."
$PIP_CMD install chromadb

# Check if ChromaDB is already running
if curl -f http://localhost:8000/api/v1/heartbeat > /dev/null 2>&1; then
    echo "✅ ChromaDB is already running on port 8000"
else
    echo "🗄️  Starting ChromaDB locally..."
    echo "   Host: localhost"
    echo "   Port: 8000"
    echo "   Data Path: ./data/chroma"
    
    # Start ChromaDB in the background
    nohup chroma run --host localhost --port 8000 --path ./data/chroma > data/chroma.log 2>&1 &
    CHROMA_PID=$!
    echo "📝 ChromaDB PID: $CHROMA_PID"
    
    # Wait for ChromaDB to be ready
    echo "⏳ Waiting for ChromaDB to start..."
    max_attempts=30
    attempt=0
    while [ $attempt -lt $max_attempts ]; do
        if curl -f http://localhost:8000/api/v1/heartbeat > /dev/null 2>&1; then
            echo "✅ ChromaDB is ready!"
            break
        fi
        sleep 2
        attempt=$((attempt + 1))
        echo "   Attempt $attempt/$max_attempts..."
    done
    
    if [ $attempt -eq $max_attempts ]; then
        echo "❌ ChromaDB failed to start"
        echo "📋 ChromaDB log:"
        cat data/chroma.log
        exit 1
    fi
fi

# Wait for Skynet Agent to be ready
echo "⏳ Waiting for Skynet Agent to start..."
max_attempts=30
attempt=0
while [ $attempt -lt $max_attempts ]; do
    if curl -f http://localhost:5000/health > /dev/null 2>&1; then
        echo "✅ Skynet Agent is ready!"
        break
    fi
    sleep 2
    attempt=$((attempt + 1))
    echo "   Attempt $attempt/$max_attempts..."
done

if [ $attempt -eq $max_attempts ]; then
    echo "❌ Skynet Agent failed to start"
    exit 1
fi
# Start the GUI
echo "� Starting Skynet GUI..."
npm run dev:gui

echo ""
echo "🎉 Setup complete!"
echo ""
echo "📊 Service URLs:"
echo "   • Skynet GUI:      http://localhost:5173 (or check console output)"
echo "   • ChromaDB API:    http://localhost:8000"
echo ""
echo "� Useful commands:"
echo "   • Stop ChromaDB:   pkill -f 'chroma run'"
echo "   • View ChromaDB logs: tail -f data/chroma.log"
echo "   • ChromaDB status: curl http://localhost:8000/api/v1/heartbeat"
