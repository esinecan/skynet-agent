# Skynet Agent - Development TODO

*Last Updated: May 23, 2025*



This document contains prioritized development tasks for the Skynet Agent project based on the current implementation state. The agent has a solid foundation with MCP integration, memory systems, and self-reflection already working - these todos focus on completing and optimizing the existing functionality.

## Recent Completions
- ✅ **Real Embeddings Implementation** - Memory system now uses Gemini's embedding-001 model instead of random vectors, making memory retrieval actually functional.
- ✅ **Self-Reflection System** - Already implemented and working in workflow with adaptive response generation
- ✅ **Multi-Step Reasoning** - Already implemented in selfReflection.ts with performMultiStepReasoning function

## 🔥 Critical Priority (Quick Wins)

### 1. ✅ COMPLETED - Adaptive Response Generation Already Working
**Status:** COMPLETED - Already implemented and working in workflow
**Implementation:** The `selfReflectionNode` in workflow.ts already has adaptive response generation with improvement threshold logic. The system generates improved responses when quality score is below 7.

---

### 2. Implement Real Embeddings for Memory ✅ COMPLETED
**Status:** COMPLETED - Real embeddings implemented using Gemini API
**Files modified:** `src/memory/index.ts` 
**Files created:** `src/utils/embeddings.ts`, `src/tests/embedding-test.ts`
**Implementation date:** Based on changes.txt diff

**What was implemented:**
- Created `EmbeddingService` class using Gemini's embedding-001 model
- Added deterministic hash-based fallback for when API is unavailable
- Integrated with MemoryManager for both storage and retrieval
- Created comprehensive test suite to verify functionality
- Embeddings now use 384-dimensional vectors (standard size)

**Testing:** Run `npx ts-node src/tests/embedding-test.ts` to verify embedding similarity and memory retrieval work correctly. Consider adding `"test:embeddings": "ts-node src/tests/embedding-test.ts"` to package.json scripts.

---

### 2. Add Memory Pruning System
**Status:** Not implemented, memory will grow indefinitely
**Files to modify:** `src/memory/index.ts`, `src/memory/consolidation.ts`
**Estimated effort:** 2-3 hours
**Impact:** Prevents performance degradation over time

**Problem:** Memory storage grows without bounds, which will eventually cause performance issues and disk space problems.

**Implementation:**

1. **Add pruning methods to SimpleVectorStore** in `src/memory/index.ts`:
```typescript
// Add these methods to the SimpleVectorStore class after getCount():

pruneByCount(maxCount: number): number {
  if (this.memories.length <= maxCount) {
    return 0; // No pruning needed
  }
  
  const removedCount = this.memories.length - maxCount;
  // Sort by timestamp (oldest first) and remove
  this.memories.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  this.memories.splice(0, removedCount);
  
  logger.info(`Pruned ${removedCount} memories by count. New total: ${this.memories.length}`);
  return removedCount;
}

pruneByAge(maxAgeDays: number): number {
  const cutoffDate = new Date(Date.now() - maxAgeDays * 24 * 60 * 60 * 1000);
  const initialCount = this.memories.length;
  
  this.memories = this.memories.filter(mem => new Date(mem.timestamp) > cutoffDate);
  const removedCount = initialCount - this.memories.length;
  
  if (removedCount > 0) {
    logger.info(`Pruned ${removedCount} memories older than ${maxAgeDays} days. New total: ${this.memories.length}`);
  }
  
  return removedCount;
}

pruneByScore(minScore: number = 0.1): number {
  // Remove memories that have consistently low retrieval scores
  // This would require tracking retrieval statistics - simplified version:
  const initialCount = this.memories.length;
  
  // For now, just remove memories that are exact duplicates
  const seen = new Set<string>();
  this.memories = this.memories.filter(mem => {
    const key = mem.text.trim().toLowerCase();
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
  
  const removedCount = initialCount - this.memories.length;
  if (removedCount > 0) {
    logger.info(`Pruned ${removedCount} duplicate memories. New total: ${this.memories.length}`);
  }
  
  return removedCount;
}
```

