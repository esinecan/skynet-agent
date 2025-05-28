/**
 * Updated main entry point with enhanced initialization and error handling
 */

// IMPORTANT: Make sure to import `instrument.ts` at the very top of your file.
import "./instrument"; // This executes Sentry.init()

import * as Sentry from "@sentry/node";
import * as dotenv from 'dotenv';
import * as path from 'node:path';
import { createLogger } from './utils/logger';
import { setupGlobalErrorHandlers } from './utils/errorHandler';
import { initializeAgent } from './agent';
import { memoryManager } from './memory'; // Add this import
import { startApiServer } from './server/api';
import { loadMcpServerConfigs } from './utils/configLoader';
import * as fs from 'node:fs';

// Parse command-line arguments
const args = process.argv.slice(2);
const enableGUI = args.includes('--gui');

// Load environment variables early
const envPath = path.resolve(process.cwd(), '.env');
dotenv.config({ path: envPath });

// Initialize logger
const logger = createLogger('main');

// Set up global error handlers
setupGlobalErrorHandlers();

// Check for required environment variables
function checkEnvironment(): boolean {
  const startTime = Date.now();
  logger.info('Checking environment configuration...');
  logger.debug('Starting environment validation', {
    nodeVersion: process.version,
    platform: process.platform,
    cwd: process.cwd(),
    processId: process.pid
  });
  
  const requiredVars = ['GOOGLE_API_KEY'];
  const missingVars = requiredVars.filter(varName => !process.env[varName] || process.env[varName] === `your_${varName.toLowerCase()}_here`);
  
  logger.debug('Environment variable check', {
    requiredVars,
    missingVars,
    availableVars: requiredVars.filter(v => !missingVars.includes(v))
  });
  
  if (missingVars.length > 0) {
    logger.warn(`Missing or invalid environment variables: ${missingVars.join(', ')}`);
    logger.info('The system will run in limited functionality mode');
    logger.debug('Environment validation completed with warnings', {
      checkTimeMs: Date.now() - startTime,
      missingCount: missingVars.length,
      status: 'limited'
    });
    return false;
  }
  
  // Check for MCP configuration
  const configJsonPath = path.resolve(process.cwd(), 'config.json');
  const hasConfigJson = fs.existsSync(configJsonPath) && fs.statSync(configJsonPath).size > 0;
  const hasMcpEnvConfig = !!process.env.SKYNET_MCP_SERVERS_JSON;
  
  logger.debug('MCP configuration check', {
    configJsonPath,
    hasConfigJson,
    hasMcpEnvConfig,
    configFileSize: hasConfigJson ? fs.statSync(configJsonPath).size : 0
  });
  
  if (!hasConfigJson && !hasMcpEnvConfig) {
    logger.info('No MCP configuration found in config.json or SKYNET_MCP_SERVERS_JSON. Using defaults.');
  } else {
    logger.info(`MCP configuration found: ${hasConfigJson ? 'config.json' : 'SKYNET_MCP_SERVERS_JSON'}`);
  }
  
  const checkTime = Date.now() - startTime;
  logger.debug('Environment validation completed successfully', {
    checkTimeMs: checkTime,
    status: 'valid',
    mcpConfigAvailable: hasConfigJson || hasMcpEnvConfig
  });
  
  logger.info('Environment configuration validated');
  return true;
}

