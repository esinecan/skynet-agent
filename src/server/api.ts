/**
 * Enhanced API server with health endpoints and improved error handling
 */

import express from 'express';
import cors from 'cors';
import { processQuery, initializeAgent } from '../agent';
import { createLogger } from '../utils/logger';
import { handleApiError, setupGlobalErrorHandlers } from '../utils/errorHandler';
import { getHealthReport, getHealthStatus, initializeHealthMonitoring } from '../utils/health';
import { memoryManager } from '../memory';
import { initializeMemoryConsolidation, getConsolidationStatus } from '../memory/consolidation';
import { initializeIntrinsicMotivation, getIntrinsicMotivationStatus, getRecentIntrinsicTasks } from '../agent/intrinsicMotivation';
import { initializeSelfReflection } from '../agent/selfReflection';
import { reloadMcpServerConfigs } from '../utils/configLoader';

const logger = createLogger('server');

// Initialize Express app
const app = express();
app.use(express.json());
app.use(cors());

// Set up global error handlers
setupGlobalErrorHandlers();

// Request logging middleware
app.use((req, res, next) => {
  logger.info(`${req.method} ${req.path}`, {
    ip: req.ip,
    userAgent: req.get('User-Agent')
  });
  next();
});

// Simple endpoint for user queries
app.post('/query', async (req, res) => {
  try {
    const { query, sessionId = 'default' } = req.body;
    
    if (!query) {
      return res.status(400).json({ error: 'Query is required' });
    }
    
    logger.info(`Processing query in session ${sessionId}`, {
      queryLength: query.length
    });
    
    const response = await processQuery(query, sessionId);
    
    logger.info('Query processed successfully', {
      sessionId,
      responseLength: response.length
    });
    
    return res.json({ response });
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    logger.error('Error processing query:', err);
    const errorResponse = handleApiError(error);
    return res.status(errorResponse.status).json(errorResponse.body);
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  const status = getHealthStatus();
  res.json({
    status: status.status,
    uptime: status.uptime,
    message: status.message,
    timestamp: new Date().toISOString()
  });
});

// Detailed health report endpoint
app.get('/health/report', (req, res) => {
  const report = getHealthReport();
  res.json(report);
});

// Memory status endpoint
app.get('/memory/status', async (req, res) => {
  try {
    const memoryCount = await memoryManager.getMemoryCount();
    const consolidationStatus = getConsolidationStatus();
    
    res.json({
      memoryCount,
      consolidation: consolidationStatus,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    logger.error('Error getting memory status:', err);
    const errorResponse = handleApiError(error);
    return res.status(errorResponse.status).json(errorResponse.body);
  }
});

// Intrinsic motivation status endpoint
app.get('/intrinsic/status', (req, res) => {
  const status = getIntrinsicMotivationStatus();
  const recentTasks = getRecentIntrinsicTasks();
  
  res.json({
    status,
    recentTasks,
    timestamp: new Date().toISOString()
  });
});

// Trigger memory consolidation manually (for testing)
app.post('/memory/consolidate', async (req, res) => {
  try {
    const { runMemoryConsolidation } = require('../memory/consolidation');
    await runMemoryConsolidation();
    
    res.json({
      status: 'success',
      message: 'Memory consolidation triggered successfully',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    logger.error('Error triggering memory consolidation:', err);
    const errorResponse = handleApiError(error);
    return res.status(errorResponse.status).json(errorResponse.body);
  }
});

// MCP configuration reload endpoint
app.post('/mcp/reload', async (req, res) => {
  try {
    logger.info('Reloading MCP server configurations');
    
    // Reload MCP configurations
    const configs = reloadMcpServerConfigs();
    
    // Reinitialize the agent with new configurations
    // This will require the user to re-init the agent in a real implementation
    // For now, we just return the loaded configs
    
    res.json({
      success: true,
      message: 'MCP server configurations reloaded',
      count: configs.length,
      servers: configs.map(c => c.name),
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    logger.error('Error reloading MCP configurations:', err);
    const errorResponse = handleApiError(error);
    return res.status(errorResponse.status).json(errorResponse.body);
  }
});

export function startApiServer(port: number = 3000, maxRetries: number = 5): Promise<any> {
  return new Promise((resolve, reject) => {
    // Initialize all subsystems
    try {
      // Initialize health monitoring
      initializeHealthMonitoring();
      
      // Initialize memory manager
      memoryManager.initialize().catch(error => {
        const err = error instanceof Error ? error : new Error(String(error));
        logger.error('Failed to initialize memory manager:', err);
      });
      
      // Initialize memory consolidation
      initializeMemoryConsolidation(process.env.MEMORY_CONSOLIDATION_SCHEDULE);
      
      // Initialize intrinsic motivation
      initializeIntrinsicMotivation();
      
      // Initialize self-reflection
      initializeSelfReflection();
      
      logger.info('All subsystems initialized');
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      logger.error('Error initializing subsystems:', err);
    }
    
    // Recursive function to try different ports
    const attemptListen = (currentPort: number, retriesLeft: number) => {
      const server = app.listen(currentPort)
        .on('listening', () => {
          logger.info(`API server listening on port ${currentPort}`);
          resolve(server);
        })
        .on('error', (err: NodeJS.ErrnoException) => {
          if (err.code === 'EADDRINUSE') {
            logger.warn(`Port ${currentPort} is already in use`);
            if (retriesLeft > 0) {
              logger.info(`Trying port ${currentPort + 1}...`);
              server.close();
              attemptListen(currentPort + 1, retriesLeft - 1);
            } else {
              const error = new Error(`Unable to find available port after ${maxRetries} attempts`);
              logger.error(error.message);
              reject(error);
            }
          } else {
            logger.error(`Server error:`, err);
            reject(err);
          }
        });
    };

    // Start with initial port
    attemptListen(port, maxRetries);
  });
}
