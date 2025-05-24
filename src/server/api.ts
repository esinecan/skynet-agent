/**
 * Enhanced API server with health endpoints and improved error handling
 */

import * as Sentry from "@sentry/node";
import express, { type Express } from 'express';
import { type Server } from 'node:http';
import cors from 'cors';
import multer from 'multer';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { processQuery, initializeAgent } from '../agent';
import { createLogger } from '../utils/logger';
import { handleApiError, setupGlobalErrorHandlers } from '../utils/errorHandler';
import { getHealthReport, getHealthStatus, initializeHealthMonitoring } from '../utils/health';
import { memoryManager } from '../memory';
import { initializeMemoryConsolidation, getConsolidationStatus } from '../memory/consolidation';
import { initializeIntrinsicMotivation, getIntrinsicMotivationStatus, getRecentIntrinsicTasks } from '../agent/intrinsicMotivation';
import { initializeSelfReflection } from '../agent/selfReflection';
import { reloadMcpServerConfigs } from '../utils/configLoader';
import { sessionManager } from '../db/sessions';

const logger = createLogger('server');

// Initialize Express app
const app = express();

// Sentry: Setup middleware (v8+ uses setupExpressErrorHandler at the end)
app.use(express.json());
app.use(cors());

// Set up global error handlers
setupGlobalErrorHandlers();

// Multer setup for file uploads
const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

// Request logging middleware
app.use((req, res, next) => {
  // Add correlation ID to Sentry scope for this request
  const span = Sentry.getActiveSpan();
  if (span) {
    const spanContext = Sentry.spanToTraceHeader(span);
    Sentry.setTag("correlation_id", spanContext);
  }
  logger.info(`${req.method} ${req.path}`, {
    ip: req.ip,
    userAgent: req.get('User-Agent')
  });
  next();
});

