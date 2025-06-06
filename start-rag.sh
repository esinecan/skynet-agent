#!/bin/bash

# RAG System Startup Script for MCP Chat Client

echo "🚀 Starting MCP Chat Client with RAG System"
echo "============================================"

# Check if .env.local exists
if [ ! -f .env.local ]; then
    echo "📋 Creating .env.local from template..."
    cp .env.example .env.local
    echo "⚠️  Please edit .env.local and add your Google API key"
else
    echo "✅ .env.local found"
fi

# Start ChromaDB and Neo4j
echo "🐳 Starting ChromaDB and Neo4j..."
if command -v docker-compose &> /dev/null; then
    docker-compose up -d chromadb neo4j
    if [ $? -eq 0 ]; then
        echo "✅ ChromaDB started on http://localhost:8000"
        echo "✅ Neo4j started on http://localhost:7474"
    else
        echo "❌ Failed to start ChromaDB and/or Neo4j with docker-compose."
        echo "   Please ensure Docker is running and docker-compose.yml is correct."
        # Optionally, exit here or allow script to continue if some parts are optional
    fi
else
    echo "❌ Docker Compose not found. Please install Docker and Docker Compose."
    echo "   Cannot start ChromaDB or Neo4j automatically."
fi

# Wait for ChromaDB to be ready
echo "⏳ Waiting for ChromaDB to be ready..."
for i in {1..30}; do
    if curl -s -f "http://localhost:8000/api/v1/heartbeat" > /dev/null 2>&1; then
        echo "✅ ChromaDB is ready!"
        break
    fi
    echo "   ChromaDB not ready... ($i/30)"
    sleep 2
done

# Wait for Neo4j to be ready
echo "⏳ Waiting for Neo4j to be ready..."
for i in {1..30}; do
    # Attempt to curl the Neo4j browser endpoint.
    # Neo4j's HTTP endpoint returns 200 for the browser, even if auth is enabled.
    # The healthcheck in docker-compose is more robust but this is a good script-level check.
    if curl -s -f -o /dev/null "http://localhost:7474"; then
        echo "✅ Neo4j HTTP endpoint is responsive!"
        break
    fi
    echo "   Neo4j not ready... ($i/30)"
    sleep 2
done

# Test the RAG system
echo "🧪 Testing RAG system..."
if npm run test:rag; then
    echo "✅ RAG system tests passed!"
else
    echo "⚠️  RAG system tests failed, but you can still run the chat"
fi

# Start the development server
echo "🌐 Starting development server..."
echo "   Chat will be available at http://localhost:3000"
echo "   Memory API at http://localhost:3000/api/memory"
echo ""
echo "🔧 Try these test queries:"
echo "   1. 'What is machine learning?'"
echo "   2. 'Can you explain that in simpler terms?' (should use memory!)"
echo "   3. 'What did we just discuss?' (should recall the conversation)"
echo ""
npm run dev
