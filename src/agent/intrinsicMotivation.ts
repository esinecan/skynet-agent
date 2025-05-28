/**
 * Intrinsic motivation system for autonomous agent behavior
 * Enables the agent to perform tasks without direct user prompting
 */

import * as fs from 'fs';
import * as path from 'path';
import { createLogger } from '../utils/logger';
import { WorkflowError } from '../utils/errorHandler';
import { memoryManager } from '../memory';
import { generateResponse } from './llmClient';
import { updateComponentHealth, HealthStatus } from '../utils/health';

const logger = createLogger('intrinsicMotivation');

// Configuration
const IDLE_THRESHOLD_MINUTES = Number(process.env.IDLE_THRESHOLD_MINUTES || 10);
const INTRINSIC_TASK_DIR = process.env.INTRINSIC_TASK_DIR || path.join(process.cwd(), 'data', 'tasks');

// Task record interface
interface TaskRecord {
  taskId: string;
  taskType: string;
  startTime: string;
  endTime?: string;
  success: boolean;
}

// State
let lastUserInteraction = new Date();
let isTaskRunning = false;
let recentTasks: TaskRecord[] = [];

/**
 * Initialize the intrinsic motivation system
 */
export function initializeIntrinsicMotivation(): void {
  try {
    // Create task directory if it doesn't exist
    if (!fs.existsSync(INTRINSIC_TASK_DIR)) {
      fs.mkdirSync(INTRINSIC_TASK_DIR, { recursive: true });
    }
    
    // Set up periodic check for idle time
    setInterval(checkIdleTime, 60000); // Check every minute
    
    // Update health status
    updateComponentHealth(
      'intrinsicMotivation',
      HealthStatus.HEALTHY,
      'Intrinsic motivation system initialized'
    );
    
    logger.info('Intrinsic motivation system initialized', {
      idleThreshold: IDLE_THRESHOLD_MINUTES,
      taskDir: INTRINSIC_TASK_DIR
    });
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    logger.error('Failed to initialize intrinsic motivation system', err);
    
    // Update health status
    updateComponentHealth(
      'intrinsicMotivation',
      HealthStatus.DEGRADED,
      'Failed to initialize intrinsic motivation system'
    );
  }
}

/**
 * Update the last user interaction time
 */
export function updateLastUserInteraction(): void {
  lastUserInteraction = new Date();
  logger.debug('Updated last user interaction time');
}

/**
 * Get the current status of the intrinsic motivation system
 */
export function getIntrinsicMotivationStatus(): {
  isTaskRunning: boolean;
  idleTimeMinutes: number;
  lastInteraction: string;
  recentTaskCount: number;
} {
  const now = new Date();
  const idleTimeMs = now.getTime() - lastUserInteraction.getTime();
  const idleTimeMinutes = idleTimeMs / (1000 * 60);
  
  return {
    isTaskRunning,
    idleTimeMinutes,
    lastInteraction: lastUserInteraction.toISOString(),
    recentTaskCount: recentTasks.length
  };
}

/**
 * Get recent intrinsic tasks
 */
export function getRecentIntrinsicTasks(): TaskRecord[] {
  return recentTasks;
}

/**
 * Check if the system has been idle for too long
 * If so, trigger an intrinsic task
 */
async function checkIdleTime(): Promise<void> {
  // Don't check if a task is already running
  if (isTaskRunning) {
    logger.debug('Skipping idle check - intrinsic task already running');
    return;
  }
  
  const now = new Date();
  const idleTimeMs = now.getTime() - lastUserInteraction.getTime();
  const idleTimeMinutes = idleTimeMs / (1000 * 60);
  
  logger.debug('Checking idle time', {
    idleTimeMinutes: Math.round(idleTimeMinutes * 100) / 100,
    thresholdMinutes: IDLE_THRESHOLD_MINUTES,
    lastInteraction: lastUserInteraction.toISOString(),
    shouldTriggerTask: idleTimeMinutes >= IDLE_THRESHOLD_MINUTES,
    recentTaskCount: recentTasks.length
  });
  
  // If we've been idle for longer than the threshold, trigger a task
  if (idleTimeMinutes >= IDLE_THRESHOLD_MINUTES) {    logger.debug('System idle threshold exceeded', {
      idleTimeMinutes: Math.round(idleTimeMinutes * 100) / 100,
      thresholdMinutes: IDLE_THRESHOLD_MINUTES,
      triggeringTask: 'reflection'
    });
    
    // For now, just trigger a simple reflection task
    await executeIntrinsicTask('reflection');
  }
}

