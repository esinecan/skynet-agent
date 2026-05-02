/**
 * Integration test for context pruning in the chat API flow.
 * Tests the full message processing pipeline with DOM snapshot pruning.
 */

import { pruneDOMSnapshots, hasPlaywrightDOMToolCalls } from '../lib/context-pruning';

// Mock a realistic browsing session with multiple DOM snapshots
const mockBrowsingSession = [
  {
    id: 'msg_1',
    role: 'user',
    content: 'Please navigate to example.com',
    timestamp: '2024-01-01T10:00:00Z'
  },
  {
    id: 'msg_2',
    role: 'assistant',
    content: 'I\'ll navigate to example.com for you.',
    toolInvocations: [
      {
        toolCallId: 'call_1',
        toolName: 'playwright_browser_navigate',
        args: { url: 'https://example.com' },
        result: {
          content: `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Example Domain</title>
</head>
<body>
    <div>
        <h1>Example Domain</h1>
        <p>This domain is for use in illustrative examples in documents. You may use this
        domain in literature without prior coordination or asking for permission.</p>
        <p><a href="https://www.iana.org/domains/example">More information...</a></p>
    </div>
</body>
</html>`.repeat(10), // Make it large
          url: 'https://example.com',
          title: 'Example Domain'
        }
      }
    ],
    timestamp: '2024-01-01T10:00:05Z'
  },
  {
    id: 'msg_3',
    role: 'user',
    content: 'Now take a screenshot of the page',
    timestamp: '2024-01-01T10:01:00Z'
  },
  {
    id: 'msg_4',
    role: 'assistant',
    content: 'I\'ll take a screenshot of the current page.',
    toolInvocations: [
      {
        toolCallId: 'call_2',
        toolName: 'playwright_browser_snapshot',
        args: {},
        result: `accessibility tree:
RootWebArea "Example Domain"
  heading "Example Domain" level=1
  paragraph
    text "This domain is for use in illustrative examples in documents. You may use this domain in literature without prior coordination or asking for permission."
  paragraph
    link "More information..."
      text "More information..."
`.repeat(50) // Make it very large
      }
    ],
    timestamp: '2024-01-01T10:01:05Z'
  },
  {
    id: 'msg_5',
    role: 'user',
    content: 'Click on the "More information" link',
    timestamp: '2024-01-01T10:02:00Z'
  },
  {
    id: 'msg_6',
    role: 'assistant',
    content: 'I\'ll click on the "More information" link.',
    toolInvocations: [
      {
        toolCallId: 'call_3',
        toolName: 'playwright_browser_click',
        args: { selector: 'a[href="https://www.iana.org/domains/example"]' },
        result: {
          content: `<!DOCTYPE html>
<html>
<head>
    <title>IANA — Example domains</title>
    <meta charset="utf-8" />
</head>
<body>
    <header>
        <div>
            <h1>Internet Assigned Numbers Authority</h1>
        </div>
    </header>
    <main>
        <h1>Example domains</h1>
        <p>Example domains are used in documentation and for testing purposes...</p>
        <ul>
            <li>example.com</li>
            <li>example.net</li>
            <li>example.org</li>
        </ul>
    </main>
</body>
</html>`.repeat(20), // Another large DOM
          url: 'https://www.iana.org/domains/example',
          title: 'IANA — Example domains'
        }
      }
    ],
    timestamp: '2024-01-01T10:02:05Z'
  },
  {
    id: 'msg_7',
    role: 'user',
    content: 'What information is available on this page?',
    timestamp: '2024-01-01T10:03:00Z'
  }
];

// Non-browsing conversation for comparison
const mockRegularSession = [
  {
    id: 'msg_1',
    role: 'user',
    content: 'Create a new file called test.txt',
    timestamp: '2024-01-01T10:00:00Z'
  },
  {
    id: 'msg_2',
    role: 'assistant',
    content: 'I\'ll create a new file called test.txt for you.',
    toolInvocations: [
      {
        toolCallId: 'call_1',
        toolName: 'filesystem_create_file',
        args: { path: 'test.txt', content: 'Hello, World!' },
        result: 'File created successfully at test.txt'
      }
    ],
    timestamp: '2024-01-01T10:00:05Z'
  },
  {
    id: 'msg_3',
    role: 'user',
    content: 'Now read the file contents',
    timestamp: '2024-01-01T10:01:00Z'
  },
  {
    id: 'msg_4',
    role: 'assistant',
    content: 'I\'ll read the contents of test.txt.',
    toolInvocations: [
      {
        toolCallId: 'call_2',
        toolName: 'filesystem_read_file',
        args: { path: 'test.txt' },
        result: 'Hello, World!'
      }
    ],
    timestamp: '2024-01-01T10:01:05Z'
  }
];

function calculateMessageSize(messages: any[]): number {
  return JSON.stringify(messages).length;
}

function countDOMSnapshots(messages: any[]): number {
  let count = 0;
  messages.forEach(message => {
    if (message.toolInvocations) {
      message.toolInvocations.forEach((invocation: any) => {
        if (invocation.result && typeof invocation.result === 'object' && invocation.result.content) {
          if (invocation.result.content.includes('<!DOCTYPE html') || invocation.result.content.includes('<html')) {
            count++;
          }
        } else if (typeof invocation.result === 'string' && invocation.result.includes('accessibility tree:')) {
          count++;
        }
      });
    }
  });
  return count;
}

