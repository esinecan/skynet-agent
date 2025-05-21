import dotenv from 'dotenv';
import { initializeAgent } from './agent';
import { startApiServer } from './server/api';

// Load environment variables
dotenv.config();

// Main function to start everything
async function main() {
  console.log('Skynet Agent is initializing...');
  
  try {
    // Initialize the agent and workflow
    await initializeAgent();
    console.log('Agent initialized successfully');
    
    // Start the API server
    const port = parseInt(process.env.PORT || process.env.API_PORT || '3000');
    await startApiServer(port);
    
    console.log('Skynet Agent is ready for interaction');
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('Failed to initialize agent:', errorMessage);
    process.exit(1);
  }
}

// Run the main function
main().catch(error => {
  const errorMessage = error instanceof Error ? error.message : String(error);
  console.error('Unhandled error in main:', errorMessage);
  process.exit(1);
});