2. **Add pruning methods to MemoryManager**:
```typescript
// Add after getMemoryCount() method:

async pruneMemories(strategy: 'count' | 'age' | 'duplicates', value?: number): Promise<number> {
  if (!this.initialized) {
    await this.initialize();
  }
  
  let removedCount = 0;
  
  try {
    switch (strategy) {
      case 'count':
        const maxCount = value || 1000;
        removedCount = this.vectorStore.pruneByCount(maxCount);
        break;
      case 'age':
        const maxAgeDays = value || 90;
        removedCount = this.vectorStore.pruneByAge(maxAgeDays);
        break;
      case 'duplicates':
        removedCount = this.vectorStore.pruneByScore();
        break;
      default:
        throw new Error(`Unknown pruning strategy: ${strategy}`);
    }
    
    if (removedCount > 0) {
      this.vectorStore.save(this.memoryFilePath);
      logger.info(`Memory pruning completed: ${removedCount} memories removed using ${strategy} strategy`);
    }
    
    return removedCount;
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    logger.error('Memory pruning failed:', err);
    throw err;
  }
}
```

3. **Integrate with consolidation** in `src/memory/consolidation.ts`:
```typescript
// Add after the consolidation logic in runMemoryConsolidation(), around line 115:

// Perform memory pruning after consolidation
const maxMemoriesToKeep = Number(process.env.MAX_MEMORIES_TO_KEEP || 1000);
const maxMemoryAgeDays = Number(process.env.MAX_MEMORY_AGE_DAYS || 90);

if (memories.length > maxMemoriesToKeep) {
  logger.info(`Memory count (${memories.length}) exceeds maximum (${maxMemoriesToKeep}), initiating pruning`);
  const prunedByCount = await memoryManager.pruneMemories('count', maxMemoriesToKeep);
  logger.info(`Pruned ${prunedByCount} memories by count`);
}

// Also prune old memories
const prunedByAge = await memoryManager.pruneMemories('age', maxMemoryAgeDays);
if (prunedByAge > 0) {
  logger.info(`Pruned ${prunedByAge} memories older than ${maxMemoryAgeDays} days`);
}

// Remove duplicates
const prunedDuplicates = await memoryManager.pruneMemories('duplicates');
if (prunedDuplicates > 0) {
  logger.info(`Pruned ${prunedDuplicates} duplicate memories`);
}
```

4. **Add environment variables** to `.env.example`:
```env
# Memory Management
MAX_MEMORIES_TO_KEEP=1000
MAX_MEMORY_AGE_DAYS=90
```

**Testing:** Create many memories, trigger consolidation, verify old/excess memories are pruned.

---

## 🔶 High Priority (Major Features)

### 3. Integrate Multi-Step Reasoning into Workflow
**Status:** Function exists but not accessible in main flow
**Files to modify:** `src/agent/workflow.ts`, `src/agent/schemas/appStateSchema.ts`
**Estimated effort:** 3-4 hours
**Impact:** Enables advanced reasoning for complex problems

**Problem:** `performMultiStepReasoning` function exists in selfReflection.ts but isn't integrated into the main workflow, so users can't easily trigger it.

**Note:** The function is already implemented and can be called manually, but workflow integration would make it automatically triggered for complex queries.

---

### 4. Implement Workflow Checkpointing
**Status:** No persistence across restarts
**Files to create:** `src/utils/fileCheckpointer.ts`
**Files to modify:** `src/agent/workflow.ts`, `src/agent/index.ts`
**Estimated effort:** 4-5 hours
**Impact:** Conversation persistence across server restarts

**Problem:** All conversation state is lost when the server restarts. Users lose context mid-conversation.

**Implementation:**

