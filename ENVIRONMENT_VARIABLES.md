# Environment Variables Configuration

## RAG System Configuration

### Core RAG Settings

| Variable | Default | Description |
|----------|---------|-------------|
| `RAG_ENABLED` | `true` | Enable/disable RAG system |
| `RAG_MAX_MEMORIES` | `3` | Maximum memories to retrieve |
| `RAG_MIN_SIMILARITY` | `0.5` | Minimum similarity score for retrieval |
| `RAG_INCLUDE_SESSION_CONTEXT` | `false` | Include session context in retrieval |

### Summarization Settings

| Variable | Default | Description |
|----------|---------|-------------|
| `RAG_ENABLE_SUMMARIZATION` | `true` | Enable/disable automatic text summarization |
| `RAG_SUMMARIZATION_THRESHOLD` | `1000` | Character count threshold for auto-summarization |
| `RAG_SUMMARIZATION_PROVIDER` | `google` | LLM provider for summarization (google, openai) |

### ChromaDB Settings

| Variable | Default | Description |
|----------|---------|-------------|
| `CHROMA_URL` | `http://localhost:8000` | ChromaDB server URL |
| `CHROMA_COLLECTION` | `mcp_chat_memories` | Collection name for memories |

### LLM Provider Settings

| Variable | Default | Description |
|----------|---------|-------------|
| `LLM_PROVIDER` | `google` | LLM provider (google, deepseek, anthropic, etc.) |
| `GOOGLE_API_KEY` | - | Google AI API key |
| `DEEPSEEK_API_KEY` | - | DeepSeek API key |
| `ANTHROPIC_API_KEY` | - | Anthropic API key |

## Usage Examples

### Enable Summarization (Default)
```bash
RAG_ENABLE_SUMMARIZATION=true
RAG_SUMMARIZATION_THRESHOLD=1000
RAG_SUMMARIZATION_PROVIDER=google
```

### Disable Summarization
```bash
RAG_ENABLE_SUMMARIZATION=false
```

### Custom Threshold and Provider
```bash
RAG_SUMMARIZATION_THRESHOLD=500  # Summarize anything over 500 chars
RAG_SUMMARIZATION_PROVIDER=openai
```

## How Summarization Works

1. **Text Length Check**: Messages exceeding `RAG_SUMMARIZATION_THRESHOLD` characters are candidates for summarization
2. **Summarization Call**: Uses configured provider to summarize while preserving:
   - Dates and timestamps
   - File paths and URLs
   - Technical details and error codes
   - User intentions and context
3. **Storage**: The summarized version is stored in ChromaDB
4. **Fallback**: If summarization fails, the original text is stored
5. **Disable**: Set `RAG_ENABLE_SUMMARIZATION=false` to disable completely

## Benefits

- **Reduced Storage**: Significantly smaller RAG database
- **Faster Retrieval**: Smaller embeddings and faster searches
- **Better Context**: Key information preserved while noise is removed
- **Cost Effective**: Lower embedding generation costs
- **Backwards Compatible**: Can be disabled to work exactly as before