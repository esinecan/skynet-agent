#!/usr/bin/env node

/**
 * Demonstration script showing context pruning in action.
 * This simulates how the system would handle a real browsing session.
 */

import { pruneDOMSnapshots, hasPlaywrightDOMToolCalls } from '../lib/context-pruning';

// Simulate a realistic browsing conversation
const demoConversation = [
  {
    role: 'user',
    content: 'Please navigate to GitHub.com and take a screenshot'
  },
  {
    role: 'assistant', 
    content: 'I\'ll navigate to GitHub.com and take a screenshot for you.',
    toolInvocations: [
      {
        toolCallId: 'call_1',
        toolName: 'playwright_browser_navigate',
        args: { url: 'https://github.com' },
        result: {
          content: '<!DOCTYPE html><html><head><title>GitHub</title></head><body>' + 'x'.repeat(20000) + '</body></html>',
          url: 'https://github.com',
          title: 'GitHub'
        }
      },
      {
        toolCallId: 'call_2', 
        toolName: 'playwright_browser_snapshot',
        args: {},
        result: 'accessibility tree:\nRootWebArea "GitHub"\n  navigation "Main"\n    link "Sign in"\n    link "Sign up"\n  main\n    heading "Build what\'s next"\n' + '    button "Sign up for GitHub"\n'.repeat(500)
      }
    ]
  },
  {
    role: 'user',
    content: 'Now click on the Sign in button'
  },
  {
    role: 'assistant',
    content: 'I\'ll click on the Sign in button.',
    toolInvocations: [
      {
        toolCallId: 'call_3',
        toolName: 'playwright_browser_click', 
        args: { selector: 'a[href="/login"]' },
        result: {
          content: '<!DOCTYPE html><html><head><title>Sign in to GitHub</title></head><body>' + 'y'.repeat(25000) + '</body></html>',
          url: 'https://github.com/login',
          title: 'Sign in to GitHub'
        }
      }
    ]
  },
  {
    role: 'user',
    content: 'What do you see on the sign in page?'
  }
];

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function analyzeConversation(messages: any[], label: string) {
  const size = JSON.stringify(messages).length;
  const domTools = hasPlaywrightDOMToolCalls(messages);
  
  let domSnapshots = 0;
  messages.forEach(msg => {
    if (msg.toolInvocations) {
      msg.toolInvocations.forEach((inv: any) => {
        if (inv.result && (
          (typeof inv.result === 'string' && inv.result.length > 10000) ||
          (typeof inv.result === 'object' && inv.result.content && inv.result.content.length > 10000)
        )) {
          domSnapshots++;
        }
      });
    }
  });
  
  console.log(`\n📊 ${label}:`);
  console.log(`  Size: ${formatBytes(size)} (${size.toLocaleString()} characters)`);
  console.log(`  Has Playwright tools: ${domTools}`);
  console.log(`  DOM snapshots: ${domSnapshots}`);
  console.log(`  Messages: ${messages.length}`);
}

function demonstrateContextPruning() {
  console.log('🎭 Context Pruning Demonstration\n');
  console.log('This demo shows how DOM snapshots are pruned from browsing conversations\n');
  
  // Analyze original conversation
  analyzeConversation(demoConversation, 'Original Conversation');
  
  // Apply context pruning
  const prunedConversation = pruneDOMSnapshots(demoConversation, 1);
  
  // Analyze pruned conversation  
  analyzeConversation(prunedConversation, 'Pruned Conversation');
  
  // Calculate savings
  const originalSize = JSON.stringify(demoConversation).length;
  const prunedSize = JSON.stringify(prunedConversation).length;
  const savings = originalSize - prunedSize;
  const savingsPercent = (savings / originalSize * 100).toFixed(1);
  
  console.log(`\n💾 Space Savings:`);
  console.log(`  Saved: ${formatBytes(savings)} (${savingsPercent}%)`);
  console.log(`  Reduction: ${originalSize.toLocaleString()} → ${prunedSize.toLocaleString()} characters`);
  
  // Show what was preserved vs pruned
  console.log(`\n🔍 What happened:`);
  console.log(`  ✅ All user messages preserved`);
  console.log(`  ✅ Most recent DOM snapshot kept (Sign in page)`);
  console.log(`  🗑️  Previous DOM snapshots replaced with placeholders`);
  console.log(`  ✅ Non-DOM tool results unchanged`);
  
  // Show example of pruned content
  const firstAssistant = prunedConversation[1];
  const firstNavResult = firstAssistant.toolInvocations[0].result;
  console.log(`\n📝 Example of pruned content:`);
  console.log(`  Original: ${JSON.stringify(demoConversation[1].toolInvocations[0].result).substring(0, 100)}...`);
  console.log(`  Pruned: ${JSON.stringify(firstNavResult).substring(0, 100)}...`);
  
  console.log(`\n🎯 Benefits:`);
  console.log(`  • Prevents context window overflow`);
  console.log(`  • Maintains conversation flow`);
  console.log(`  • Preserves current page context`);
  console.log(`  • Allows longer browsing sessions`);
  console.log(`  • Automatic and transparent`);
}

if (require.main === module) {
  demonstrateContextPruning();
}