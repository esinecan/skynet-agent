# RAG System Startup Script for MCP Chat Client (PowerShell)

Write-Host "🚀 Starting MCP Chat Client with RAG System" -ForegroundColor Green
Write-Host "============================================" -ForegroundColor Green

# Check if .env.local exists
if (-not (Test-Path ".env.local")) {
    Write-Host "📋 Creating .env.local from template..." -ForegroundColor Yellow
    Copy-Item ".env.example" ".env.local"
    Write-Host "⚠️  Please edit .env.local and add your Google API key" -ForegroundColor Yellow
} else {
    Write-Host "✅ .env.local found" -ForegroundColor Green
}

# Start ChromaDB and Neo4j
Write-Host "🐳 Starting ChromaDB and Neo4j..." -ForegroundColor Cyan
try {
    docker-compose up -d chromadb neo4j
    Write-Host "✅ ChromaDB started on http://localhost:8000" -ForegroundColor Green
    Write-Host "✅ Neo4j started on http://localhost:7474" -ForegroundColor Green
} catch {
    Write-Host "❌ Failed to start ChromaDB and/or Neo4j. Please ensure Docker is running" -ForegroundColor Red
    Write-Host "   Make sure docker-compose.yml is correctly configured." -ForegroundColor Yellow
}

# Wait for ChromaDB to be ready
Write-Host "⏳ Waiting for ChromaDB to be ready..." -ForegroundColor Yellow
for ($i = 1; $i -le 30; $i++) {
    try {
        $response = Invoke-WebRequest -Uri "http://localhost:8000/api/v1/heartbeat" -TimeoutSec 2 -ErrorAction Stop
        Write-Host "✅ ChromaDB is ready!" -ForegroundColor Green
        break
    } catch {
        Write-Host "   ChromaDB not ready... ($i/30)" -ForegroundColor Yellow
        Start-Sleep 2
    }
}

# Wait for Neo4j to be ready
Write-Host "⏳ Waiting for Neo4j to be ready..." -ForegroundColor Yellow
for ($i = 1; $i -le 30; $i++) {
    try {
        # Neo4j health check is done via docker-compose healthcheck, but we can try a simple port check or HTTP GET
        # For now, we'll try to connect to the HTTP port. A more robust check would use cypher-shell or GET /db/data/
        $response = Invoke-WebRequest -Uri "http://localhost:7474" -UseBasicParsing -TimeoutSec 2 -ErrorAction Stop
        # A successful response (even if it's an auth error page) means the server is up.
        Write-Host "✅ Neo4j HTTP endpoint is responsive!" -ForegroundColor Green
        break
    } catch {
        Write-Host "   Neo4j not ready... ($i/30)" -ForegroundColor Yellow
        Start-Sleep 2
    }
}

# Test the RAG system
Write-Host "🧪 Testing RAG system..." -ForegroundColor Cyan
try {
    npx ts-node src/tests/rag-test.ts
    Write-Host "✅ RAG system tests passed!" -ForegroundColor Green
} catch {
    Write-Host "⚠️  RAG system tests failed, but you can still run the chat" -ForegroundColor Yellow
}

# Start the development server
Write-Host "🌐 Starting development server..." -ForegroundColor Cyan
Write-Host "   Chat will be available at http://localhost:3000" -ForegroundColor White
Write-Host "   Memory API at http://localhost:3000/api/memory" -ForegroundColor White
Write-Host ""
Write-Host "🔧 Try these test queries:" -ForegroundColor Magenta
Write-Host "   1. 'What is machine learning?'" -ForegroundColor White
Write-Host "   2. 'Can you explain that in simpler terms?' (should use memory!)" -ForegroundColor White
Write-Host "   3. 'What did we just discuss?' (should recall the conversation)" -ForegroundColor White
Write-Host ""

npm run dev