// Main function to start everything
async function main() {
  const startTime = Date.now();
  logger.info('Skynet Agent is initializing...');
  
  logger.debug('Main initialization started', {
    enableGUI,
    nodeEnv: process.env.NODE_ENV,
    arguments: args,
    memoryUsage: process.memoryUsage()
  });
  
  // Check environment
  Sentry.addBreadcrumb({ category: 'init', message: 'Starting environment check', level: 'info' });
  const envCheckStartTime = Date.now();
  const envValid = checkEnvironment();
  const envCheckTime = Date.now() - envCheckStartTime;
  
  logger.debug('Environment check completed', {
    envValid,
    checkTimeMs: envCheckTime
  });
  
  Sentry.setTag("env_valid", envValid);
  
  try {
    // Initialize the agent and workflow
    logger.debug('Starting agent initialization phase');
    const agentStartTime = Date.now();
    
    const { agentWorkflow, mcpManager } = await initializeAgent();
    const agentTime = Date.now() - agentStartTime;
    
    logger.debug('Agent initialization completed', {
      initTimeMs: agentTime,
      workflowAvailable: !!agentWorkflow,
      mcpAvailable: !!mcpManager,
      mcpClientCount: mcpManager ? mcpManager.getAllClients().length : 0
    });
    
    logger.info('Agent initialized successfully', {
      workflowAvailable: !!agentWorkflow,
      mcpAvailable: !!mcpManager
    });
    Sentry.addBreadcrumb({ category: 'init', message: 'Agent initialized', level: 'info', data: { workflowAvailable: !!agentWorkflow, mcpAvailable: !!mcpManager } });
    
    // Start the API server - use a higher port number
    logger.debug('Starting API server phase');
    const serverStartTime = Date.now();
    const port = Number.parseInt(process.env.PORT || process.env.API_PORT || '9000');
    
    logger.debug('Server configuration', {
      targetPort: port,
      maxRetries: 10,
      guiMode: enableGUI
    });
    
    await startApiServer(port, 10); // Increase retries to 10
    const serverTime = Date.now() - serverStartTime;
    
    logger.debug('API server started successfully', {
      startTimeMs: serverTime,
      finalPort: port
    });
    
    Sentry.setTag("server_port", port);
    
    // If GUI mode is enabled, open the browser
    if (enableGUI) {
      const guiStartTime = Date.now();
      const url = `http://localhost:${port}`;
      logger.info(`GUI mode enabled, access Skynet at ${url}`);
      
      logger.debug('Attempting to open browser for GUI mode', {
        url,
        platform: process.platform
      });
      
      // Try to open the browser if running in a desktop environment
      try {
        const { default: open } = await import('open');
        await open(url);
        const guiTime = Date.now() - guiStartTime;
        
        logger.debug('Browser opened successfully', {
          openTimeMs: guiTime,
          url
        });
      } catch (error) {
        const guiTime = Date.now() - guiStartTime;
        const err = error instanceof Error ? error : new Error(String(error));
        logger.debug('Browser auto-open failed', {
          openTimeMs: guiTime,
          errorType: err.constructor.name,
          errorMessage: err.message,
          url
        });
        
        logger.info(`Browser auto-open not available. Please navigate to ${url} manually.`);
      }
    }
    
    // Test memory system
    logger.debug('Starting memory system test');
    const memoryTestStartTime = Date.now();
    logger.info('Testing memory system...');
    
    try {
      const memoryTestResult = await memoryManager.testMemorySystem();
      const memoryTestTime = Date.now() - memoryTestStartTime;
      
      logger.debug('Memory system test completed', {
        testTimeMs: memoryTestTime,
        testResult: memoryTestResult,
        testPassed: !!memoryTestResult
      });
      
      if (memoryTestResult) {
        logger.info('✅ Memory system test passed');
      } else {
        logger.warn('⚠️ Memory system test failed');
      }
    } catch (error) {
      const memoryTestTime = Date.now() - memoryTestStartTime;
      const err = error instanceof Error ? error : new Error(String(error));
      
      logger.debug('Memory system test failed with error', {
        testTimeMs: memoryTestTime,
        errorType: err.constructor.name,
        errorMessage: err.message
      });
      
      logger.error('Error testing memory system', err);
    }
    
    const totalTime = Date.now() - startTime;
    logger.debug('Skynet Agent fully initialized and operational', {
      totalTimeMs: totalTime,
      envCheckTimeMs: envCheckTime,
      agentInitTimeMs: agentTime,
      serverStartTimeMs: serverTime,
      breakdown: {
        envCheck: envCheckTime,
        agentInit: agentTime,
        serverStart: serverTime,
        other: totalTime - envCheckTime - agentTime - serverTime
      },
      finalConfiguration: {
        port,
        guiMode: enableGUI,
        envValid,
        mcpClientCount: mcpManager ? mcpManager.getAllClients().length : 0
      },
      performance: {
        initSpeedRating: totalTime < 5000 ? 'fast' : totalTime < 10000 ? 'normal' : 'slow',
        memoryUsage: process.memoryUsage()
      }
    });
    
    logger.info('Skynet Agent is ready for interaction', {
      port,
      guiMode: enableGUI,
      envValid,
      googleApiKey: process.env.GOOGLE_API_KEY ? 'configured' : 'missing',
      idleThreshold: process.env.IDLE_THRESHOLD_MINUTES || '10',
      memoryConsolidation: process.env.MEMORY_CONSOLIDATION_SCHEDULE || '0 2 * * *'
    });
  } catch (error) {
    const totalTime = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : String(error);
    const err = error instanceof Error ? error : new Error(String(error));
    
    logger.debug('Main initialization failed', {
      totalTimeMs: totalTime,
      errorType: err.constructor.name,
      errorMessage: err.message,
      stack: err.stack
    });
    
    logger.error('Failed to initialize agent:', err);
    Sentry.captureException(err, { tags: { context: 'agent_initialization' } });
    process.exit(1);
  }
}

// Run the main function
(async () => {
  await main().catch(error => {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error('Unhandled error in main:', error);
    Sentry.captureException(error, { tags: { context: 'main_execution_catch' } });
    process.exit(1);
  });
})();
