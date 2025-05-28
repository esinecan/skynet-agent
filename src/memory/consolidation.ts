/**
 * Memory consolidation service for the Skynet Agent
 * Periodically processes and summarizes memories to create higher-level insights
 */

import * as fs from 'fs';
import * as path from 'path';
import { createLogger } from '../utils/logger';
import { WorkflowError } from '../utils/errorHandler';
import { memoryManager } from './index';
import { LLMService } from '../agent/llmClient';
import { McpClientManager } from '../mcp/client';
import { updateComponentHealth, HealthStatus } from '../utils/health';
import * as cron from 'node-cron';

const logger = createLogger('memoryConsolidation');

// Configuration
const CONSOLIDATION_DIR = process.env.CONSOLIDATION_DIR || path.join(process.cwd(), 'data', 'consolidation');
const DEFAULT_SCHEDULE = process.env.MEMORY_CONSOLIDATION_SCHEDULE || '0 2 * * *'; // Default: 2 AM daily

// State
let consolidationTask: cron.ScheduledTask | null = null;
let isRunning = false;
let lastRun: string | null = null;

/**
 * Initialize memory consolidation with scheduled runs
 */
export function initializeMemoryConsolidation(schedule: string = DEFAULT_SCHEDULE): void {
  try {
    // Create consolidation directory if it doesn't exist
    if (!fs.existsSync(CONSOLIDATION_DIR)) {
      fs.mkdirSync(CONSOLIDATION_DIR, { recursive: true });
    }
    
    // Schedule consolidation task
    if (cron.validate(schedule)) {
      consolidationTask = cron.schedule(schedule, async () => {
        try {
          await runMemoryConsolidation();
        } catch (error) {
          const err = error instanceof Error ? error : new Error(String(error));
          logger.error('Scheduled memory consolidation failed', err);
        }
      });
      
      logger.info('Memory consolidation scheduled', { schedule });
      
      // Update health status
      updateComponentHealth(
        'memoryConsolidation',
        HealthStatus.HEALTHY,
        'Memory consolidation scheduled'
      );
    } else {
      logger.error(`Invalid cron schedule: ${schedule}`);
    }
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    logger.error('Failed to initialize memory consolidation', err);
    
    // Update health status
    updateComponentHealth(
      'memoryConsolidation',
      HealthStatus.DEGRADED,
      'Failed to initialize memory consolidation'
    );
  }
}

/**
 * Get the current status of memory consolidation
 */
export function getConsolidationStatus(): {
  isRunning: boolean;
  lastRun: string | null;
  schedule: string | null;
} {
  return {
    isRunning,
    lastRun,
    schedule: consolidationTask ? DEFAULT_SCHEDULE : null
  };
}

/**
 * Run memory consolidation process
 * This analyzes recent memories and generates consolidated insights
 */
