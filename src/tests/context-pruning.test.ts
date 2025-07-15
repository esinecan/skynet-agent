import { 
  isPlaywrightDOMTool, 
  containsDOMSnapshot, 
  messageHasDOMContent,
  pruneDOMSnapshots,
  hasPlaywrightDOMToolCalls,
  pruneDOMFromToolResult
} from '../lib/context-pruning';

// Test data
const mockDOMSnapshot = `
<!DOCTYPE html>
<html>
<head><title>Test Page</title></head>
<body>
<div id="content">
  <h1>Welcome</h1>
  <p>This is a test page with lots of content...</p>
  <!-- Simulate a large DOM tree -->
  ${'<div>'.repeat(1000)}Content${'</div>'.repeat(1000)}
</div>
</body>
</html>
`;

const mockAccessibilityTree = `
accessibility tree:
RootWebArea "Test Page"
  heading "Welcome" level=1
  paragraph
    text "This is a test page with lots of content..."
  button "Click me"
  link "Home"
  navigation
    list
      listitem
        link "About"
      listitem
        link "Contact"
`;

// Test isPlaywrightDOMTool function
function testIsPlaywrightDOMTool() {
  console.log('Testing isPlaywrightDOMTool...');
  
  // Should return true for playwright server DOM tools
  console.assert(isPlaywrightDOMTool('playwright', 'browser_snapshot') === true, 'Should detect browser_snapshot');
  console.assert(isPlaywrightDOMTool('playwright', 'browser_navigate') === true, 'Should detect browser_navigate');
  console.assert(isPlaywrightDOMTool('playwright', 'browser_click') === true, 'Should detect browser_click');
  console.assert(isPlaywrightDOMTool('playwright', 'snapshot') === true, 'Should detect shortened tool names');
  
  // Should return false for non-playwright servers
  console.assert(isPlaywrightDOMTool('filesystem', 'browser_snapshot') === false, 'Should not detect non-playwright servers');
  
  // Should return false for non-DOM tools
  console.assert(isPlaywrightDOMTool('playwright', 'random_tool') === false, 'Should not detect non-DOM tools');
  
  console.log('✅ isPlaywrightDOMTool tests passed');
}

// Test containsDOMSnapshot function
function testContainsDOMSnapshot() {
  console.log('Testing containsDOMSnapshot...');
  
  // Should detect HTML content
  console.assert(containsDOMSnapshot(mockDOMSnapshot) === true, 'Should detect HTML content');
  console.assert(containsDOMSnapshot('<html><body>test</body></html>') === true, 'Should detect simple HTML');
  
  // Should detect accessibility tree
  console.assert(containsDOMSnapshot(mockAccessibilityTree) === true, 'Should detect accessibility tree');
  
  // Should detect large content
  console.assert(containsDOMSnapshot('x'.repeat(15000)) === true, 'Should detect large content');
  
  // Should not detect small, non-DOM content
  console.assert(containsDOMSnapshot('Hello world') === false, 'Should not detect simple text');
  console.assert(containsDOMSnapshot('{"result": "success"}') === false, 'Should not detect JSON');
  
  // Should handle objects
  console.assert(containsDOMSnapshot({ content: mockDOMSnapshot }) === true, 'Should detect DOM in object.content');
  console.assert(containsDOMSnapshot({ text: mockAccessibilityTree }) === true, 'Should detect DOM in object.text');
  console.assert(containsDOMSnapshot({ result: 'success' }) === false, 'Should not detect simple objects');
  
  console.log('✅ containsDOMSnapshot tests passed');
}

// Test messageHasDOMContent function
function testMessageHasDOMContent() {
  console.log('Testing messageHasDOMContent...');
  
  const messageWithDOM = {
    role: 'assistant',
    content: 'I took a screenshot',
    toolInvocations: [{
      toolCallId: 'call_1',
      toolName: 'playwright_browser_snapshot',
      args: {},
      result: mockDOMSnapshot
    }]
  };
  
  const messageWithoutDOM = {
    role: 'assistant',
    content: 'File created successfully',
    toolInvocations: [{
      toolCallId: 'call_1',
      toolName: 'filesystem_create_file',
      args: { path: 'test.txt' },
      result: 'File created'
    }]
  };
  
  const messageNoTools = {
    role: 'user',
    content: 'Hello'
  };
  
  console.assert(messageHasDOMContent(messageWithDOM) === true, 'Should detect DOM in tool invocations');
  console.assert(messageHasDOMContent(messageWithoutDOM) === false, 'Should not detect non-DOM tools');
  console.assert(messageHasDOMContent(messageNoTools) === false, 'Should handle messages without tools');
  
  console.log('✅ messageHasDOMContent tests passed');
}

