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

# Start ChromaDB
echo "🐳 Starting ChromaDB..."
if command -v docker-compose &> /dev/null; then
    docker-compose up -d chromadb
    echo "✅ ChromaDB started on http://localhost:8000"
else
    echo "❌ Docker Compose not found. Please install Docker and Docker Compose"
    echo "   Or start ChromaDB manually: docker run -p 8000:8000 chromadb/chroma"
fi

# Wait for ChromaDB to be ready
echo "⏳ Waiting for ChromaDB to be ready..."
for i in {1..30}; do
    if curl -s http://localhost:8000/api/v1/heartbeat > /dev/null 2>&1; then
        echo "✅ ChromaDB is ready!"
        break
    fi
    echo "   Waiting... ($i/30)"
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