export async function runMemoryConsolidation(): Promise<void> {
  const startTime = Date.now();
  let recentMemories: any[] = [];
  
  if (isRunning) {
    logger.debug('Memory consolidation already running, skipping');
    return;
  }
  
  isRunning = true;
  
  try {
    logger.debug('Starting memory consolidation process', {
      consolidationDir: CONSOLIDATION_DIR,
      currentTime: new Date().toISOString()
    });
    
    // Update health status
    updateComponentHealth(
      'memoryConsolidation',
      HealthStatus.BUSY,
      'Running memory consolidation'
    );
    
    // Get all memories
    const memoriesStartTime = Date.now();
    const memories = await memoryManager.getAllMemories();
    const memoriesRetrievalTime = Date.now() - memoriesStartTime;
    
    logger.debug('Retrieved memories for consolidation', {
      totalMemories: memories.length,
      retrievalTimeMs: memoriesRetrievalTime
    });
    
    if (memories.length === 0) {
      logger.debug('No memories available for consolidation, exiting');
      return;
    }
    
    // Get last consolidation time from state or file
    const lastConsolidationTime = getLastConsolidationTime();
    logger.debug('Checking last consolidation time', {
      lastConsolidationTime,
      hasLastConsolidation: !!lastConsolidationTime
    });
    
    // Filter for recent memories if we have a last consolidation time
    // Otherwise process all memories
    recentMemories = lastConsolidationTime
      ? memories.filter(m => m.metadata?.timestamp && new Date(m.metadata.timestamp) > new Date(lastConsolidationTime))
      : memories;
    
    const timeSinceLastConsolidation = lastConsolidationTime 
      ? Date.now() - new Date(lastConsolidationTime).getTime()
      : null;
    
    logger.debug('Filtered memories for consolidation', {
      totalMemories: memories.length,
      recentMemories: recentMemories.length,
      filteredOut: memories.length - recentMemories.length,
      timeSinceLastConsolidationMs: timeSinceLastConsolidation,
      timeSinceLastConsolidationHours: timeSinceLastConsolidation ? Math.round(timeSinceLastConsolidation / 1000 / 60 / 60) : null
    });
    
    if (recentMemories.length === 0) {
      logger.debug('No new memories since last consolidation, exiting');
      return;
    }
    
    // Sort memories by timestamp if available
    recentMemories.sort((a, b) => {
      const aTime = a.metadata?.timestamp ? new Date(a.metadata.timestamp).getTime() : 0;
      const bTime = b.metadata?.timestamp ? new Date(b.metadata.timestamp).getTime() : 0;
      return aTime - bTime;
    });
    
    const oldestMemory = recentMemories[0]?.metadata?.timestamp;
    const newestMemory = recentMemories[recentMemories.length - 1]?.metadata?.timestamp;
    
    logger.debug('Sorted memories by timestamp', {
      oldestMemoryTime: oldestMemory,
      newestMemoryTime: newestMemory,
      timeSpanHours: oldestMemory && newestMemory 
        ? Math.round((new Date(newestMemory).getTime() - new Date(oldestMemory).getTime()) / 1000 / 60 / 60)
        : null
    });
    
    // Format memories for the LLM
    const memoryText = recentMemories.map(mem => 
      `[Memory ${mem.id}]: ${mem.text}`
    ).join('\n\n');
    
    logger.debug('Formatted memories for LLM processing', {
      memoryTextLength: memoryText.length,
      averageMemoryLength: Math.round(memoryText.length / recentMemories.length),
      memoryCount: recentMemories.length
    });
    
    // Generate consolidation prompt
    const consolidationPrompt = `
      You are an AI assistant analyzing and consolidating memories.
      Please review these memories and generate:
      1. A summary of key information
      2. Identified patterns or themes
      3. Important insights that should be remembered
      4. Any action items or follow-ups that might be valuable
      
      Memories to consolidate:
      ${memoryText}
      
      Generate a thoughtful consolidation of these memories:
    `;
    
    logger.debug('Prepared consolidation prompt', {
      promptLength: consolidationPrompt.length,
      memoriesIncluded: recentMemories.length
    });
    
    // Generate consolidation using LLMService (without MCP tools for memory consolidation)
    const llmStartTime = Date.now();
    const mcpManager = new McpClientManager([]); // Empty MCP manager for consolidation
    const llmService = new LLMService(mcpManager, process.env.AGENT_MODEL || 'google:gemini-2.0-flash');
    
    logger.debug('Calling LLM for memory consolidation', {
      model: process.env.AGENT_MODEL || 'google:gemini-2.0-flash',
      hasEmptyMcpManager: true
    });
    
    const consolidation = await llmService.generateResponseLegacy([
      { role: "system", content: consolidationPrompt }
    ]);
    
    const llmProcessingTime = Date.now() - llmStartTime;
    logger.debug('LLM consolidation completed', {
      processingTimeMs: llmProcessingTime,
      consolidationLength: consolidation.length,
      consolidationPreview: consolidation.substring(0, 200) + (consolidation.length > 200 ? "..." : "")
    });
    
    // Store the consolidation as a special memory
    const storageStartTime = Date.now();
    const consolidationId = await memoryManager.storeMemory(`Consolidation: ${consolidation}`, {
      type: 'consolidation',
      timestamp: new Date().toISOString(),
      memoryCount: recentMemories.length,
      originalMemoryIds: recentMemories.map(m => m.id),
      processingTimeMs: llmProcessingTime
    });
    
    const storageTime = Date.now() - storageStartTime;
    logger.debug('Stored consolidation memory', {
      consolidationId,
      storageTimeMs: storageTime,
      metadataIncluded: ['type', 'timestamp', 'memoryCount', 'originalMemoryIds', 'processingTimeMs']
    });
    
    // Update last run time
    lastRun = new Date().toISOString();
    saveLastConsolidationTime(lastRun);
    
    const totalProcessingTime = Date.now() - startTime;
    logger.debug('Memory consolidation completed successfully', {
      consolidationId,
      memoryCount: recentMemories.length,
      totalProcessingTimeMs: totalProcessingTime,
      breakdown: {
        memoryRetrievalMs: memoriesRetrievalTime,
        llmProcessingMs: llmProcessingTime,
        storageMs: storageTime,
        otherMs: totalProcessingTime - memoriesRetrievalTime - llmProcessingTime - storageTime
      },
      consolidationLength: consolidation.length,
      efficiency: Math.round(recentMemories.length / (totalProcessingTime / 1000)) // memories per second
    });
    
    // Update health status
    updateComponentHealth(
      'memoryConsolidation',
      HealthStatus.HEALTHY,
      'Memory consolidation completed successfully'
    );
  } catch (error) {
    const totalProcessingTime = Date.now() - startTime;
    const err = error instanceof Error ? error : new Error(String(error));
    logger.error('Memory consolidation failed', {
      error: err,
      totalProcessingTimeMs: totalProcessingTime,
      memoriesAttempted: recentMemories?.length || 0,
      errorType: err.constructor.name,
      errorMessage: err.message,
      stackTrace: err.stack
    });
    
    // Update health status
    updateComponentHealth(
      'memoryConsolidation',
      HealthStatus.DEGRADED,
      'Memory consolidation failed'
    );
  } finally {
    isRunning = false;
  }
}

/**
 * Get the timestamp of the last consolidation
 */
function getLastConsolidationTime(): string | null {
  const filePath = path.join(CONSOLIDATION_DIR, 'last_run.txt');
  
  if (fs.existsSync(filePath)) {
    try {
      return fs.readFileSync(filePath, 'utf8').trim();
    } catch (error) {
      logger.warn('Failed to read last consolidation time');
      return null;
    }
  }
  
  return null;
}

/**
 * Save the timestamp of the current consolidation
 */
function saveLastConsolidationTime(timestamp: string): void {
  const filePath = path.join(CONSOLIDATION_DIR, 'last_run.txt');
  
  try {
    fs.writeFileSync(filePath, timestamp);
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    logger.warn('Failed to save last consolidation time', err);
  }
}