// Test pruneDOMFromToolResult function
function testPruneDOMFromToolResult() {
  console.log('Testing pruneDOMFromToolResult...');
  
  // Test string result
  const prunedString = pruneDOMFromToolResult(mockDOMSnapshot);
  console.assert(prunedString === '[DOM snapshot content removed - previous page state]', 'Should prune DOM string');
  
  // Test object result
  const domResult = { content: mockDOMSnapshot, status: 'success' };
  const prunedObject = pruneDOMFromToolResult(domResult);
  console.assert(prunedObject.content === '[DOM snapshot content removed - previous page state]', 'Should prune DOM in object.content');
  console.assert(prunedObject.status === 'success', 'Should preserve non-DOM fields');
  
  // Test non-DOM content
  const normalResult = 'File saved successfully';
  const unprunedNormal = pruneDOMFromToolResult(normalResult);
  console.assert(unprunedNormal === normalResult, 'Should not prune non-DOM content');
  
  console.log('✅ pruneDOMFromToolResult tests passed');
}

// Test pruneDOMSnapshots function
function testPruneDOMSnapshots() {
  console.log('Testing pruneDOMSnapshots...');
  
  const messages = [
    {
      role: 'user',
      content: 'Navigate to google.com'
    },
    {
      role: 'assistant',
      content: 'Navigating to Google',
      toolInvocations: [{
        toolCallId: 'call_1',
        toolName: 'playwright_browser_navigate',
        args: { url: 'https://google.com' },
        result: mockDOMSnapshot
      }]
    },
    {
      role: 'user',
      content: 'Click the search button'
    },
    {
      role: 'assistant',
      content: 'Clicking search button',
      toolInvocations: [{
        toolCallId: 'call_2',
        toolName: 'playwright_browser_click',
        args: { selector: '#search-button' },
        result: mockAccessibilityTree
      }]
    },
    {
      role: 'user',
      content: 'What do you see now?'
    }
  ];
  
  const prunedMessages = pruneDOMSnapshots(messages, 1);
  
  // Should have same number of messages
  console.assert(prunedMessages.length === messages.length, 'Should preserve message count');
  
  // First DOM snapshot should be pruned
  const firstAssistantMessage = prunedMessages[1];
  console.assert(
    firstAssistantMessage.toolInvocations[0].result === '[DOM snapshot content removed - previous page state]',
    'Should prune first DOM snapshot'
  );
  
  // Last DOM snapshot should be preserved
  const secondAssistantMessage = prunedMessages[3];
  console.assert(
    secondAssistantMessage.toolInvocations[0].result === mockAccessibilityTree,
    'Should preserve last DOM snapshot'
  );
  
  // User messages should be unchanged
  console.assert(prunedMessages[0].content === 'Navigate to google.com', 'Should preserve user messages');
  console.assert(prunedMessages[4].content === 'What do you see now?', 'Should preserve user messages');
  
  console.log('✅ pruneDOMSnapshots tests passed');
}

// Test hasPlaywrightDOMToolCalls function
function testHasPlaywrightDOMToolCalls() {
  console.log('Testing hasPlaywrightDOMToolCalls...');
  
  const messagesWithPlaywright = [
    { role: 'user', content: 'Take a screenshot' },
    {
      role: 'assistant',
      content: 'Taking screenshot',
      toolInvocations: [{
        toolCallId: 'call_1',
        toolName: 'playwright_browser_snapshot',
        args: {},
        result: mockDOMSnapshot
      }]
    }
  ];
  
  const messagesWithoutPlaywright = [
    { role: 'user', content: 'Create a file' },
    {
      role: 'assistant',
      content: 'Creating file',
      toolInvocations: [{
        toolCallId: 'call_1',
        toolName: 'filesystem_create_file',
        args: { path: 'test.txt' },
        result: 'File created'
      }]
    }
  ];
  
  console.assert(hasPlaywrightDOMToolCalls(messagesWithPlaywright) === true, 'Should detect Playwright tools');
  console.assert(hasPlaywrightDOMToolCalls(messagesWithoutPlaywright) === false, 'Should not detect non-Playwright tools');
  console.assert(hasPlaywrightDOMToolCalls([]) === false, 'Should handle empty array');
  
  console.log('✅ hasPlaywrightDOMToolCalls tests passed');
}

// Run all tests
function runTests() {
  console.log('🧪 Running context pruning tests...\n');
  
  try {
    testIsPlaywrightDOMTool();
    testContainsDOMSnapshot();
    testMessageHasDOMContent();
    testPruneDOMFromToolResult();
    testPruneDOMSnapshots();
    testHasPlaywrightDOMToolCalls();
    
    console.log('\n🎉 All context pruning tests passed!');
  } catch (error) {
    console.error('\n❌ Test failed:', error);
    process.exit(1);
  }
}

// Run tests if this file is executed directly
if (require.main === module) {
  runTests();
}

export { runTests };