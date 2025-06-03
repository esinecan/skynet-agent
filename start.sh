#!/bin/bash

echo "🚀 Starting MCP Chat Client"
echo "=========================="

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
    echo "📦 Installing dependencies..."
    npm install
fi

# Start the development server
echo "🌟 Starting development server..."
echo "🔗 Opening http://localhost:3000"
echo ""
echo "✨ Features Available:"
echo "   - Chat with AI assistant"
echo "   - Chat history management"
echo "   - MCP tool integration"
echo ""
echo "💡 For RAG features, use: npm run start:rag"
echo ""

npm run dev
