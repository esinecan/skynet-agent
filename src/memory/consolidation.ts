/**
 * Memory consolidation service for the Skynet Agent
 * Periodically processes and summarizes memories to create higher-level insights
 */

import * as fs from 'fs';
import * as path from 'path';
import { createLogger } from '../utils/logger';
import { WorkflowError } from '../utils/errorHandler';
import { memoryManager } from './index';
import { generateResponse } from '../agent/llmClient';
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
  if (isRunning) {
    logger.warn('Memory consolidation already running');
    return;
  }
  
  isRunning = true;
  
  try {
    logger.info('Starting memory consolidation');
    
    // Update health status
    updateComponentHealth(
      'memoryConsolidation',
      HealthStatus.BUSY,
      'Running memory consolidation'
    );
    
    // Get all memories
    const memories = await memoryManager.getAllMemories();
    
    if (memories.length === 0) {
      logger.info('No memories available for consolidation');
      return;
    }
    
    // Get last consolidation time from state or file
    const lastConsolidationTime = getLastConsolidationTime();
    
    // Filter for recent memories if we have a last consolidation time
    // Otherwise process all memories
    const recentMemories = lastConsolidationTime
      ? memories.filter(m => m.metadata?.timestamp && new Date(m.metadata.timestamp) > new Date(lastConsolidationTime))
      : memories;
    
    if (recentMemories.length === 0) {
      logger.info('No new memories since last consolidation');
      return;
    }
    
    logger.info(`Found ${recentMemories.length} memories to consolidate`);
    
    // Sort memories by timestamp if available
    recentMemories.sort((a, b) => {
      const aTime = a.metadata?.timestamp ? new Date(a.metadata.timestamp).getTime() : 0;
      const bTime = b.metadata?.timestamp ? new Date(b.metadata.timestamp).getTime() : 0;
      return aTime - bTime;
    });
    
    // Format memories for the LLM
    const memoryText = recentMemories.map(mem => 
      `[Memory ${mem.id}]: ${mem.text}`
    ).join('\n\n');
    
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
    
    // Generate consolidation
    const consolidation = await generateResponse([
      { role: "system", content: consolidationPrompt }
    ]);
    
    // Store the consolidation as a special memory
    const consolidationId = await memoryManager.storeMemory(`Consolidation: ${consolidation}`, {
      type: 'consolidation',
      timestamp: new Date().toISOString(),
      memoryCount: recentMemories.length
    });
    
    // Update last run time
    lastRun = new Date().toISOString();
    saveLastConsolidationTime(lastRun);
    
    logger.info('Memory consolidation completed successfully', {
      consolidationId,
      memoryCount: recentMemories.length
    });
    
    // Update health status
    updateComponentHealth(
      'memoryConsolidation',
      HealthStatus.HEALTHY,
      'Memory consolidation completed successfully'
    );
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    logger.error('Memory consolidation failed', err);
    
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