1. **Create FileCheckpointSaver** (`src/utils/fileCheckpointer.ts`):
```typescript
import { BaseCheckpointSaver, Checkpoint } from "@langchain/langgraph";
import * as fs from 'fs';
import * as path from 'path';
import { createLogger } from './logger';

const logger = createLogger('fileCheckpointer');
const CHECKPOINT_DIR = process.env.CHECKPOINT_DIR || path.join(process.cwd(), 'data', 'checkpoints');

export class FileCheckpointSaver extends BaseCheckpointSaver {
  constructor() {
    super();
    if (!fs.existsSync(CHECKPOINT_DIR)) {
      fs.mkdirSync(CHECKPOINT_DIR, { recursive: true });
      logger.info(`Created checkpoint directory: ${CHECKPOINT_DIR}`);
    }
  }

  async get(config: { configurable: { thread_id: string } }): Promise<Checkpoint | undefined> {
    const threadId = config.configurable.thread_id;
    const filePath = path.join(CHECKPOINT_DIR, `${threadId}.json`);
    
    if (fs.existsSync(filePath)) {
      try {
        const data = fs.readFileSync(filePath, 'utf8');
        const checkpoint = JSON.parse(data);
        logger.debug(`Loaded checkpoint for thread ${threadId}`);
        return checkpoint;
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        logger.error(`Failed to load checkpoint for thread ${threadId}:`, err);
        return undefined;
      }
    }
    
    logger.debug(`No checkpoint found for thread ${threadId}`);
    return undefined;
  }

  async put(config: { configurable: { thread_id: string } }, checkpoint: Checkpoint): Promise<void> {
    const threadId = config.configurable.thread_id;
    const filePath = path.join(CHECKPOINT_DIR, `${threadId}.json`);
    
    try {
      fs.writeFileSync(filePath, JSON.stringify(checkpoint, null, 2));
      logger.debug(`Saved checkpoint for thread ${threadId}`);
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      logger.error(`Failed to save checkpoint for thread ${threadId}:`, err);
    }
  }

  // Optional: Add cleanup method for old checkpoints
  async cleanup(maxAgeHours: number = 24 * 7): Promise<number> {
    const cutoffTime = Date.now() - maxAgeHours * 60 * 60 * 1000;
    let cleaned = 0;
    
    try {
      const files = fs.readdirSync(CHECKPOINT_DIR);
      for (const file of files) {
        if (!file.endsWith('.json')) continue;
        
        const filePath = path.join(CHECKPOINT_DIR, file);
        const stats = fs.statSync(filePath);
        
        if (stats.mtime.getTime() < cutoffTime) {
          fs.unlinkSync(filePath);
          cleaned++;
        }
      }
      
      if (cleaned > 0) {
        logger.info(`Cleaned up ${cleaned} old checkpoint files`);
      }
    } catch (error) {
      logger.error('Error during checkpoint cleanup:', error);
    }
    
    return cleaned;
  }
}
```

2. **Update workflow compilation** in `src/agent/workflow.ts`:
```typescript
// Add import at top:
import { FileCheckpointSaver } from "../utils/fileCheckpointer";

// Replace the compilation section (around line 360):
logger.info("Compiling the graph with file-based checkpointing...");
const checkpointer = new FileCheckpointSaver();

const compiledGraph = workflow.compile({
  checkpointer: checkpointer
});
```

3. **Update processQuery** in `src/agent/index.ts`:
```typescript
// Update the invoke call (around line 95):
const resultState = await agentWorkflow.invoke(initialState, { 
  configurable: { thread_id: threadId } 
});
```

4. **Add cleanup job to consolidation** in `src/memory/consolidation.ts`:
```typescript
// Add import:
import { FileCheckpointSaver } from '../utils/fileCheckpointer';

// Add after memory consolidation (around line 140):
// Clean up old checkpoints
try {
  const checkpointer = new FileCheckpointSaver();
  const cleaned = await checkpointer.cleanup(7 * 24); // 7 days
  if (cleaned > 0) {
    logger.info(`Cleaned up ${cleaned} old checkpoint files`);
  }
} catch (error) {
  logger.warn('Failed to clean up old checkpoints:', error);
}
```

**Testing:** Start conversation, restart server, continue conversation and verify context is maintained.

---

## 🔷 Medium Priority (Enhancements)

### 5. Enhanced Intrinsic Task System
**Status:** Only reflection task exists
**Files to modify:** `src/agent/intrinsicMotivation.ts`
**Estimated effort:** 4-6 hours
**Impact:** More diverse autonomous behaviors

**Problem:** Agent only has one intrinsic task (reflection). Needs variety for more interesting autonomous behavior.

**Implementation:**