/**
 * Execute an intrinsic task
 */
async function executeIntrinsicTask(taskType: string): Promise<void> {
  const startTime = Date.now();
  
  if (isTaskRunning) {
    logger.debug('Attempted to execute intrinsic task while another task is running', {
      requestedTaskType: taskType,
      currentlyRunning: true
    });
    return;
  }
  
  const taskId = `task_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
  
  try {
    isTaskRunning = true;
    
    logger.debug('Starting intrinsic task execution', {
      taskId,
      taskType,
      recentTaskCount: recentTasks.length,
      startTime: new Date().toISOString()
    });
    
    // Record task start
    const taskRecord: TaskRecord = {
      taskId,
      taskType,
      startTime: new Date().toISOString(),
      success: false
    };
    
    recentTasks.unshift(taskRecord);
    if (recentTasks.length > 10) {
      recentTasks.pop(); // Keep only the 10 most recent tasks
      logger.debug('Pruned task history', { keptTaskCount: recentTasks.length });
    }
    
    // Update health status
    updateComponentHealth(
      'intrinsicMotivation',
      HealthStatus.BUSY,
      `Executing intrinsic task: ${taskType}`
    );
    
    // Execute the specific task type
    if (taskType === 'reflection') {
      logger.debug('Executing reflection task', { taskId });
      await executeReflectionTask(taskId);
    } else {
      logger.error('Unknown intrinsic task type', {
        taskType,
        taskId,
        supportedTypes: ['reflection']
      });
    }
    
    // Record task completion
    const executionTime = Date.now() - startTime;
    taskRecord.endTime = new Date().toISOString();
    taskRecord.success = true;
    
    logger.debug('Completed intrinsic task successfully', {
      taskId,
      taskType,
      executionTimeMs: executionTime,
      success: true
    });
    
    // Update health status
    updateComponentHealth(
      'intrinsicMotivation',
      HealthStatus.HEALTHY,
      'Intrinsic task completed successfully'
    );
  } catch (error) {
    const executionTime = Date.now() - startTime;
    const err = error instanceof Error ? error : new Error(String(error));
    logger.error('Failed to execute intrinsic task', {
      error: err,
      taskId,
      taskType,
      executionTimeMs: executionTime,
      errorType: err.constructor.name
    });
    
    // Update health status
    updateComponentHealth(
      'intrinsicMotivation',
      HealthStatus.DEGRADED,
      'Failed to execute intrinsic task'
    );
  } finally {
    isTaskRunning = false;
  }
}

/**
 * Execute a reflection task
 * This task reviews recent memories and generates insights
 */
async function executeReflectionTask(taskId: string): Promise<void> {
  logger.info('Executing reflection task');
  
  try {
    // Get recent memories
    const memories = await memoryManager.getAllMemories();
    
    if (memories.length === 0) {
      logger.info('No memories available for reflection');
      return;
    }
    
    // Format memories for the LLM
    const recentMemories = memories.slice(0, 10); // Take the 10 most recent memories
    const memoryText = recentMemories.map(mem => 
      `[Memory ${mem.id}]: ${mem.text}`
    ).join('\n\n');
    
    // Generate reflection prompt
    const reflectionPrompt = `
      You are an AI assistant reviewing your recent interactions and memories.
      Please analyze these memories and generate insights about:
      1. Common themes or topics
      2. User preferences or interests
      3. Areas where you could improve your responses
      4. Knowledge gaps that you should address
      
      Recent memories:
      ${memoryText}
      
      Generate a thoughtful reflection based on these memories:
    `;
    
    // Generate reflection
    const reflection = await generateResponse([
      { role: "system", content: reflectionPrompt }
    ]);
    
    // Store the reflection as a memory
    await memoryManager.storeMemory(`Reflection: ${reflection}`, {
      type: 'reflection',
      taskId,
      timestamp: new Date().toISOString()
    });
    
    logger.info('Reflection task completed successfully', {
      reflectionLength: reflection.length
    });
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    logger.error('Error during reflection task', err);
    throw err;
  }
}
