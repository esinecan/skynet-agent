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
import { streamText } from 'ai';
import { processQuery, processQueryStream, initializeAgent } from '../agent';
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
  const startTime = Date.now();
  
  // Add correlation ID to Sentry scope for this request
  const span = Sentry.getActiveSpan();
  if (span) {
    const spanContext = Sentry.spanToTraceHeader(span);
    Sentry.setTag("correlation_id", spanContext);
  }
  
  logger.debug('Incoming request', {
    method: req.method,
    path: req.path,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    contentType: req.get('Content-Type'),
    contentLength: req.get('Content-Length'),
    query: Object.keys(req.query).length > 0 ? req.query : undefined,
    timestamp: new Date().toISOString()
  });
  
  logger.info(`${req.method} ${req.path}`, {
    ip: req.ip,
    userAgent: req.get('User-Agent')
  });
  
  // Add response timing
  const originalSend = res.send;
  res.send = function(body) {
    const responseTime = Date.now() - startTime;
    logger.debug('Response completed', {
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      responseTimeMs: responseTime,
      contentLength: body ? body.length : 0,
      requestDurationBreakdown: {
        totalTime: responseTime,
        avgResponseSpeed: body ? Math.round((body.length / responseTime) * 1000) : 0 // bytes per second
      }
    });
    return originalSend.call(this, body);
  };
  
  next();
});