1. **Add new task types** to `executeIntrinsicTask`:
```typescript
// Replace the task execution logic (around line 150):
logger.info(`Starting intrinsic task: ${taskType}`, { taskId });

switch (taskType) {
  case 'reflection':
    await executeReflectionTask(taskId);
    break;
  case 'planning':
    await executePlanningTask(taskId);
    break;
  case 'learning':
    await executeLearningTask(taskId);
    break;
  case 'maintenance':
    await executeMaintenanceTask(taskId);
    break;
  default:
    logger.warn(`Unknown intrinsic task type: ${taskType}`);
    return;
}
```

2. **Add new task implementations**:
```typescript
// Add after executeReflectionTask:

async function executePlanningTask(taskId: string): Promise<void> {
  logger.info('Executing planning task');
  
  try {
    const memories = await memoryManager.getAllMemories();
    const recentConversations = memories
      .filter(mem => mem.metadata?.type === 'conversation')
      .slice(0, 5);
    
    if (recentConversations.length === 0) {
      logger.info('No recent conversations for planning');
      return;
    }
    
    const conversationSummary = recentConversations
      .map(mem => mem.text)
      .join('\n\n');
    
    const planningPrompt = `
      Based on recent conversations, what should I focus on learning or improving?
      What questions might the user have in future conversations?
      What knowledge gaps do I have that I should address?
      
      Recent conversations:
      ${conversationSummary}
      
      Generate a brief plan for self-improvement and preparation:
    `;
    
    const plan = await generateResponse([
      { role: "system", content: planningPrompt }
    ]);
    
    await memoryManager.storeMemory(`Planning Session: ${plan}`, {
      type: 'planning',
      taskId,
      timestamp: new Date().toISOString()
    });
    
    logger.info('Planning task completed', { planLength: plan.length });
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    logger.error('Error during planning task', err);
    throw err;
  }
}

async function executeLearningTask(taskId: string): Promise<void> {
  logger.info('Executing learning task');
  
  try {
    const memories = await memoryManager.getAllMemories();
    
    // Find topics mentioned frequently
    const topicCounts: Record<string, number> = {};
    memories.forEach(mem => {
      const words = mem.text.toLowerCase().split(/\s+/);
      words.forEach(word => {
        if (word.length > 4) { // Only count significant words
          topicCounts[word] = (topicCounts[word] || 0) + 1;
        }
      });
    });
    
    const topTopics = Object.entries(topicCounts)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 5)
      .map(([topic]) => topic);
    
    if (topTopics.length === 0) {
      logger.info('No topics identified for learning');
      return;
    }
    
    const learningPrompt = `
      I've identified these frequently discussed topics: ${topTopics.join(', ')}
      
      For the most interesting topic, what are some key facts or insights I should know?
      What questions might users ask about this topic that I should be prepared for?
      
      Generate educational content about the most relevant topic:
    `;
    
    const learning = await generateResponse([
      { role: "system", content: learningPrompt }
    ]);
    
    await memoryManager.storeMemory(`Learning Session: ${learning}`, {
      type: 'learning',
      taskId,
      topics: topTopics,
      timestamp: new Date().toISOString()
    });
    
    logger.info('Learning task completed', { topicsCount: topTopics.length });
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    logger.error('Error during learning task', err);
    throw err;
  }
}

async function executeMaintenanceTask(taskId: string): Promise<void> {
  logger.info('Executing maintenance task');
  
  try {
    const memoryCount = await memoryManager.getMemoryCount();
    const status = getIntrinsicMotivationStatus();
    
    const maintenanceReport = `
      System Maintenance Report:
      - Total memories: ${memoryCount}
      - Recent tasks completed: ${status.recentTaskCount}
      - System idle time: ${status.idleTimeMinutes.toFixed(1)} minutes
      - Last user interaction: ${status.lastInteraction}
      
      System appears to be functioning normally.
      Memory usage is ${memoryCount > 500 ? 'high' : 'normal'}.
      ${memoryCount > 1000 ? 'Consider memory consolidation.' : ''}
    `;
    
    await memoryManager.storeMemory(`Maintenance Report: ${maintenanceReport}`, {
      type: 'maintenance',
      taskId,
      memoryCount,
      timestamp: new Date().toISOString()
    });
    
    logger.info('Maintenance task completed', { memoryCount });
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    logger.error('Error during maintenance task', err);
    throw err;
  }
}
```

