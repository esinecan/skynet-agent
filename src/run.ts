/**
 * Script to run the Skynet Agent server
 * This script sets up the environment and starts the server
 */

import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';

// Set up logging to idle-logs.txt
const idleLogsPath = path.resolve(process.cwd(), 'idle-logs.txt');
fs.writeFileSync(idleLogsPath, ''); // Empty the file

// Create a write stream for the log file
const logStream = fs.createWriteStream(idleLogsPath, { flags: 'a' });

// Override console methods to also write to file
const originalConsole = {
  log: console.log,
  error: console.error,
  warn: console.warn,
  info: console.info
};

console.log = function(...args) {
  originalConsole.log(...args);
  logStream.write(args.join(' ') + '\n');
};

console.error = function(...args) {
  originalConsole.error(...args);
  logStream.write('[ERROR] ' + args.join(' ') + '\n');
};

console.warn = function(...args) {
  originalConsole.warn(...args);
  logStream.write('[WARN] ' + args.join(' ') + '\n');
};

console.info = function(...args) {
  originalConsole.info(...args);
  logStream.write('[INFO] ' + args.join(' ') + '\n');
};

// Ensure .env file exists
const envPath = path.resolve(process.cwd(), '.env');
if (!fs.existsSync(envPath)) {
  console.log('Creating .env file from .env.example...');
  fs.copyFileSync(path.resolve(process.cwd(), '.env.example'), envPath);
}

// Load environment variables
dotenv.config({ path: envPath });

// Initial environment logging (before creating logger since logger needs env)
console.log('Environment configuration loaded:', {
  envPath,
  nodeEnv: process.env.NODE_ENV,
  hasGoogleApiKey: !!process.env.GOOGLE_API_KEY && process.env.GOOGLE_API_KEY !== 'your_gemini_api_key_here',
  port: process.env.PORT || '9000 (default)',
  memoryConsolidationSchedule: process.env.MEMORY_CONSOLIDATION_SCHEDULE || 'default'
});

// Check for Google API key
const apiKey = process.env.GOOGLE_API_KEY;
if (!apiKey || apiKey === 'your_gemini_api_key_here') {
 console.log('Please set your GOOGLE_API_KEY in the .env file');
 console.log('Visit https://ai.google.dev/ to obtain a Gemini API key');
 console.log('Configuration check failed - missing API key');
 process.exit(1);
  
  // Reload environment variables
  dotenv.config({ path: envPath });
  console.log('Environment updated with API key');
}

// Start the server directly instead of using dynamic import
import { initializeAgent } from './agent';
import { startApiServer } from './server/api';
import { createLogger } from './utils/logger';

// Create logger after environment setup
const logger = createLogger('main');

async function main() {
  const startTime = Date.now();
  console.log('Skynet Agent is initializing...');
  
  logger.debug('Starting main initialization process', {
    nodeVersion: process.version,
    platform: process.platform,
    cwd: process.cwd(),
    processId: process.pid,
    nodeEnv: process.env.NODE_ENV,
    hasGoogleApiKey: !!process.env.GOOGLE_API_KEY && process.env.GOOGLE_API_KEY !== 'your_gemini_api_key_here'
  });
  
  try {
    // Initialize the agent and workflow
    logger.debug('Starting agent initialization phase');
    const agentStartTime = Date.now();
    
    const { agentWorkflow, mcpManager } = await initializeAgent();
    const agentTime = Date.now() - agentStartTime;
    
    logger.debug('Agent initialization completed', {
      initTimeMs: agentTime,
      hasWorkflow: !!agentWorkflow,
      hasMcpManager: !!mcpManager,
      mcpClientCount: mcpManager ? mcpManager.getAllClients().length : 0
    });
    
    console.log('Agent initialized successfully');
    
    // Start the API server
    logger.debug('Starting API server phase');
    const serverStartTime = Date.now();
    const port = Number.parseInt(process.env.PORT || '9000');
    
    logger.debug('Server configuration', {
      targetPort: port,
      maxRetries: 10
    });
    
    await startApiServer(port, 10);
    const serverTime = Date.now() - serverStartTime;
    
    const totalTime = Date.now() - startTime;
    logger.debug('Skynet Agent fully initialized and ready', {
      totalTimeMs: totalTime,
      agentInitTimeMs: agentTime,
      serverStartTimeMs: serverTime,
      finalPort: port,
      breakdown: {
        agentInit: agentTime,
        serverStart: serverTime,
        other: totalTime - agentTime - serverTime
      },
      efficiency: {
        initSpeedRating: totalTime < 5000 ? 'fast' : totalTime < 10000 ? 'normal' : 'slow'
      }
    });
    
    console.log('Skynet Agent is ready for interaction');
    console.log(`Server running at http://localhost:${port}`);
  } catch (error) {
    const totalTime = Date.now() - startTime;
    const err = error instanceof Error ? error : new Error(String(error));
    
    logger.error('Failed to initialize agent:', err);
    logger.debug('Main initialization failed', {
      totalTimeMs: totalTime,
      errorType: err.constructor.name,
      errorMessage: err.message,
      processId: process.pid
    });
    
    console.error('Failed to initialize agent:', error);
    process.exit(1);
  }
}

// Run the main function
main().catch(error => {
  const err = error instanceof Error ? error : new Error(String(error));
  logger.error('Unhandled error in main:', err);
  logger.debug('Critical unhandled error', {
    errorType: err.constructor.name,
    errorMessage: err.message,
    stack: err.stack,
    processId: process.pid
  });
  
  console.error('Unhandled error in main:', error);
  process.exit(1);
});

console.log('Starting Skynet Agent server...');
console.log('Press Ctrl+C to stop the server');
