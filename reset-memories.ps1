# PowerShell script to reset all memory systems
Write-Host "🧠 Resetting Skynet Agent Memories..." -ForegroundColor Yellow

# Stop Docker containers
Write-Host "Stopping Docker containers..." -ForegroundColor Blue
docker-compose down

# Remove memory data directories
Write-Host "Removing ChromaDB data..." -ForegroundColor Blue
if (Test-Path "data\chroma") {
    Remove-Item -Recurse -Force "data\chroma"
}
if (Test-Path "data\memories") {
    Remove-Item -Recurse -Force "data\memories"
}

Write-Host "Removing Neo4j data..." -ForegroundColor Blue
if (Test-Path "data\neo4j") {
    Remove-Item -Recurse -Force "data\neo4j"
}

# Remove chat history
Write-Host "Removing chat history..." -ForegroundColor Blue
if (Test-Path "data\chat-history.db") {
    Remove-Item -Force "data\chat-history.db"
}

# Reset sync state
Write-Host "Resetting sync state..." -ForegroundColor Blue
$resetState = @{
    lastSyncTimestamp = "1970-01-01T00:00:00.000Z"
    lastProcessedIds = @{
        chatMessages = @()
        consciousMemories = @()
        ragMemories = @()
    }
}
$resetState | ConvertTo-Json -Depth 3 | Out-File -FilePath "data\kg-sync-state.json" -Encoding UTF8

# Reset sync queue
Write-Host "Resetting sync queue..." -ForegroundColor Blue
$resetQueue = @{
    requests = @()
}
$resetQueue | ConvertTo-Json -Depth 3 | Out-File -FilePath "data\kg-sync-queue.json" -Encoding UTF8

# Recreate necessary directories
Write-Host "Recreating data directories..." -ForegroundColor Blue
New-Item -ItemType Directory -Force -Path "data\chroma"
New-Item -ItemType Directory -Force -Path "data\memories"
New-Item -ItemType Directory -Force -Path "data\neo4j"

# Restart Docker containers
Write-Host "Starting fresh Docker containers..." -ForegroundColor Green
docker-compose up -d

Write-Host "✅ Memory reset complete! All memories have been truncated." -ForegroundColor Green
Write-Host "You can now start the application with: npm run dev" -ForegroundColor Cyan