3. **Add task rotation logic** to `checkIdleTime`:
```typescript
// Replace the task trigger logic (around line 130):
if (idleTimeMinutes >= IDLE_THRESHOLD_MINUTES) {
  logger.info(`System has been idle for ${idleTimeMinutes.toFixed(2)} minutes, triggering intrinsic task`);
  
  // Rotate between different task types
  const taskTypes = ['reflection', 'planning', 'learning', 'maintenance'];
  const taskIndex = recentTasks.length % taskTypes.length;
  const taskType = taskTypes[taskIndex];
  
  await executeIntrinsicTask(taskType);
}
```

**Testing:** Let the system idle and observe different types of autonomous tasks being executed.

---

### 6. Performance Monitoring Dashboard
**Status:** Not implemented
**Files to create:** `src/monitoring/dashboard.ts`, `src/server/dashboardRoutes.ts`
**Estimated effort:** 6-8 hours
**Impact:** Visibility into agent performance and behavior

**Problem:** No visibility into agent performance, memory usage, task execution, or errors.

**Implementation:**

1. **Create monitoring service** (`src/monitoring/dashboard.ts`):
```typescript
import { memoryManager } from '../memory';
import { getIntrinsicMotivationStatus } from '../agent/intrinsicMotivation';
import { getConsolidationStatus } from '../memory/consolidation';
import { getHealthStatus } from '../utils/health';

export interface DashboardMetrics {
  memory: {
    totalCount: number;
    recentCount: number;
    consolidationStatus: any;
  };
  intrinsic: {
    status: any;
    recentTasks: any[];
  };
  health: any;
  performance: {
    uptime: number;
    requestCount: number;
    errorCount: number;
    avgResponseTime: number;
  };
}

export async function getDashboardMetrics(): Promise<DashboardMetrics> {
  const [memoryCount, memories] = await Promise.all([
    memoryManager.getMemoryCount(),
    memoryManager.getAllMemories()
  ]);
  
  const recentMemories = memories.filter(mem => {
    const age = Date.now() - new Date(mem.metadata?.timestamp || 0).getTime();
    return age < 24 * 60 * 60 * 1000; // Last 24 hours
  });
  
  return {
    memory: {
      totalCount: memoryCount,
      recentCount: recentMemories.length,
      consolidationStatus: getConsolidationStatus()
    },
    intrinsic: {
      status: getIntrinsicMotivationStatus(),
      recentTasks: [] // Will be populated from intrinsic motivation
    },
    health: getHealthStatus(),
    performance: {
      uptime: process.uptime(),
      requestCount: 0, // Add to metrics tracking
      errorCount: 0,   // Add to metrics tracking
      avgResponseTime: 0 // Add to metrics tracking
    }
  };
}
```

2. **Add dashboard routes** (`src/server/dashboardRoutes.ts`):
```typescript
import express from 'express';
import { getDashboardMetrics } from '../monitoring/dashboard';

const router = express.Router();

router.get('/dashboard', async (req, res) => {
  try {
    const metrics = await getDashboardMetrics();
    
    // Simple HTML dashboard
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Skynet Agent Dashboard</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 20px; }
          .metric { margin: 10px 0; padding: 10px; border: 1px solid #ccc; }
          .healthy { background-color: #e8f5e8; }
          .warning { background-color: #fff3cd; }
          .error { background-color: #f8d7da; }
        </style>
        <script>
          setTimeout(() => location.reload(), 30000); // Auto-refresh every 30s
        </script>
      </head>
      <body>
        <h1>Skynet Agent Dashboard</h1>
        
        <div class="metric healthy">
          <h3>Memory System</h3>
          <p>Total Memories: ${metrics.memory.totalCount}</p>
          <p>Recent (24h): ${metrics.memory.recentCount}</p>
          <p>Last Consolidation: ${metrics.memory.consolidationStatus.lastRun || 'Never'}</p>
        </div>
        
        <div class="metric ${metrics.intrinsic.status.isTaskRunning ? 'warning' : 'healthy'}">
          <h3>Intrinsic Motivation</h3>
          <p>Status: ${metrics.intrinsic.status.isTaskRunning ? 'Running Task' : 'Idle'}</p>
          <p>Idle Time: ${metrics.intrinsic.status.idleTimeMinutes.toFixed(1)} minutes</p>
          <p>Recent Tasks: ${metrics.intrinsic.status.recentTaskCount}</p>
        </div>
        
        <div class="metric healthy">
          <h3>Performance</h3>
          <p>Uptime: ${(metrics.performance.uptime / 3600).toFixed(1)} hours</p>
          <p>Total Requests: ${metrics.performance.requestCount}</p>
          <p>Errors: ${metrics.performance.errorCount}</p>
        </div>
        
        <div class="metric">
          <h3>Health Status</h3>
          <pre>${JSON.stringify(metrics.health, null, 2)}</pre>
        </div>
      </body>
      </html>
    `;
    
    res.send(html);
  } catch (error) {
    res.status(500).json({ error: 'Failed to load dashboard' });
  }
});

