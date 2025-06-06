# Debugging Guide for Skynet Agent

##  Server-Side Debugging Setup

### Quick Start
```bash
npm run dev:debug
```

This will start the Next.js dev server with Node.js debugging enabled.

### Expected Output
```
Debugger listening on ws://127.0.0.1:9229/0cf90313-350d-4466-a748-cd60f4e47c95
For help, see: https://nodejs.org/en/docs/inspector
ready - started server on 0.0.0.0:3000, url: http://localhost:3000
```

##  Chrome DevTools Setup

1. **Open Chrome DevTools**
   - Open a new tab in Chrome
   - Navigate to `chrome://inspect`

2. **Configure Debugging Ports**
   - Click "Configure..." button
   - Ensure these ports are listed:
     - `localhost:9229`
     - `localhost:9230`
   - Add them if missing

3. **Connect to Your App**
   - Look for your application under "Remote Target" section
   - Click "inspect" to open DevTools window
   - Go to "Sources" tab

##  Firefox DevTools Setup

1. **Open Firefox Debugger**
   - Open a new tab in Firefox
   - Navigate to `about:debugging`

2. **Connect to App**
   - Click "This Firefox" in left sidebar
   - Under "Remote Targets", find your Next.js application
   - Click "Inspect" to open debugger
   - Go to "Debugger" tab

##  VS Code Tasks

Two tasks are available:

1. **Start Skynet GUI** - Normal development mode
2. **Start Skynet GUI (Debug)** - Debug mode with inspector

Access via `Ctrl+Shift+P` → "Tasks: Run Task"

##  Finding Your Files in DevTools

When searching for files (`Ctrl+P` / `⌘+P`), your source files will have paths like:
```
webpack://{application-name}/./src/lib/llm-service.ts
webpack://{application-name}/./src/lib/rag.ts
webpack://{application-name}/./src/app/api/chat/route.ts
```

##  Debugging Server Errors

When you see an error overlay:
1. Look for the Node.js icon underneath the Next.js version
2. Click it to copy the DevTools URL to clipboard
3. Paste in new browser tab to inspect the server process

##  Key Files to Debug

For the summarization feature:
- `src/lib/text-summarizer.ts` - Standalone summarization logic
- `src/lib/rag.ts` - RAG service with summarization integration
- `src/lib/rag-config.ts` - Configuration management
- `src/app/api/chat/route.ts` - Chat API endpoint

##  Common Debugging Scenarios

### 1. Circular Dependency Issues
- Check import chains in DevTools
- Look for module loading errors in console
- Verify service initialization order

### 2. Summarization Not Working
- Set breakpoints in `RAGService.storeConversation()`
- Check `shouldSummarize()` function logic
- Verify environment variables in config

### 3. API Call Failures
- Breakpoint in `summarizeText()` function
- Check API key availability
- Monitor network requests in DevTools

##  Environment Variables for Debugging

Add these to your `.env.local` for verbose debugging:

```bash
# Enable summarization debugging
RAG_ENABLE_SUMMARIZATION=true
RAG_SUMMARIZATION_THRESHOLD=100  # Lower threshold for testing
RAG_SUMMARIZATION_PROVIDER=google

# Enable detailed logging (if supported)
DEBUG=*
NODE_ENV=development
```

##  Quick Test Commands

```bash
# Test with debugging
npm run dev:debug

# Build to check for compile errors
npm run build

# Run specific tests
npm run test:rag
```

##  Windows-Specific Notes

- Uses `cross-env` for NODE_OPTIONS compatibility
- Ensure Windows Defender is disabled for better performance
- Use PowerShell or Command Prompt (both work with cross-env)

##  Useful URLs

- **Application**: http://localhost:3000
- **Chrome Inspector**: chrome://inspect
- **Firefox Debugger**: about:debugging
- **DevTools Documentation**: https://nodejs.org/en/docs/inspector
