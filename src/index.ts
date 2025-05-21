/**
 * Updated main entry point with enhanced initialization and error handling
 */

import * as dotenv from 'dotenv';
import * as path from 'path';
import { createLogger } from './utils/logger';
import { setupGlobalErrorHandlers } from './utils/errorHandler';
import { initializeAgent } from './agent';
import { startApiServer } from './server/api';

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
    
    logger.info('Skynet Agent is ready for interaction', {
      port,
      envValid,
      googleApiKey: process.env.GEMINI_API_KEY ? 'configured' : 'missing',
      idleThreshold: process.env.IDLE_THRESHOLD_MINUTES || '10',
      memoryConsolidation: process.env.MEMORY_CONSOLIDATION_SCHEDULE || '0 2 * * *'
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error('Failed to initialize agent:', error);
    process.exit(1);
  }
}

// Run the main function
main().catch(error => {
  const errorMessage = error instanceof Error ? error.message : String(error);
  logger.error('Unhandled error in main:', error);
  process.exit(1);
});
