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

// Check for Google API key
const apiKey = process.env.GOOGLE_API_KEY;
if (!apiKey || apiKey === 'your_gemini_api_key_here') {
 console.log('Please set your GOOGLE_API_KEY in the .env file');
 console.log('Visit https://ai.google.dev/ to obtain a Gemini API key');
 process.exit(1);
  
  // Reload environment variables
  dotenv.config({ path: envPath });
  console.log('Environment updated with API key');
}

// Start the server directly instead of using dynamic import
import { initializeAgent } from './agent';
import { startApiServer } from './server/api';

async function main() {
  console.log('Skynet Agent is initializing...');
  
  try {
    // Initialize the agent and workflow
    const { agentWorkflow, mcpManager } = await initializeAgent();
    console.log('Agent initialized successfully');
    
    // Start the API server
    const port = Number.parseInt(process.env.PORT || '9000');
    await startApiServer(port, 10);
    
    console.log('Skynet Agent is ready for interaction');
    console.log(`Server running at http://localhost:${port}`);
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

console.log('Starting Skynet Agent server...');
console.log('Press Ctrl+C to stop the server');
