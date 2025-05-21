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
    const port = parseInt(process.env.API_PORT || '3000');
    startApiServer(port);
    console.log(`API server started on port ${port}`);
    
    console.log('Skynet Agent is ready for interaction');
  } catch (error) {
    console.error('Failed to initialize agent:', error);
    process.exit(1);
  }
}

// Run the main function
main().catch(error => {
  console.error('Unhandled error in main:', error);
  process.exit(1);
});