// Simple endpoint for user queries
app.post('/query', async (req, res) => {
  const startTime = Date.now();
  let sessionId = 'default';
  let queryLength = 0;
  
  try {
    Sentry.setTag("api.route", "/query");
    const { query, sessionId: reqSessionId = 'default' } = req.body;
    sessionId = reqSessionId;
    queryLength = query?.length || 0;
    
    logger.debug('Processing query request', {
      sessionId,
      queryLength,
      hasQuery: !!query,
      bodyKeys: Object.keys(req.body),
      requestId: req.get('X-Request-ID') || 'unknown'
    });
    
    if (!query) {
      const responseTime = Date.now() - startTime;
      logger.debug('Query validation failed - missing query', {
        sessionId,
        responseTimeMs: responseTime
      });
      return res.status(400).json({ error: 'Query is required' });
    }
    
    logger.info(`Processing query in session ${sessionId}`, {
      queryLength: query.length
    });
    Sentry.setTag("sessionId", sessionId);
    Sentry.setExtra("query_length", query.length);
    
    const agentStartTime = Date.now();
    const response = await processQuery(query, sessionId);
    const agentTime = Date.now() - agentStartTime;
    
    const totalTime = Date.now() - startTime;
    logger.debug('Query processed successfully', {
      sessionId,
      queryLength,
      responseLength: response.length,
      agentProcessingTimeMs: agentTime,
      totalRequestTimeMs: totalTime,
      efficiency: {
        charsPerSecond: Math.round((queryLength / agentTime) * 1000),
        responseCharsPerSecond: Math.round((response.length / agentTime) * 1000)
      }
    });
    
    logger.info('Query processed successfully', {
      sessionId,
      responseLength: response.length
    });
    Sentry.addBreadcrumb({ category: 'api', message: 'Query processed successfully', level: 'info', data: { sessionId, responseLength: response.length } });
      return res.json({ response });
  } catch (error) {
    const totalTime = Date.now() - startTime;
    const err = error instanceof Error ? error : new Error(String(error));
    logger.error('Error processing query:', err);
    logger.debug('Query processing failed', {
      sessionId,
      queryLength,
      processingTimeMs: totalTime,
      errorType: err.constructor.name,
      errorMessage: err.message
    });
    
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
  const startTime = Date.now();
  
  try {
    logger.debug('Getting memory status');
    
    const memoryCountStartTime = Date.now();
    const memoryCount = await memoryManager.getMemoryCount();
    const memoryCountTime = Date.now() - memoryCountStartTime;
    
    const consolidationStatus = getConsolidationStatus();
    const responseTime = Date.now() - startTime;
    
    logger.debug('Memory status retrieved successfully', {
      memoryCount,
      memoryCountTimeMs: memoryCountTime,
      consolidationActive: consolidationStatus.isRunning,
      responseTimeMs: responseTime
    });
    
    Sentry.addBreadcrumb({ category: 'memory', message: 'Memory status accessed', level: 'info', data: { memoryCount, consolidationStatus } });
    
    res.json({
      memoryCount,
      consolidation: consolidationStatus,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    const responseTime = Date.now() - startTime;
    const err = error instanceof Error ? error : new Error(String(error));
    logger.error('Error getting memory status:', err);
    logger.debug('Memory status request failed', {
      responseTimeMs: responseTime,
      errorType: err.constructor.name,
      errorMessage: err.message
    });
    
    const errorResponse = handleApiError(error);
    return res.status(errorResponse.status).json(errorResponse.body);
  }
});

// Intrinsic motivation status endpoint
app.get('/intrinsic/status', (req, res) => {
  const startTime = Date.now();
  
  logger.debug('Getting intrinsic motivation status');
  
  const status = getIntrinsicMotivationStatus();
  const recentTasks = getRecentIntrinsicTasks();
  const responseTime = Date.now() - startTime;
  
  logger.debug('Intrinsic motivation status retrieved', {
    isTaskRunning: status.isTaskRunning,
    taskCount: recentTasks.length,
    responseTimeMs: responseTime,
    idleTimeMinutes: status.idleTimeMinutes,
    lastInteraction: status.lastInteraction
  });
  
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
  const startTime = Date.now();
  
  try {
    logger.debug('Getting all sessions', {
      requestOrigin: req.get('Origin'),
      userAgent: req.get('User-Agent')
    });
    
    const sessions = await sessionManager.getAllSessions();
    const responseTime = Date.now() - startTime;
    
    logger.debug('All sessions retrieved successfully', {
      sessionCount: sessions.length,
      responseTimeMs: responseTime,
      avgTimePerSession: sessions.length > 0 ? Math.round(responseTime / sessions.length) : 0
    });
    
    res.json(sessions);
  } catch (error) {
    const responseTime = Date.now() - startTime;
    const err = error instanceof Error ? error : new Error(String(error));
    logger.error('Error retrieving sessions:', err);
    logger.debug('Session retrieval failed', {
      responseTimeMs: responseTime,
      errorType: err.constructor.name,
      errorMessage: err.message
    });
    
    const errorResponse = handleApiError(error);
    res.status(errorResponse.status).json(errorResponse.body);
  }
});

app.post('/api/sessions', async (req, res) => {
  const startTime = Date.now();
  let title = 'Unknown';
  
  try {
    title = req.body.title || 'Untitled Session';
    logger.debug('Creating new session', {
      title,
      titleLength: title.length,
      hasCustomTitle: !!req.body.title
    });
    
    const session = await sessionManager.createSession(title);
    const responseTime = Date.now() - startTime;
    
    logger.debug('Session created successfully', {
      sessionId: session.id,
      title: session.title,
      creationTimeMs: responseTime,
      createdAt: session.createdAt
    });
    
    res.json(session);
  } catch (error) {
    const responseTime = Date.now() - startTime;
    const err = error instanceof Error ? error : new Error(String(error));
    logger.error('Error creating session:', err);
    logger.debug('Session creation failed', {
      title,
      creationTimeMs: responseTime,
      errorType: err.constructor.name,
      errorMessage: err.message
    });
    
    const errorResponse = handleApiError(error);
    res.status(errorResponse.status).json(errorResponse.body);
  }
});

app.get('/api/sessions/:id', async (req, res) => {
  const startTime = Date.now();
  const sessionId = req.params.id;
  
  try {
    logger.debug('Getting specific session', {
      sessionId,
      requestPath: req.path
    });
    
    const session = await sessionManager.getSession(sessionId);
    const responseTime = Date.now() - startTime;
    
    if (!session) {
      logger.debug('Session not found', {
        sessionId,
        responseTimeMs: responseTime
      });
      return res.status(404).json({ error: 'Session not found' });
    }
    
    logger.debug('Session retrieved successfully', {
      sessionId,
      title: session.title,
      messageCount: session.messages?.length || 0,
      responseTimeMs: responseTime,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt
    });
    
    res.json(session);
  } catch (error) {
    const responseTime = Date.now() - startTime;
    const err = error instanceof Error ? error : new Error(String(error));
    logger.error('Error retrieving session:', err);
    logger.debug('Session retrieval failed', {
      sessionId,
      responseTimeMs: responseTime,
      errorType: err.constructor.name,
      errorMessage: err.message
    });
    
    const errorResponse = handleApiError(error);
    res.status(errorResponse.status).json(errorResponse.body);
  }
});

app.delete('/api/sessions/:id', async (req, res) => {
  const startTime = Date.now();
  const sessionId = req.params.id;
  
  try {
    logger.debug('Deleting session', {
      sessionId,
      requestPath: req.path
    });
    
    await sessionManager.deleteSession(sessionId);
    const responseTime = Date.now() - startTime;
    
    logger.debug('Session deleted successfully', {
      sessionId,
      deleteTimeMs: responseTime
    });
    
    res.json({ success: true });
  } catch (error) {
    const responseTime = Date.now() - startTime;
    const err = error instanceof Error ? error : new Error(String(error));
    logger.error('Error deleting session:', err);
    logger.debug('Session deletion failed', {
      sessionId,
      deleteTimeMs: responseTime,
      errorType: err.constructor.name,
      errorMessage: err.message
    });
    
    const errorResponse = handleApiError(error);
    res.status(errorResponse.status).json(errorResponse.body);
  }
});

// Streaming chat endpoint
app.post('/api/chat/stream', async (req, res) => {
  const startTime = Date.now();
  let sessionId = 'unknown';
  let messageLength = 0;
  
  // Set headers for SSE
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering
  
  const { sessionId: reqSessionId, message, attachments } = req.body;
  sessionId = reqSessionId || 'default';
  messageLength = message?.length || 0;
  
  logger.debug('Starting streaming chat', {
    sessionId,
    messageLength,
    hasAttachments: !!attachments?.length,
    attachmentCount: attachments?.length || 0
  });
  
  try {
    // Add user message to session
    const userMessage = {
      id: `msg_${Date.now()}`,
      role: 'user' as const,
      content: message,
      timestamp: new Date().toISOString(),
      attachments
    };
    
    const addMessageStartTime = Date.now();
    await sessionManager.addMessage(sessionId, userMessage);
    const addMessageTime = Date.now() - addMessageStartTime;
    
    logger.debug('User message added to session', {
      sessionId,
      messageId: userMessage.id,
      addMessageTimeMs: addMessageTime
    });
    
    // Send initial acknowledgment
    res.write(`data: ${JSON.stringify({ type: 'start' })}\n\n`);
      // Get streaming response from agent with enhanced tool calling
    const streamStartTime = Date.now();
    const responseStream = await processQueryStream(message, sessionId);
    const reader = responseStream.getReader();
    const decoder = new TextDecoder();
    let fullResponse = '';
    let chunkCount = 0;
    
    // Variables to track tool call information with better typing
    interface EnhancedToolCallInfo {
      server: string;
      tool: string;
      args: Record<string, any>;
      detectedAt: string;
      inProgress: boolean;
      id?: string;
    }
    
    let detectedToolCall: EnhancedToolCallInfo | null = null;
    let toolCallResult: any = null;
    
    logger.debug('Started processing stream with enhanced tool detection', {
      sessionId,
      streamSetupTimeMs: Date.now() - streamStartTime
    });
    
    // Enhanced tool call detection
    const detectToolCall = (chunk: string): EnhancedToolCallInfo | null => {
      try {
        // Look for JSON blocks that might contain tool calls
        const jsonMatch = chunk.match(/```json\s*([\s\S]*?)\s*```/) || 
                         chunk.match(/\{[\s\S]*"server"[\s\S]*"tool"[\s\S]*\}/);
                         
        if (jsonMatch) {
          const jsonStr = jsonMatch[1] || jsonMatch[0];
          const parsed = JSON.parse(jsonStr);
          
          if (parsed.server && parsed.tool) {
            const toolCallId = `tc_${Date.now()}_${Math.random().toString(36).substring(7)}`;
            
            logger.debug('Enhanced tool call detected in stream', {
              toolCallId,
              server: parsed.server,
              tool: parsed.tool,
              argsKeys: Object.keys(parsed.args || {}),
              argsCount: Object.keys(parsed.args || {}).length
            });
            
            return {
              id: toolCallId,
              server: parsed.server,
              tool: parsed.tool,
              args: parsed.args || {},
              detectedAt: new Date().toISOString(),
              inProgress: true
            };
          }
        }
        
        // Also look for inline tool calls: [TOOL: server:tool args]
        const inlineMatch = chunk.match(/\[TOOL:\s+([^:]+):([^\s]+)\s+(\{.*?\})\]/);
        if (inlineMatch) {
          const [, server, tool, argsStr] = inlineMatch;
          const args = JSON.parse(argsStr);
          const toolCallId = `tc_${Date.now()}_${Math.random().toString(36).substring(7)}`;
          
          logger.debug('Inline tool call detected', {
            toolCallId,
            server,
            tool,
            args
          });
          
          return {
            id: toolCallId,
            server,
            tool,
            args,
            detectedAt: new Date().toISOString(),
            inProgress: true
          };
        }
      } catch (e) {
        // Ignore parsing errors as we might be dealing with incomplete JSON
        logger.debug('Tool call parsing error (expected during streaming)', {
          error: e instanceof Error ? e.message : String(e)
        });
      }
      return null;
    };    // Helper to detect tool results
    const detectToolResult = (chunk: string, toolCall: EnhancedToolCallInfo): { result?: any; error?: string; detectedAt: string; success: boolean } | null => {
      if (!toolCall) return null;
      
      try {
        // Look for the standard result pattern
        const resultPattern = new RegExp(`I called the tool ${toolCall.tool} from ${toolCall.server} with the arguments .+? The result was: (.+)`);
        const match = chunk.match(resultPattern);
        
        if (match) {
          const resultJson = JSON.parse(match[1]);
          logger.debug('Tool call result detected', {
            server: toolCall.server,
            tool: toolCall.tool,
            resultType: typeof resultJson
          });
          
          return {
            result: resultJson,
            detectedAt: new Date().toISOString(),
            success: true
          };
        }
        
        // Check for errors
        if (chunk.includes(`Error executing tool ${toolCall.tool}`) || 
            chunk.includes(`Error calling tool ${toolCall.tool}`)) {
          return {
            error: 'Tool execution failed',
            detectedAt: new Date().toISOString(),
            success: false
          };
        }
      } catch (e) {
        logger.debug('Error parsing tool result', {
          error: e instanceof Error ? e.message : String(e)
        });
      }
      
      return null;
    };
    
    // Stream the response chunks
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      
      const chunk = decoder.decode(value, { stream: true });
      fullResponse += chunk;
      chunkCount++;
      
      // Detect tool calls in the chunk
      if (!detectedToolCall) {
        const toolCall = detectToolCall(chunk);
        if (toolCall) {
          detectedToolCall = toolCall;
          // Send tool call started event
          res.write(`data: ${JSON.stringify({ 
            type: 'toolCall', 
            status: 'started',
            toolCall: detectedToolCall 
          })}\n\n`);
        }
      }
      
      // Detect tool results if we have a tool call
      if (detectedToolCall && !toolCallResult) {
        const result = detectToolResult(fullResponse, detectedToolCall);
        if (result) {
          toolCallResult = result;
          detectedToolCall = { 
            ...detectedToolCall, 
            ...result, 
            inProgress: false 
          };
          
          // Send tool call completion event
          res.write(`data: ${JSON.stringify({
            type: 'toolCall',
            status: result.success ? 'completed' : 'failed',
            toolCall: detectedToolCall
          })}\n\n`);
        }
      }
      
      // Send the chunk
      res.write(`data: ${JSON.stringify({ type: 'chunk', content: chunk })}\n\n`);
      
      if (chunkCount % 10 === 0) { // Log every 10th chunk to avoid spam
        logger.debug('Streaming progress', {
          sessionId,
          chunksProcessed: chunkCount,
          totalCharsStreamed: fullResponse.length,
          hasToolCall: !!detectedToolCall,
          hasToolResult: !!toolCallResult
        });
      }
    }
    
    const streamTime = Date.now() - streamStartTime;
    
    // Add assistant message to session with tool call information if detected
    const assistantMessage = {
      id: `msg_${Date.now()}`,
      role: 'assistant' as const,
      content: fullResponse,
      timestamp: new Date().toISOString(),
      toolCall: detectedToolCall
    };
    
    const saveAssistantStartTime = Date.now();
    await sessionManager.addMessage(sessionId, assistantMessage);
    const saveAssistantTime = Date.now() - saveAssistantStartTime;
    
    // Send completion event
    res.write(`data: ${JSON.stringify({ type: 'end' })}\n\n`);
    res.end();
    
    const totalTime = Date.now() - startTime;
    logger.debug('Streaming chat completed successfully', {
      sessionId,
      totalTimeMs: totalTime,
      streamTimeMs: streamTime,
      saveAssistantTimeMs: saveAssistantTime,
      chunksStreamed: chunkCount,
      inputChars: messageLength,
      outputChars: fullResponse.length,
      efficiency: {
        charsPerSecond: Math.round((fullResponse.length / streamTime) * 1000),
        chunksPerSecond: Math.round((chunkCount / streamTime) * 1000)
      }
    });
    
  } catch (error) {
    const totalTime = Date.now() - startTime;
    const err = error instanceof Error ? error : new Error(String(error));
    logger.error('Error processing streaming chat:', err);
    logger.debug('Streaming chat failed', {
      sessionId,
      totalTimeMs: totalTime,
      errorType: err.constructor.name,
      errorMessage: err.message,
      messageLength
    });
    
    res.write(`data: ${JSON.stringify({ type: 'error', error: err.message })}\n\n`);
    res.end();
  }
});

// File upload endpoint
app.post('/api/upload', upload.array('files', 10), async (req, res) => {
  const startTime = Date.now();
  
  try {
    const files = req.files as Express.Multer.File[];
    
    logger.debug('Processing file upload', {
      fileCount: files?.length || 0,
      totalSize: files?.reduce((sum, file) => sum + file.size, 0) || 0,
      fileTypes: files?.map(f => f.mimetype) || []
    });
    
    const uploadedFiles = files.map(file => {
      logger.debug('Processing individual file', {
        fileName: file.originalname,
        fileSize: file.size,
        mimeType: file.mimetype,
        encoding: file.encoding
      });
      
      return {
        name: file.originalname,
        type: file.mimetype,
        data: file.buffer.toString('base64')
      };
    });
    
    const responseTime = Date.now() - startTime;
    logger.debug('File upload completed successfully', {
      filesProcessed: uploadedFiles.length,
      totalSizeBytes: files?.reduce((sum, file) => sum + file.size, 0) || 0,
      processingTimeMs: responseTime,
      bytesPerSecond: files?.length ? Math.round((files.reduce((sum, file) => sum + file.size, 0) / responseTime) * 1000) : 0
    });
    
    res.json({
      success: true,
      files: uploadedFiles
    });
  } catch (error) {
    const responseTime = Date.now() - startTime;
    const err = error instanceof Error ? error : new Error(String(error));
    logger.error('Error handling file upload:', err);
    logger.debug('File upload failed', {
      processingTimeMs: responseTime,
      errorType: err.constructor.name,
      errorMessage: err.message
    });
    
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

export function startApiServer(port = 3000, maxRetries = 5): Promise<Server> {
  return new Promise((resolve, reject) => {
    const startTime = Date.now();
    
    logger.debug('Starting API server initialization', {
      targetPort: port,
      maxRetries,
      nodeEnv: process.env.NODE_ENV,
      processId: process.pid
    });
    
    // Initialize all subsystems
    try {
      const subsystemStartTime = Date.now();
      
      // Initialize health monitoring
      logger.debug('Initializing health monitoring');
      initializeHealthMonitoring();
      
      // Initialize memory manager
      logger.debug('Initializing memory manager');
      memoryManager.initialize().catch((error: unknown) => {
        const err = error instanceof Error ? error : new Error(String(error));
        logger.error('Failed to initialize memory manager:', err);
        logger.debug('Memory manager initialization failed', {
          errorType: err.constructor.name,
          errorMessage: err.message
        });
      });
      
      // Initialize memory consolidation
      logger.debug('Initializing memory consolidation', {
        schedule: process.env.MEMORY_CONSOLIDATION_SCHEDULE || 'default'
      });
      initializeMemoryConsolidation(process.env.MEMORY_CONSOLIDATION_SCHEDULE);
      
      // Initialize intrinsic motivation
      logger.debug('Initializing intrinsic motivation');
      initializeIntrinsicMotivation();
      
      // Initialize self-reflection
      logger.debug('Initializing self-reflection');
      initializeSelfReflection();
      
      const subsystemTime = Date.now() - subsystemStartTime;
      logger.debug('All subsystems initialized successfully', {
        initializationTimeMs: subsystemTime
      });
      
      logger.info('All subsystems initialized');
    } catch (error) {
      const initTime = Date.now() - startTime;
      const err = error instanceof Error ? error : new Error(String(error));
      logger.error('Error initializing subsystems:', err);
      logger.debug('Subsystem initialization failed', {
        initializationTimeMs: initTime,
        errorType: err.constructor.name,
        errorMessage: err.message
      });
    }
    
    // Recursive function to try different ports
    const attemptListen = (currentPort: number, retriesLeft: number) => {
      const attemptStartTime = Date.now();
      
      logger.debug('Attempting to start server', {
        port: currentPort,
        retriesLeft,
        attemptNumber: maxRetries - retriesLeft + 1
      });
      
      const server = app.listen(currentPort)
        .on('listening', () => {
          const totalStartTime = Date.now() - startTime;
          const listenTime = Date.now() - attemptStartTime;
          
          logger.debug('Server started successfully', {
            port: currentPort,
            totalStartTimeMs: totalStartTime,
            listenTimeMs: listenTime,
            attemptsUsed: maxRetries - retriesLeft + 1
          });
          
          logger.info(`API server listening on port ${currentPort}`);
          resolve(server);
        })
        .on('error', (err: NodeJS.ErrnoException) => {
          const attemptTime = Date.now() - attemptStartTime;
          
          if (err.code === 'EADDRINUSE') {
            logger.debug('Port already in use', {
              port: currentPort,
              retriesLeft,
              attemptTimeMs: attemptTime
            });
            
            logger.warn(`Port ${currentPort} is already in use`);
            if (retriesLeft > 0) {
              logger.info(`Trying port ${currentPort + 1}...`);
              server.close();
              attemptListen(currentPort + 1, retriesLeft - 1);
            } else {
              const totalTime = Date.now() - startTime;
              const error = new Error(`Unable to find available port after ${maxRetries} attempts`);
              logger.debug('Server startup failed - no available ports', {
                totalTimeMs: totalTime,
                attemptsUsed: maxRetries,
                finalPort: currentPort
              });
              
              logger.error(error.message);
              reject(error);
            }
          } else {
            const totalTime = Date.now() - startTime;
            logger.debug('Server startup failed with error', {
              port: currentPort,
              totalTimeMs: totalTime,
              errorCode: err.code,
              errorType: err.constructor.name,
              errorMessage: err.message
            });
            
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

// Define interface for tool call information
interface ToolCallInfo {
  server: string;
  tool: string;
  args: Record<string, any>;
  detectedAt: string;
  inProgress: boolean;
  result?: any;
  error?: string;
  success?: boolean;
}
