# Agent Instructions

This file stores notes and instructions for future Codex agents working in this repository.

## Environment Limitations
- No browser access is available, so interactive UI testing cannot be performed.
- Commands that require interactive input (e.g., `npm run lint`) cannot be completed.
- Focus on static code inspection and running non-interactive scripts such as `npm run type-check`.

## Testing with curl

You can extensively test this application using curl to simulate user flows. Below are the key testing patterns:

### Flow 1: New Chat Creation
```powershell
# 1. Start new chat (POST to /api/chat creates session automatically)
$body = @{
    messages = @(
        @{
            role = "user"
            content = "Hello, how are you?"
        }
    )
} | ConvertTo-Json -Depth 3

Invoke-WebRequest -Uri "http://localhost:3000/api/chat" -Method POST -Body $body -ContentType "application/json"
# Response will be streamed, includes session ID in metadata

# 2. List sessions to see the new chat

## Exploratory Testing Notes
- `npm run build` originally failed with a type error in `src/app/api/chat-history/[sessionId]/route.ts` because the handler context expected `params` to be a `Promise`. Restoring the asynchronous parameter resolved the issue.
- `npm run dev` worked even when the build failed. Using `curl` against `/api/chat-history` returned the list of sessions (empty by default). Posting to `/api/chat-history` and then `/api/chat-history/[sessionId]` successfully created and retrieved sessions.
- After reverting to `Promise`-based params, `npm run type-check` succeeds with no errors.
Invoke-WebRequest -Uri "http://localhost:3000/api/chat-history" -Method GET
```

### Flow 2: Load Existing Chat
```powershell
# 1. Get session list
Invoke-WebRequest -Uri "http://localhost:3000/api/chat-history" -Method GET

# 2. Load specific session (using sessionId from step 1)
Invoke-WebRequest -Uri "http://localhost:3000/api/chat-history/[sessionId]" -Method GET

# 3. Continue conversation in that session
$continueBody = @{
    messages = @(
        @{role = "user"; content = "Previous message"; sessionId = "[sessionId]"},
        @{role = "assistant"; content = "Previous response"},
        @{role = "user"; content = "New message"}
    )
    sessionId = "[sessionId]"
} | ConvertTo-Json -Depth 3

Invoke-WebRequest -Uri "http://localhost:3000/api/chat" -Method POST -Body $continueBody -ContentType "application/json"
```

### Flow 3: Tool Calls
```powershell
# Send message that triggers tool usage
$toolBody = @{
    messages = @(
        @{
            role = "user"
            content = "Remember that I like pizza"
        }
    )
} | ConvertTo-Json -Depth 3

Invoke-WebRequest -Uri "http://localhost:3000/api/chat" -Method POST -Body $toolBody -ContentType "application/json"
# Response will include tool_calls in the stream for memory operations

# Check if memory was stored
$searchBody = @{
    action = "search"
    query = "pizza"
} | ConvertTo-Json

Invoke-WebRequest -Uri "http://localhost:3000/api/conscious-memory" -Method POST -Body $searchBody -ContentType "application/json"
```

### Flow 4: File Attachments
```powershell
# 1. Upload file first
$fileContent = [System.IO.File]::ReadAllBytes("test.txt")
$fileBase64 = [System.Convert]::ToBase64String($fileContent)

# 2. Include attachment in chat
$attachBody = @{
    messages = @(
        @{
            role = "user"
            content = "Analyze this file"
        }
    )
    attachments = @(
        @{
            name = "test.txt"
            type = "text/plain"
            data = $fileBase64
        }
    )
} | ConvertTo-Json -Depth 3

Invoke-WebRequest -Uri "http://localhost:3000/api/chat" -Method POST -Body $attachBody -ContentType "application/json"
```

### Memory System Testing
```powershell
# Test RAG memory
$ragBody = @{
    action = "search"
    query = "test query"
} | ConvertTo-Json

Invoke-WebRequest -Uri "http://localhost:3000/api/memory" -Method POST -Body $ragBody -ContentType "application/json"

# Test conscious memory stats
$statsBody = @{
    action = "stats"
} | ConvertTo-Json

Invoke-WebRequest -Uri "http://localhost:3000/api/conscious-memory" -Method POST -Body $statsBody -ContentType "application/json"
```

### Session Management
```powershell
# Search sessions
Invoke-WebRequest -Uri "http://localhost:3000/api/chat-history/search?q=pizza" -Method GET

# Delete session
Invoke-WebRequest -Uri "http://localhost:3000/api/chat-history?sessionId=[sessionId]" -Method DELETE

# Delete all sessions
Invoke-WebRequest -Uri "http://localhost:3000/api/chat-history?sessionId=all" -Method DELETE
```

## API Overview
The Next.js API routes are under `src/app/api`. Key endpoints include:

### `/api/chat`
- **GET** `?sessionId=ID` – fetch an existing chat session for the `useChat` hook.
- **POST** – send chat messages and receive a streamed assistant response.

### `/api/chat-history`
- **GET** – list all chat sessions.
- **POST** – create or update a session with a title and messages.
- **DELETE** `?sessionId=ID|all` – delete a single session or all sessions.

### `/api/chat-history/[sessionId]`
- **GET** – retrieve a specific chat session by ID.
- **POST** – append a message (with optional attachments) to a session.

### `/api/chat-history/search`
- **GET** `?q=query` – search chat sessions by keyword.

### `/api/conscious-memory`
Supports a JSON body with an `action` field:
- `save` – store a memory item.
- `search` – query memories.
- `update`, `delete`, `deleteMultiple`, `clearAll`, `tags`, `related`, `stats`, `test`, `debug` – additional memory operations.
- `GET` with `action=stats` or `action=tags` provides basic info and a health check if no action is supplied.

### `/api/memory`
- **GET** – with `action` (`stats`, `health`, `test`) query RAG memory status.
- **POST** – actions `search` or `store` for the RAG layer.

### `/api/attachments`
- **GET** – return attachment statistics.
- **DELETE** `?id=ATTACHMENT_ID` – delete a stored attachment.

### `/api/upload`
- **POST** – upload files (up to 20 files, 50 MB each) and receive base64 data.
- **GET** – return upload limits and model support notes.

## Typical Flow
1. The React UI components in `src/app` call `/api/chat` to stream responses.
2. Conversations are stored in the SQLite-backed chat history via `/api/chat-history` and `/api/chat-history/[sessionId]`.
3. Attachments can be uploaded via `/api/upload` and associated with messages.
4. The RAG memory system exposes `/api/memory` for automatic context and `/api/conscious-memory` for explicit memory operations.

Document test results in PR summaries. Run `npm run type-check` after changes and note any failures. If interactive commands fail, mention this limitation.
