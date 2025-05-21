import { initializeAgent } from './agent'; // This already loads the environment
import { startApiServer } from './server/api';

// Main function to start everything
async function main() {
  console.log('Skynet Agent is initializing...');
  
  try {
    // Initialize the agent and workflow
    await initializeAgent();
    console.log('Agent initialized successfully');
    
    // Start the API server - use a higher port number
    const port = Number.parseInt(process.env.PORT || process.env.API_PORT || '9000');
    await startApiServer(port, 10); // Increase retries to 10
    
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
