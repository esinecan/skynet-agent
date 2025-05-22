# Skynet Agent (Warning: implementation not finished yet)

A cognitive AI agent with short-term and long-term memory layers, tool-calling capabilities, and autonomous behavior.

## Overview

This project implements a multi-layered cognitive agent architecture that integrates:

- Short-term memory for maintaining conversational context
- Long-term memory with recency-biased retrieval
- Tool integration via Model Context Protocol (MCP)
- Autonomous operation when idle

The agent is designed to maintain continuity in conversations, learn from interactions, use external tools when needed, and operate autonomously even without user prompts.

## Features

- **Short-Term Memory**: Maintains context for recent conversations
- **Long-Term Memory**: Stores and retrieves important information with recency bias
- **Memory Consolidation**: "Sleep cycle" process to summarize and organize memories
- **Tool Integration**: Uses MCP for standardized tool communication
- **Autonomous Behavior**: Continues to function without constant user input

## Getting Started

### Prerequisites

- Node.js (v18 or later)
- npm or yarn
- API keys for the LLM provider (see .env.example)

### Installation

1. Clone the repository:
```
git clone https://github.com/yourusername/skynet-agent.git
cd skynet-agent
```

2. Install dependencies:
```
npm install
```

3. Copy the .env.example file to .env and fill in your API keys:
```
cp .env.example .env
```

4. Start the development server:
```
npm run dev
```

## Architecture

The agent is built using LangGraph.js with a state-based workflow. Key components include:

- State graph for agent logic flow
- Memory systems (short-term via checkpointer, long-term via vector store)
- MCP server for tool and UI integration
- Scheduled processes for memory consolidation and autonomous actions

## License

MIT
