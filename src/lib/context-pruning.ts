/**
 * Context pruning utilities for managing browser/DOM content in chat conversations.
 * 
 * This module provides functions to detect and remove DOM snapshots from message history
 * when using Playwright MCP tools to prevent context window overflow.
 */

import { createLogger } from './logger';

const logger = createLogger('context-pruning');

/**
 * Known Playwright/browser tools that return large DOM content.
 * These patterns match tool names that typically return full page snapshots.
 */
const DOM_SNAPSHOT_TOOL_PATTERNS = [
  'browser_snapshot',
  'browser_take_screenshot',
  'browser_navigate', 
  'browser_navigate_back',
  'browser_navigate_forward',
  'browser_click', // May return updated DOM
  'browser_type', // May return updated DOM
  'browser_hover', // May return updated DOM
  'browser_drag', // May return updated DOM
  'browser_wait_for', // May return updated DOM
  'browser_select_option', // May return updated DOM
];

/**
 * Patterns to identify DOM snapshot content in tool results.
 * These help us identify responses that contain large DOM trees.
 */
const DOM_CONTENT_INDICATORS = [
  '<html',
  '<!DOCTYPE html',
  'accessibility tree:',
  'page snapshot:',
  'dom tree:',
  '<body',
  '<?xml version=',
];

/**
 * Check if a tool name indicates it might return DOM snapshot content.
 */
export function isPlaywrightDOMTool(serverName: string, toolName: string): boolean {
  // Check if this is from the playwright server
  if (serverName !== 'playwright') {
    return false;
  }
  
  // Check if the tool name matches known DOM snapshot patterns
  return DOM_SNAPSHOT_TOOL_PATTERNS.some(pattern => 
    toolName.includes(pattern) || toolName.startsWith(pattern.replace('browser_', ''))
  );
}

/**
 * Check if a tool result contains DOM snapshot data.
 */
export function containsDOMSnapshot(result: any): boolean {
  if (!result) return false;
  
  // Convert result to string for analysis
  let content = '';
  if (typeof result === 'string') {
    content = result;
  } else if (typeof result === 'object') {
    if (result.content) {
      content = String(result.content);
    } else if (result.text) {
      content = String(result.text);
    } else {
      content = JSON.stringify(result);
    }
  } else {
    content = String(result);
  }
  
  // Check if content contains DOM indicators
  const lowerContent = content.toLowerCase();
  return DOM_CONTENT_INDICATORS.some(indicator => 
    lowerContent.includes(indicator.toLowerCase())
  ) || content.length > 10000; // Large content is likely DOM
}

/**
 * Check if a message contains tool invocations with DOM snapshots.
 */
export function messageHasDOMContent(message: any): boolean {
  if (!message || !message.toolInvocations) {
    return false;
  }
  
  return message.toolInvocations.some((invocation: any) => {
    // Check if it's a Playwright tool - split on first underscore only
    const toolNameParts = invocation.toolName ? invocation.toolName.split('_') : [];
    if (toolNameParts.length < 2) return false;
    
    const serverName = toolNameParts[0];
    const toolName = toolNameParts.slice(1).join('_'); // Rejoin remaining parts
    
    if (isPlaywrightDOMTool(serverName, toolName)) {
      return containsDOMSnapshot(invocation.result);
    }
    
    return false;
  });
}

/**
 * Remove DOM snapshots from a tool invocation result while preserving other content.
 */
export function pruneDOMFromToolResult(result: any): any {
  if (!result) return result;
  
  if (typeof result === 'string') {
    // If it's a large string that contains DOM content, replace with summary
    if (containsDOMSnapshot(result)) {
      return '[DOM snapshot content removed - previous page state]';
    }
    return result;
  }
  
  if (typeof result === 'object' && result !== null) {
    const pruned = { ...result };
    
    // Handle common result structure fields
    if (result.content && containsDOMSnapshot(result.content)) {
      pruned.content = '[DOM snapshot content removed - previous page state]';
    }
    
    if (result.text && containsDOMSnapshot(result.text)) {
      pruned.text = '[DOM snapshot content removed - previous page state]';
    }
    
    // Handle array results
    if (Array.isArray(result)) {
      return result.map(item => pruneDOMFromToolResult(item));
    }
    
    return pruned;
  }
  
  return result;
}

/**
 * Remove DOM snapshots from messages while preserving the current turn's DOM content.
 * 
 * @param messages Array of conversation messages
 * @param preserveLastN Number of most recent DOM snapshots to preserve (default: 1)
 * @returns Pruned messages array
 */
export function pruneDOMSnapshots(messages: any[], preserveLastN: number = 1): any[] {
  if (!Array.isArray(messages)) {
    return messages;
  }
  
  let domSnapshotCount = 0;
  const prunedMessages = [];
  
  // Process messages in reverse order to count DOM snapshots from newest to oldest
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i];
    
    if (messageHasDOMContent(message)) {
      domSnapshotCount++;
      
      if (domSnapshotCount <= preserveLastN) {
        // Preserve this DOM snapshot (it's one of the most recent)
        prunedMessages.unshift(message);
        logger.debug(`Preserving DOM snapshot ${domSnapshotCount} in message ${i}`);
      } else {
        // Remove DOM content but keep the message structure
        const prunedMessage = {
          ...message,
          toolInvocations: message.toolInvocations.map((invocation: any) => {
            const toolNameParts = invocation.toolName ? invocation.toolName.split('_') : [];
            if (toolNameParts.length < 2) return invocation;
            
            const serverName = toolNameParts[0];
            const toolName = toolNameParts.slice(1).join('_');
            
            if (isPlaywrightDOMTool(serverName, toolName)) {
              return {
                ...invocation,
                result: pruneDOMFromToolResult(invocation.result)
              };
            }
            
            return invocation;
          })
        };
        
        prunedMessages.unshift(prunedMessage);
        logger.debug(`Pruned DOM snapshot from message ${i}`);
      }
    } else {
      // Non-DOM message, keep as-is
      prunedMessages.unshift(message);
    }
  }
  
  if (domSnapshotCount > preserveLastN) {
    logger.info(`Pruned ${domSnapshotCount - preserveLastN} DOM snapshots from conversation history`);
  }
  
  return prunedMessages;
}

/**
 * Check if any tool calls in a request involve Playwright DOM tools.
 */
export function hasPlaywrightDOMToolCalls(messages: any[]): boolean {
  if (!Array.isArray(messages)) {
    return false;
  }
  
  // Check the last few messages for tool calls
  const recentMessages = messages.slice(-3); // Check last 3 messages
  
  return recentMessages.some(message => {
    if (!message.toolInvocations) return false;
    
    return message.toolInvocations.some((invocation: any) => {
      const toolNameParts = invocation.toolName ? invocation.toolName.split('_') : [];
      if (toolNameParts.length < 2) return false;
      
      const serverName = toolNameParts[0];
      const toolName = toolNameParts.slice(1).join('_');
      
      return isPlaywrightDOMTool(serverName, toolName);
    });
  });
}