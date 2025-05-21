/**
 * Test script for Skynet Agent core functionality
 * Tests basic query processing, memory operations, and health endpoints
 */

import * as dotenv from 'dotenv';
import * as path from 'path';
import axios from 'axios';

// Load environment variables
const envPath = path.resolve(process.cwd(), '.env');
dotenv.config({ path: envPath });

// Configuration
const API_URL = process.env.TEST_API_URL || 'http://localhost:9000';
const GOOGLE_API_KEY = process.env.GEMINI_API_KEY || 'AIzaSyD5tYYm39l3vd740ZswbreAckS5boLzYuY';

// Update .env file with the provided Google API key
async function updateEnvFile() {
  const fs = require('fs');
  
  try {
    // Create .env file if it doesn't exist
    if (!fs.existsSync('.env')) {
      fs.copyFileSync('.env.example', '.env');
      console.log('Created .env file from .env.example');
    }
    
    // Read current .env content
    let envContent = fs.readFileSync('.env', 'utf8');
    
    // Update or add GEMINI_API_KEY
    if (envContent.includes('GEMINI_API_KEY=')) {
      envContent = envContent.replace(/GEMINI_API_KEY=.*/, `GEMINI_API_KEY=${GOOGLE_API_KEY}`);
    } else {
      envContent += `\nGEMINI_API_KEY=${GOOGLE_API_KEY}\n`;
    }
    
    // Write updated content back to .env
    fs.writeFileSync('.env', envContent);
    console.log('Updated .env file with Google API key');
  } catch (error) {
    console.error('Error updating .env file:', error);
    throw error;
  }
}

// Test basic query functionality
async function testBasicQuery() {
  console.log('\n--- Testing Basic Query ---');
  try {
    const response = await axios.post(`${API_URL}/query`, {
      query: 'Hello, what can you do?',
      sessionId: 'test-session'
    });
    
    console.log('Query response received:');
    console.log(`Length: ${response.data.response.length} characters`);
    console.log(`Preview: ${response.data.response.substring(0, 100)}...`);
    
    return true;
  } catch (error) {
    console.error('Error testing basic query:', error.response?.data || error.message);
    return false;
  }
}

// Test health endpoint
async function testHealthEndpoint() {
  console.log('\n--- Testing Health Endpoint ---');
  try {
    const response = await axios.get(`${API_URL}/health`);
    
    console.log('Health status:', response.data.status);
    console.log('Uptime:', response.data.uptime, 'seconds');
    console.log('Message:', response.data.message);
    
    return true;
  } catch (error) {
    console.error('Error testing health endpoint:', error.response?.data || error.message);
    return false;
  }
}

// Test detailed health report
async function testHealthReport() {
  console.log('\n--- Testing Detailed Health Report ---');
  try {
    const response = await axios.get(`${API_URL}/health/report`);
    
    console.log('Overall status:', response.data.status);
    console.log('Components:', Object.keys(response.data.components).join(', '));
    console.log('Metrics:', {
      requestsProcessed: response.data.metrics.requestsProcessed,
      llmCallsMade: response.data.metrics.llmCallsMade,
      toolCallsMade: response.data.metrics.toolCallsMade
    });
    
    return true;
  } catch (error) {
    console.error('Error testing health report:', error.response?.data || error.message);
    return false;
  }
}

// Test memory status
async function testMemoryStatus() {
  console.log('\n--- Testing Memory Status ---');
  try {
    const response = await axios.get(`${API_URL}/memory/status`);
    
    console.log('Memory count:', response.data.memoryCount);
    console.log('Consolidation status:', {
      isRunning: response.data.consolidation.isRunning,
      lastRun: response.data.consolidation.lastRun,
      schedule: response.data.consolidation.schedule
    });
    
    return true;
  } catch (error) {
    console.error('Error testing memory status:', error.response?.data || error.message);
    return false;
  }
}

