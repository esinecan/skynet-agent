#!/bin/bash

# Skynet Agent Docker Startup Script

set -e

# Create necessary directories
mkdir -p volumes/etcd volumes/milvus volumes/minio data/memory

# Copy environment variables if .env doesn't exist
if [ ! -f .env ]; then
    echo "📋 Copying .env.example to .env..."
    cp .env.example .env
    echo "⚠️  Please edit .env file with your API keys before continuing"
    echo "   Required: GOOGLE_API_KEY or other LLM provider API key"
    exit 1
fi

# Check if API key is configured
if ! grep -q "^GOOGLE_API_KEY=.*[^[:space:]]" .env; then
    echo "⚠️  No API key found in .env file"
    echo "   Please set GOOGLE_API_KEY in .env file"
    exit 1
fi

echo "📦 Building and starting services..."

# Build TypeScript and upload source maps to Sentry (if configured)
echo "🔧 Building TypeScript and preparing source maps..."
npm run build
if [ -d "dist" ]; then
    if [ -n "$SENTRY_DSN" ]; then
        echo "📤 Uploading source maps to Sentry..."
        npx @sentry/wizard@latest -i sourcemaps --saas --quiet || echo "⚠️  Source map upload failed (continuing anyway)"
    else
        echo "ℹ️  SENTRY_DSN not configured, skipping source map upload"
    fi
else
    echo "⚠️  Build failed, dist directory not found"
fi

# Build and start all services
docker-compose up --build -d

echo "⏳ Waiting for services to be healthy..."

# Wait for ChromaDB to be healthy
max_attempts=30
attempt=0
while [ $attempt -lt $max_attempts ]; do
    if docker-compose ps chromadb | grep -q "healthy"; then
        echo "✅ ChromaDB is healthy"
        break
    fi
    sleep 10
    attempt=$((attempt + 1))
done

if [ $attempt -eq $max_attempts ]; then
    echo "❌ ChromaDB failed to become healthy"
    docker-compose logs chromadb
    exit 1
fi

# Wait for Skynet Agent to be healthy
attempt=0
while [ $attempt -lt $max_attempts ]; do
    if curl -f http://localhost:3000/api/health > /dev/null 2>&1; then
        echo "✅ Skynet Agent is healthy"
        break
    fi
    echo "⏳ Waiting for Skynet Agent... (attempt $((attempt + 1))/$max_attempts)"
    sleep 5
    attempt=$((attempt + 1))
done

if [ $attempt -eq $max_attempts ]; then
    echo "❌ Skynet Agent failed to become healthy"
    docker-compose logs skynet-agent
    exit 1
fi

echo ""
echo "🎉 Skynet Agent is now running!"
echo ""
echo "📊 Service URLs:"
echo "   • Skynet Agent:    http://localhost:3000"
echo "   • Health Check:    http://localhost:3000/api/health"
echo "   • ChromaDB API:    http://localhost:8000"
echo ""
echo "💡 For standalone ChromaDB (development):"
echo "   docker run -v ./data/chroma:/chroma/chroma -p 8000:8000 chromadb/chroma"
echo ""
echo "📋 Useful commands:"
echo "   • View logs:       docker-compose logs -f"
echo "   • Stop services:   docker-compose down"
echo "   • Restart:         docker-compose restart skynet-agent"
echo ""
echo "🔍 Check status:"
echo "   docker-compose ps"