router.get('/api/metrics', async (req, res) => {
  try {
    const metrics = await getDashboardMetrics();
    res.json(metrics);
  } catch (error) {
    res.status(500).json({ error: 'Failed to load metrics' });
  }
});

export default router;
```

3. **Integrate with main server** in `src/server/index.ts`:
```typescript
// Add import:
import dashboardRoutes from './dashboardRoutes';

// Add route:
app.use('/', dashboardRoutes);
```

**Testing:** Visit `http://localhost:8080/dashboard` to see agent metrics and status.

---

## 🔹 Low Priority (Nice to Have)

### 7. Advanced MCP Server Management
**Status:** Working but could be enhanced
**Files to modify:** `src/mcp/client.ts`, `src/utils/configLoader.ts`
**Estimated effort:** 3-4 hours

**Implementation:**
- Add dynamic server connect/disconnect
- Health checking for MCP servers
- Automatic retry on connection failure
- Server capability discovery

### 8. Conversation Export/Import
**Status:** Not implemented
**Files to create:** `src/utils/conversationManager.ts`
**Estimated effort:** 2-3 hours

**Implementation:**
- Export conversations to JSON/markdown
- Import conversation history
- Conversation search and filtering

### 9. Advanced Memory Analytics
**Status:** Basic memory system working
**Files to create:** `src/memory/analytics.ts`
**Estimated effort:** 4-5 hours

**Implementation:**
- Memory clustering and topic analysis
- Memory access patterns
- Automated memory importance scoring
- Memory relationship mapping

---

## 🎯 Recommended Implementation Order

For maximum impact with minimal effort:

1. ~~**Enable Adaptive Response Generation**~~ ✅ COMPLETED - Already working in production
2. ~~**Implement Real Embeddings**~~ ✅ COMPLETED - Memory system now functional with Gemini embeddings
3. **Add Memory Pruning** (2-3 hours) - Prevents long-term issues
4. **Workflow Integration for Multi-Step Reasoning** (3-4 hours) - Auto-trigger for complex queries
5. **Implement Workflow Checkpointing** (4-5 hours) - Major reliability improvement
6. **Enhanced Intrinsic Tasks** (4-6 hours) - More interesting autonomous behavior

## 📋 Development Guidelines

### Before Starting Any Task:
1. **Test current functionality** to understand the baseline
2. **Create a backup** of files you'll modify
3. **Read the existing code** thoroughly
4. **Plan your changes** step by step

### While Implementing:
1. **Make small, testable changes**
2. **Add comprehensive logging** with context
3. **Handle errors gracefully** with fallbacks
4. **Test thoroughly** with various inputs
5. **Update health monitoring** if adding new components

### Testing Strategy:
- **Unit tests:** Test individual functions
- **Integration tests:** Test full workflow paths
- **Persistence tests:** Verify checkpointing and memory
- **Load tests:** Test with many concurrent conversations
- **Edge cases:** Test error conditions and unusual inputs

### Environment Setup:
```bash
# Development commands
npm install           # Install dependencies
cp .env.example .env  # Copy environment template
npm run dev          # Run with hot reload
npm run build        # Build for production
npm start            # Run production build
```

The agent already has a solid foundation - these improvements will make it production-ready and highly capable!
