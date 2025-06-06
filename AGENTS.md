# Agent Instructions

This file stores notes and instructions for future Codex agents working in this repository.

## Environment Limitations
- No browser access is available, so interactive UI testing cannot be performed.
- Commands that require interactive input (e.g., `npm run lint`) cannot be completed.
- Focus on static code inspection and running non-interactive scripts such as `npm run type-check`.

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
