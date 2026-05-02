# Context Pruning for Playwright MCP Tools

This document describes the context pruning feature that prevents DOM snapshots from overflowing the LLM context window when using Playwright MCP server tools.

## Problem

When using the Playwright MCP server for web browsing, tools like `browser_snapshot`, `browser_navigate`, and `browser_click` return large DOM content that can quickly fill up the context window. This creates several issues:

- Context window overflow causing API errors
- Degraded performance due to excessive context length
- Inability to continue long browsing sessions
- High token costs for processing large DOM content

## Solution

The context pruning system automatically detects when Playwright tools are being used and removes previous DOM snapshots from the conversation history, while preserving:

- All user messages
- The most recent DOM snapshot (current page state)
- All non-DOM tool results
- Assistant text responses

## How It Works

### Detection

The system identifies DOM content through:

1. **Tool Name Patterns**: Recognizes Playwright tools that typically return DOM content:
   - `browser_snapshot`
   - `browser_navigate`
   - `browser_click`
   - `browser_type`
   - `browser_hover`
   - And other browser interaction tools

2. **Content Analysis**: Detects DOM content by looking for:
   - HTML tags (`<html>`, `<body>`, `<!DOCTYPE>`)
   - Accessibility tree markers
   - Large content size (>10KB)

### Pruning Process

When Playwright tools are detected in a conversation:

1. **Message Scanning**: Scans all messages for DOM content in tool invocations
2. **Content Preservation**: Keeps the most recent DOM snapshot (configurable)
3. **Content Replacement**: Replaces older DOM content with placeholder text
4. **Structure Preservation**: Maintains original message structure and metadata

### Implementation

The pruning happens in the chat API route before messages are sent to the LLM:

```typescript
// Check if any recent messages contain Playwright DOM tools
const hasPlaywrightTools = hasPlaywrightDOMToolCalls(enhancedMessages);

// If Playwright tools are detected, prune DOM snapshots
if (hasPlaywrightTools) {
  logger.info('Playwright DOM tools detected, applying context pruning');
  enhancedMessages = pruneDOMSnapshots(enhancedMessages, 1);
}
```

## Configuration

### Preservation Count

You can configure how many recent DOM snapshots to preserve:

```typescript
// Keep only the most recent DOM snapshot (default)
pruneDOMSnapshots(messages, 1);

// Keep the 2 most recent DOM snapshots
pruneDOMSnapshots(messages, 2);
```

### Tool Detection

The system automatically detects Playwright tools from the "playwright" MCP server. You can extend the detection patterns in `src/lib/context-pruning.ts`:

```typescript
const DOM_SNAPSHOT_TOOL_PATTERNS = [
  'browser_snapshot',
  'browser_navigate',
  // Add more patterns here
];
```

## Benefits

- **Prevents Context Overflow**: Automatically manages context size
- **Maintains Current Context**: Preserves the current page state
- **Preserves Conversation Flow**: Keeps all user messages and responses
- **Transparent Operation**: Works automatically without user intervention
- **Significant Size Reduction**: Typically 50-70% reduction in context size

## Testing

Run the context pruning tests:

```bash
# Unit tests
npm run test:context-pruning

# Demonstration
npm run demo:context-pruning
```

## Files

- `src/lib/context-pruning.ts` - Core pruning logic
- `src/app/api/chat/route.ts` - Integration with chat API
- `src/tests/context-pruning.test.ts` - Unit tests
- `src/tests/integration-context-pruning.test.ts` - Integration tests
- `src/scripts/demo-context-pruning.ts` - Demonstration script

## Example

Before pruning (63.7KB):
```
User: Navigate to GitHub
Assistant: [with full DOM snapshot of GitHub homepage]
User: Click sign in
Assistant: [with full DOM snapshot of sign in page]
User: What do you see?
```

After pruning (26.0KB, 59% reduction):
```
User: Navigate to GitHub
Assistant: [DOM content removed - previous page state]
User: Click sign in  
Assistant: [with full DOM snapshot of sign in page - current state]
User: What do you see?
```

The system preserves the current page context while removing historical DOM data that's no longer needed.