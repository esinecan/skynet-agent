# PowerShell startup script for Windows
Write-Host "🚀 Starting MCP Chat Client" -ForegroundColor Green
Write-Host "========================" -ForegroundColor Green

# Check if node_modules exists
if (!(Test-Path "node_modules")) {
    Write-Host "📦 Installing dependencies..." -ForegroundColor Yellow
    npm install
}

# Start the development server
Write-Host "🌟 Starting development server..." -ForegroundColor Cyan
Write-Host "🔗 Opening http://localhost:3000" -ForegroundColor Blue
Write-Host ""
Write-Host "✨ Features Available:" -ForegroundColor Magenta
Write-Host "   - Chat with AI assistant" -ForegroundColor White
Write-Host "   - Chat history management" -ForegroundColor White
Write-Host "   - MCP tool integration" -ForegroundColor White
Write-Host ""
Write-Host "💡 For RAG features, use: npm run start:rag" -ForegroundColor Yellow
Write-Host ""

npm run dev