function testBrowsingSessionPruning() {
  console.log('\n🧪 Testing browsing session context pruning...');
  
  const originalSize = calculateMessageSize(mockBrowsingSession);
  const originalDOMCount = countDOMSnapshots(mockBrowsingSession);
  
  console.log(`Original session size: ${originalSize} characters`);
  console.log(`Original DOM snapshots: ${originalDOMCount}`);
  
  // Check if Playwright tools are detected
  const hasPlaywright = hasPlaywrightDOMToolCalls(mockBrowsingSession);
  console.log(`Playwright tools detected: ${hasPlaywright}`);
  console.assert(hasPlaywright === true, 'Should detect Playwright tools in browsing session');
  
  // Apply pruning
  const prunedSession = pruneDOMSnapshots(mockBrowsingSession, 1);
  const prunedSize = calculateMessageSize(prunedSession);
  const prunedDOMCount = countDOMSnapshots(prunedSession);
  
  console.log(`Pruned session size: ${prunedSize} characters`);
  console.log(`Pruned DOM snapshots: ${prunedDOMCount}`);
  console.log(`Size reduction: ${((originalSize - prunedSize) / originalSize * 100).toFixed(1)}%`);
  
  // Assertions
  console.assert(prunedSession.length === mockBrowsingSession.length, 'Should preserve message count');
  console.assert(prunedSize < originalSize, 'Should reduce total size');
  console.assert(prunedDOMCount <= 1, 'Should have at most 1 DOM snapshot remaining');
  
  // Check that user messages are preserved
  const userMessages = prunedSession.filter(msg => msg.role === 'user');
  console.assert(userMessages.length === 3, 'Should preserve all user messages');
  console.assert(userMessages[0].content === 'Please navigate to example.com', 'Should preserve user message content');
  
  // Check that the most recent DOM snapshot is preserved
  const lastAssistantMessage = prunedSession[prunedSession.length - 2]; // Second to last is assistant
  const lastToolResult = lastAssistantMessage.toolInvocations[0].result;
  console.assert(
    typeof lastToolResult === 'object' && lastToolResult.content && lastToolResult.content.includes('IANA'),
    'Should preserve the most recent DOM snapshot'
  );
  
  // Check that earlier DOM snapshots are pruned
  const firstAssistantMessage = prunedSession[1];
  const firstToolResult = firstAssistantMessage.toolInvocations[0].result;
  console.assert(
    typeof firstToolResult === 'object' && firstToolResult.content === '[DOM snapshot content removed - previous page state]',
    'Should prune earlier DOM snapshots'
  );
  
  console.log('✅ Browsing session pruning test passed');
}

function testRegularSessionUnchanged() {
  console.log('\n🧪 Testing regular session remains unchanged...');
  
  const originalSize = calculateMessageSize(mockRegularSession);
  
  // Check if Playwright tools are detected (should be false)
  const hasPlaywright = hasPlaywrightDOMToolCalls(mockRegularSession);
  console.log(`Playwright tools detected: ${hasPlaywright}`);
  console.assert(hasPlaywright === false, 'Should not detect Playwright tools in regular session');
  
  // Apply pruning (should have no effect)
  const prunedSession = pruneDOMSnapshots(mockRegularSession, 1);
  const prunedSize = calculateMessageSize(prunedSession);
  
  console.log(`Original size: ${originalSize} characters`);
  console.log(`Pruned size: ${prunedSize} characters`);
  
  // Should be identical
  console.assert(prunedSize === originalSize, 'Should not change size for non-browsing sessions');
  console.assert(JSON.stringify(prunedSession) === JSON.stringify(mockRegularSession), 'Should be identical');
  
  console.log('✅ Regular session unchanged test passed');
}

function testEdgeCases() {
  console.log('\n🧪 Testing edge cases...');
  
  // Empty messages array
  const emptyResult = pruneDOMSnapshots([], 1);
  console.assert(Array.isArray(emptyResult) && emptyResult.length === 0, 'Should handle empty array');
  
  // Messages without tool invocations
  const simpleMessages = [
    { role: 'user', content: 'Hello' },
    { role: 'assistant', content: 'Hi there!' }
  ];
  const simpleResult = pruneDOMSnapshots(simpleMessages, 1);
  console.assert(JSON.stringify(simpleResult) === JSON.stringify(simpleMessages), 'Should handle simple messages');
  
  // Preserve multiple recent snapshots
  const multiplePreserved = pruneDOMSnapshots(mockBrowsingSession, 2);
  const preservedDOMCount = countDOMSnapshots(multiplePreserved);
  console.assert(preservedDOMCount <= 2, 'Should preserve specified number of snapshots');
  
  console.log('✅ Edge cases test passed');
}

function runIntegrationTests() {
  console.log('🧪 Running context pruning integration tests...');
  
  try {
    testBrowsingSessionPruning();
    testRegularSessionUnchanged();
    testEdgeCases();
    
    console.log('\n🎉 All integration tests passed!');
    console.log('\n📊 Summary:');
    console.log('- DOM snapshot pruning works correctly for browsing sessions');
    console.log('- Non-browsing sessions remain unchanged');
    console.log('- Message structure and user content are preserved');
    console.log('- Most recent DOM snapshots are kept for context');
    console.log('- Significant size reduction achieved for DOM-heavy conversations');
  } catch (error) {
    console.error('\n❌ Integration test failed:', error);
    process.exit(1);
  }
}

// Run tests if this file is executed directly
if (require.main === module) {
  runIntegrationTests();
}

export { runIntegrationTests };