// Simple endpoint for user queries
app.post('/query', async (req, res) => {
  try {
    Sentry.setTag("api.route", "/query");
    const { query, sessionId = 'default' } = req.body;
    
    if (!query) {
      return res.status(400).json({ error: 'Query is required' });
    }
    
    logger.info(`Processing query in session ${sessionId}`, {
      queryLength: query.length
    });
    Sentry.setTag("sessionId", sessionId);
    Sentry.setExtra("query_length", query.length);
    
    const response = await processQuery(query, sessionId);
    
    logger.info('Query processed successfully', {
      sessionId,
      responseLength: response.length
    });
    Sentry.addBreadcrumb({ category: 'api', message: 'Query processed successfully', level: 'info', data: { sessionId, responseLength: response.length } });
      return res.json({ response });
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    logger.error('Error processing query:', err);
    const errorResponse = handleApiError(error); // This will also send to Sentry
    // Sentry.Handlers.errorHandler will pick this up if not caught before
    return res.status(errorResponse.status).json(errorResponse.body);
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  const status = getHealthStatus();
  Sentry.addBreadcrumb({ category: 'health', message: 'Health endpoint accessed', level: 'info', data: status });
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
  Sentry.addBreadcrumb({ category: 'health', message: 'Health report accessed', level: 'info' });
  res.json(report);
});

// Memory status endpoint
app.get('/memory/status', async (req, res) => {
  try {
    const memoryCount = await memoryManager.getMemoryCount();
    const consolidationStatus = getConsolidationStatus();
    Sentry.addBreadcrumb({ category: 'memory', message: 'Memory status accessed', level: 'info', data: { memoryCount, consolidationStatus } });
    
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

// Sessions endpoints
app.get('/api/sessions', async (req, res) => {
  try {
    const sessions = await sessionManager.getAllSessions();
    res.json(sessions);
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    logger.error('Error retrieving sessions:', err);
    const errorResponse = handleApiError(error);
    res.status(errorResponse.status).json(errorResponse.body);
  }
});

app.post('/api/sessions', async (req, res) => {
  try {
    const { title } = req.body;
    const session = await sessionManager.createSession(title);
    res.json(session);
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    logger.error('Error creating session:', err);
    const errorResponse = handleApiError(error);
    res.status(errorResponse.status).json(errorResponse.body);
  }
});

app.get('/api/sessions/:id', async (req, res) => {
  try {
    const session = await sessionManager.getSession(req.params.id);
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }
    res.json(session);
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    logger.error('Error retrieving session:', err);
    const errorResponse = handleApiError(error);
    res.status(errorResponse.status).json(errorResponse.body);
  }
});

app.delete('/api/sessions/:id', async (req, res) => {
  try {
    await sessionManager.deleteSession(req.params.id);
    res.json({ success: true });
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    logger.error('Error deleting session:', err);
    const errorResponse = handleApiError(error);
    res.status(errorResponse.status).json(errorResponse.body);
  }
});

// Streaming chat endpoint
app.post('/api/chat/stream', async (req, res) => {
  // Set headers for SSE
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  
  const { sessionId, message, attachments } = req.body;
  
  try {
    // Add user message to session
    const userMessage = {
      id: `msg_${Date.now()}`,
      role: 'user' as const,
      content: message,
      timestamp: new Date().toISOString(),
      attachments
    };
    
    await sessionManager.addMessage(sessionId, userMessage);
    
    // Send initial acknowledgment
    res.write(`data: ${JSON.stringify({ type: 'start' })}\n\n`);
    
    // Process with agent
    const response = await processQuery(message, sessionId);
    
    // Simulate streaming by sending chunks
    const chunks = response.match(/.{1,50}/g) || [];
    let fullResponse = '';
    
    for (const chunk of chunks) {
      fullResponse += chunk;
      res.write(`data: ${JSON.stringify({ type: 'chunk', content: chunk })}\n\n`);
      // Small delay to simulate streaming
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    
    // Add assistant message to session
    const assistantMessage = {
      id: `msg_${Date.now()}`,
      role: 'assistant' as const,
      content: fullResponse,
      timestamp: new Date().toISOString()
    };
    
    await sessionManager.addMessage(sessionId, assistantMessage);
    
    // Send completion event
    res.write(`data: ${JSON.stringify({ type: 'end' })}\n\n`);
    res.end();
    
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    logger.error('Error processing streaming chat:', err);
    res.write(`data: ${JSON.stringify({ type: 'error', error: err.message })}\n\n`);
    res.end();
  }
});

// File upload endpoint
app.post('/api/upload', upload.array('files', 10), async (req, res) => {
  try {
    const files = req.files as Express.Multer.File[];
    const uploadedFiles = files.map(file => ({
      name: file.originalname,
      type: file.mimetype,
      data: file.buffer.toString('base64')
    }));
    
    res.json({
      success: true,
      files: uploadedFiles
    });
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    logger.error('Error handling file upload:', err);
    const errorResponse = handleApiError(error);
    res.status(errorResponse.status).json(errorResponse.body);  }
});

// Debug Sentry endpoint for testing error reporting
app.get("/debug-sentry", (req, res) => {
  logger.info("Debug Sentry endpoint accessed");
  
  // Add breadcrumb for debugging
  Sentry.addBreadcrumb({
    category: 'debug',
    message: 'Debug Sentry endpoint accessed',
    level: 'info',
    data: { timestamp: new Date().toISOString() }
  });
  
  // Test different types of Sentry functionality
  const testType = req.query.test as string;
    switch (testType) {
    case 'error': {
      // Test error capture
      const testError = new Error("This is a test error for Sentry monitoring");
      Sentry.captureException(testError);
      logger.error("Test error captured", { error: testError });
      res.json({ 
        message: "Test error sent to Sentry", 
        error: testError.message,
        timestamp: new Date().toISOString()
      });
      break;
    }
      
    case 'transaction':
      // Test transaction/span
      return Sentry.startSpan({ name: 'debug-transaction', op: 'debug' }, (span) => {
        span?.setAttributes({ test: true, debug: 'true' });
        
        logger.info("Test transaction created");
        res.json({ 
          message: "Test transaction created", 
          traceId: span?.spanContext().traceId,
          timestamp: new Date().toISOString()
        });
      });
      
    case 'breadcrumb':
      // Test breadcrumb
      Sentry.addBreadcrumb({
        category: 'test',
        message: 'Test breadcrumb added',
        level: 'info',
        data: { test: true }
      });
      logger.info("Test breadcrumb added");
      res.json({ 
        message: "Test breadcrumb added to Sentry", 
        timestamp: new Date().toISOString()
      });
      break;
      
    default:
      // Default info response
      res.json({
        message: "Sentry debug endpoint is working",
        availableTests: ['error', 'transaction', 'breadcrumb'],
        usage: "Add ?test=<type> to test specific functionality",
        timestamp: new Date().toISOString()
      });
  }
});

// Sentry error handler must be before any other error middleware and after all controllers
app.use(Sentry.expressErrorHandler());

export function startApiServer(port = 3000, maxRetries = 5): Promise<Server> {
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
            logger.error('Server error:', err);
            reject(err);
          }
        });
    };

    // Start with initial port
    attemptListen(port, maxRetries);
  });
}

// Serve React build in production
const setupClientRoutes = () => {
  const isProduction = process.env.NODE_ENV === 'production';
  const clientDistPath = path.join(__dirname, '../../client/dist');
  
  logger.info(`Environment: ${isProduction ? 'production' : 'development'}`);
  
  if (isProduction && fs.existsSync(clientDistPath)) {
    // Serve static files from the React build
    logger.info(`Serving React app from ${clientDistPath}`);
    app.use(express.static(clientDistPath));
    
    // Handle React routing, return all non-API routes to React app
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api')) {
        return next();
      }
      res.sendFile(path.join(clientDistPath, 'index.html'));
    });
  } else {
    logger.info('Development mode: Not serving React app');
  }
};

// Call this before starting the server
setupClientRoutes();

// Sentry: Error Handler must be registered after all controllers and before any other error middleware
Sentry.setupExpressErrorHandler(app);