// Test intrinsic motivation status
async function testIntrinsicMotivationStatus() {
  console.log('\n--- Testing Intrinsic Motivation Status ---');
  try {
    const response = await axios.get(`${API_URL}/intrinsic/status`);
    
    console.log('Task running:', response.data.status.isTaskRunning);
    console.log('Idle time:', response.data.status.idleTimeMinutes.toFixed(2), 'minutes');
    console.log('Recent task count:', response.data.status.recentTaskCount);
    
    return true;
  } catch (error) {
    console.error('Error testing intrinsic motivation status:', error.response?.data || error.message);
    return false;
  }
}

// Test memory operations by making queries that should be remembered
async function testMemoryOperations() {
  console.log('\n--- Testing Memory Operations ---');
  try {
    // Make a query that should be stored in memory
    console.log('Making first query to store in memory...');
    await axios.post(`${API_URL}/query`, {
      query: 'My favorite color is blue. Remember this fact about me.',
      sessionId: 'memory-test'
    });
    
    // Wait a moment for processing
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Make a follow-up query that should retrieve from memory
    console.log('Making follow-up query to test memory retrieval...');
    const response = await axios.post(`${API_URL}/query`, {
      query: 'What is my favorite color?',
      sessionId: 'memory-test'
    });
    
    console.log('Follow-up response:');
    console.log(`Length: ${response.data.response.length} characters`);
    console.log(`Preview: ${response.data.response.substring(0, 100)}...`);
    
    // Check if "blue" is mentioned in the response
    const mentionsBlue = response.data.response.toLowerCase().includes('blue');
    console.log('Response mentions "blue":', mentionsBlue);
    
    return mentionsBlue;
  } catch (error) {
    console.error('Error testing memory operations:', error.response?.data || error.message);
    return false;
  }
}

// Test error handling with invalid input
async function testErrorHandling() {
  console.log('\n--- Testing Error Handling ---');
  try {
    // Test with empty query (should return 400)
    const response = await axios.post(`${API_URL}/query`, {
      query: '',
      sessionId: 'error-test'
    });
    
    console.log('Unexpected success with empty query');
    return false;
  } catch (error) {
    if (error.response && error.response.status === 400) {
      console.log('Correctly received 400 error for empty query');
      console.log('Error message:', error.response.data.error);
      return true;
    } else {
      console.error('Unexpected error:', error.response?.data || error.message);
      return false;
    }
  }
}

// Run all tests
async function runTests() {
  console.log('Starting Skynet Agent tests...');
  console.log(`API URL: ${API_URL}`);
  
  try {
    // Update .env file with Google API key
    await updateEnvFile();
    
    // Wait for server to be ready
    console.log('Waiting for server to be ready...');
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    // Run tests
    const results = {
      basicQuery: await testBasicQuery(),
      healthEndpoint: await testHealthEndpoint(),
      healthReport: await testHealthReport(),
      memoryStatus: await testMemoryStatus(),
      intrinsicMotivation: await testIntrinsicMotivationStatus(),
      memoryOperations: await testMemoryOperations(),
      errorHandling: await testErrorHandling()
    };
    
    // Summarize results
    console.log('\n--- Test Results Summary ---');
    for (const [test, passed] of Object.entries(results)) {
      console.log(`${test}: ${passed ? 'PASSED' : 'FAILED'}`);
    }
    
    const passedCount = Object.values(results).filter(Boolean).length;
    const totalCount = Object.values(results).length;
    
    console.log(`\nOverall: ${passedCount}/${totalCount} tests passed`);
    
    return passedCount === totalCount;
  } catch (error) {
    console.error('Error running tests:', error);
    return false;
  }
}

// Run tests if this file is executed directly
if (require.main === module) {
  runTests()
    .then(success => {
      process.exit(success ? 0 : 1);
    })
    .catch(error => {
      console.error('Unhandled error:', error);
      process.exit(1);
    });
}

export { runTests };
