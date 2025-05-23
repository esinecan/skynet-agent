/**
 * Updated main entry point with enhanced initialization and error handling
 */

import * as dotenv from 'dotenv';
import * as path from 'path';
import { createLogger } from './utils/logger';
import { setupGlobalErrorHandlers } from './utils/errorHandler';
import { initializeAgent } from './agent';
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
  logger.info('Checking environment configuration...');
  
  const requiredVars = ['GEMINI_API_KEY'];
  const missingVars = requiredVars.filter(varName => !process.env[varName] || process.env[varName] === `your_${varName.toLowerCase()}_here`);
  
  if (missingVars.length > 0) {
    logger.warn(`Missing or invalid environment variables: ${missingVars.join(', ')}`);
    logger.info('The system will run in limited functionality mode');
    return false;
  }
  
  // Check for MCP configuration
  const configJsonPath = path.resolve(process.cwd(), 'config.json');
  const hasConfigJson = fs.existsSync(configJsonPath) && fs.statSync(configJsonPath).size > 0;
  const hasMcpEnvConfig = !!process.env.SKYNET_MCP_SERVERS_JSON;
  
  if (!hasConfigJson && !hasMcpEnvConfig) {
    logger.info('No MCP configuration found in config.json or SKYNET_MCP_SERVERS_JSON. Using defaults.');
  } else {
    logger.info(`MCP configuration found: ${hasConfigJson ? 'config.json' : 'SKYNET_MCP_SERVERS_JSON'}`);
  }
  
  logger.info('Environment configuration validated');
  return true;
}

// Main function to start everything
async function main() {
  logger.info('Skynet Agent is initializing...');
  
  // Check environment
  const envValid = checkEnvironment();
  
  try {
    // Initialize the agent and workflow
    const { agentWorkflow, mcpManager } = await initializeAgent();
    logger.info('Agent initialized successfully', {
      workflowAvailable: !!agentWorkflow,
      mcpAvailable: !!mcpManager
    });
      // Start the API server - use a higher port number
    const port = Number.parseInt(process.env.PORT || process.env.API_PORT || '9000');
    await startApiServer(port, 10); // Increase retries to 10
    
    // If GUI mode is enabled, open the browser
    if (enableGUI) {
      const url = `http://localhost:${port}`;
      logger.info(`GUI mode enabled, access Skynet at ${url}`);
      
      // Try to open the browser if running in a desktop environment
      try {
        const { default: open } = await import('open');
        await open(url);
      } catch (error) {
        logger.info(`Browser auto-open not available. Please navigate to ${url} manually.`);
      }
    }
    
    logger.info('Skynet Agent is ready for interaction', {
      port,
      guiMode: enableGUI,
      envValid,
      googleApiKey: process.env.GEMINI_API_KEY ? 'configured' : 'missing',
      idleThreshold: process.env.IDLE_THRESHOLD_MINUTES || '10',
      memoryConsolidation: process.env.MEMORY_CONSOLIDATION_SCHEDULE || '0 2 * * *'
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const err = error instanceof Error ? error : new Error(String(error));
    logger.error('Failed to initialize agent:', err);
    process.exit(1);
  }
}

// Run the main function
main().catch(error => {
  const errorMessage = error instanceof Error ? error.message : String(error);
  logger.error('Unhandled error in main:', error);
  process.exit(1);
});
