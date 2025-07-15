# Manual Testing Guide for Context Pruning

This guide helps you manually test the context pruning feature with the actual Playwright MCP server.

## Prerequisites

1. Ensure you have the Playwright MCP server configured in your `config.json`:

```json
{
  "mcp": {
    "servers": {
      "playwright": {
        "command": "npx",
        "args": ["@playwright/mcp@latest"]
      }
    }
  }
}
```

2. Start the application:
```bash
npm run dev
```

## Test Scenarios

### Scenario 1: Basic Browsing Session

1. **Initial Navigation**
   - Send: "Please navigate to https://example.com"
   - Expected: Normal navigation with DOM snapshot
   - Verify: Check browser dev tools network tab for message size

2. **Take Screenshot**
   - Send: "Take a screenshot of the current page"
   - Expected: Screenshot tool returns accessibility tree or DOM data
   - Verify: Large response in network requests

3. **Navigate to Another Page**
   - Send: "Now navigate to https://github.com"
   - Expected: New DOM snapshot, previous one should be pruned
   - Verify: Check console logs for "Playwright DOM tools detected, applying context pruning"

4. **Ask About Current Page**
   - Send: "What do you see on this page?"
   - Expected: LLM should respond based on current GitHub page, not example.com
   - Verify: Response should reference GitHub content, not example.com

### Scenario 2: Intensive Browsing

1. Navigate through multiple pages (5-6 different websites)
2. Take screenshots at each step
3. Verify that context doesn't grow excessively
4. Confirm that LLM maintains awareness of current page only

### Scenario 3: Mixed Tool Usage

1. Use both Playwright tools and other tools (filesystem, etc.)
2. Verify that only Playwright DOM content is pruned
3. Confirm other tool results remain intact

## What to Look For

### Console Logs

```
[Chat API Debug] Playwright DOM tools detected, applying context pruning
[context-pruning] Pruned 2 DOM snapshots from conversation history
[context-pruning] Preserving DOM snapshot 1 in message 5
```

### Network Requests

- Message sizes should not grow excessively
- After 3-4 browsing actions, message size should stabilize
- Early browsing actions should have placeholder content in history

### LLM Responses

- Should be aware of current page content
- Should not reference content from previous pages
- Should maintain coherent conversation flow

### Browser Dev Tools

1. Open Network tab
2. Look for `/api/chat` requests
3. Check request payload sizes
4. Verify that older DOM content is replaced with placeholders

## Expected Behavior

✅ **Good Signs:**
- Console shows pruning activity
- Message sizes stabilize after initial growth
- LLM focuses on current page context
- Conversation flows naturally

❌ **Warning Signs:**
- No pruning logs despite Playwright usage
- Message sizes continue growing indefinitely
- LLM confusion about current vs previous pages
- Context window overflow errors

## Debugging

If pruning isn't working:

1. **Check Tool Names**
   ```bash
   # In browser console, check actual tool names being called
   console.log('Last request payload:', lastRequestPayload);
   ```

2. **Verify Server Name**
   - Ensure Playwright server is named "playwright" in config
   - Check `mcpManager.getConnectedServers()` output

3. **Check Tool Patterns**
   - Verify actual tool names match patterns in `DOM_SNAPSHOT_TOOL_PATTERNS`
   - Add debugging logs to `isPlaywrightDOMTool()`

4. **Content Detection**
   - Verify DOM content is being detected properly
   - Check `containsDOMSnapshot()` with actual tool results

## Performance Testing

Monitor these metrics during extended browsing:

- Request payload size (should stabilize)
- Response time (should remain consistent)
- Memory usage (shouldn't grow indefinitely)
- Token count (if using paid LLM APIs)

## Success Criteria

The feature is working correctly if:

1. ✅ Console logs show pruning activity
2. ✅ Message sizes don't grow beyond reasonable limits
3. ✅ LLM maintains current page awareness
4. ✅ Conversation flow remains natural
5. ✅ No context overflow errors occur
6. ✅ Non-DOM tools continue working normally

## Troubleshooting

### Common Issues

1. **No Pruning Logs**
   - Check if Playwright server is properly connected
   - Verify tool names match expected patterns
   - Ensure `hasPlaywrightDOMToolCalls()` detects tools correctly

2. **LLM Still References Old Pages**
   - Check if current DOM snapshot is being preserved
   - Verify placeholder text is being used for old snapshots
   - Confirm most recent DOM content remains intact

3. **Context Still Overflowing**
   - Increase pruning aggressiveness (preserve fewer snapshots)
   - Check for other sources of large content
   - Verify DOM detection patterns are comprehensive

### Debug Commands

```bash
# Run diagnostic tests
npm run test:context-pruning

# See demonstration
npm run demo:context-pruning

# Check current configuration
npx tsx -e "
import { getAllMCPServers } from './src/config/default-mcp-servers';
console.log('MCP Servers:', getAllMCPServers());
"
```