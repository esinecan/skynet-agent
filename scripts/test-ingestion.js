#!/usr/bin/env node

/**
 * Test script for the ingestion service
 * This script tests the ingestion of files into conscious memory
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs').promises;

async function runCommand(command, args) {
  return new Promise((resolve, reject) => {
    console.log(`\n📍 Running: ${command} ${args.join(' ')}`);
    
    const proc = spawn(command, args, {
      stdio: 'inherit',
      shell: true,
      cwd: path.join(__dirname, '..')
    });
    
    proc.on('close', (code) => {
      if (code === 0) {
        resolve(code);
      } else {
        reject(new Error(`Command failed with code ${code}`));
      }
    });
    
    proc.on('error', (err) => {
      reject(err);
    });
  });
}

async function createTestFiles() {
  const testDir = path.join(__dirname, '..', 'test-ingestion');
  
  // Create test directory if it doesn't exist
  await fs.mkdir(testDir, { recursive: true });
  
  // Create multiple test files
  const files = [
    {
      name: 'math-utils.ts',
      content: `// Math utility functions
export function fibonacci(n: number): number {
  if (n <= 1) return n;
  return fibonacci(n - 1) + fibonacci(n - 2);
}

export function factorial(n: number): number {
  if (n <= 1) return 1;
  return n * factorial(n - 1);
}

export function isPrime(n: number): boolean {
  if (n <= 1) return false;
  if (n <= 3) return true;
  if (n % 2 === 0 || n % 3 === 0) return false;
  
  let i = 5;
  while (i * i <= n) {
    if (n % i === 0 || n % (i + 2) === 0) return false;
    i += 6;
  }
  return true;
}`
    },
    {
      name: 'README.md',
      content: `# Test Project

This is a test project for the Skynet Agent ingestion service.

## Features

- Math utilities
- String processing
- Data structures

## Usage

Import the functions you need:

\`\`\`typescript
import { fibonacci, factorial } from './math-utils';
\`\`\`

## Testing

The ingestion service will process these files and store them as memories.`
    },
    {
      name: 'config.json',
      content: JSON.stringify({
        name: 'test-project',
        version: '1.0.0',
        description: 'Test project for ingestion',
        features: {
          math: true,
          strings: true,
          data: true
        },
        settings: {
          maxMemory: 1024,
          timeout: 5000
        }
      }, null, 2)
    }
  ];
  
  // Write all test files
  for (const file of files) {
    const filePath = path.join(testDir, file.name);
    await fs.writeFile(filePath, file.content);
    console.log(`✅ Created test file: ${file.name}`);
  }
  
  return testDir;
}

async function main() {
  console.log('🧪 Skynet Agent Ingestion Service Test\n');
  
  try {
    // Step 1: Create test files
    console.log('📝 Creating test files...');
    const testDir = await createTestFiles();
    
    // Step 2: Reset any previous ingestion
    console.log('\n🔄 Resetting previous ingestion history...');
    try {
      await runCommand('npx', ['tsx', 'src/cli/ingest.ts', 'reset', testDir]);
    } catch {
      console.log('No previous history to reset');
    }
    
    // Step 3: Run dry-run first
    console.log('\n🏃 Running dry-run...');
    await runCommand('npx', ['tsx', 'src/cli/ingest.ts', 'process', testDir, '--dry-run']);
    
    // Step 4: Check stats (should be empty)
    console.log('\n📊 Checking stats (should be empty)...');
    try {
      await runCommand('npx', ['tsx', 'src/cli/ingest.ts', 'stats', testDir]);
    } catch {
      console.log('No stats available yet (as expected)');
    }
    
    // Step 5: Run actual ingestion
    console.log('\n🚀 Running actual ingestion...');
    console.log('⚠️  Note: This will create memories in your database\n');
    
    // Give user a chance to cancel
    await new Promise(resolve => {
      console.log('Press Ctrl+C to cancel, or wait 3 seconds to continue...');
      setTimeout(resolve, 3000);
    });
    
    await runCommand('npx', ['tsx', 'src/cli/ingest.ts', 'process', testDir, 
      '--database', 'test_ingestion',
      '--types', '.ts', '.md', '.json'
    ]);
    
    // Step 6: Check stats after ingestion
    console.log('\n📊 Checking stats after ingestion...');
    await runCommand('npx', ['tsx', 'src/cli/ingest.ts', 'stats', testDir]);
    
    // Step 7: Test incremental run (should process 0 files)
    console.log('\n🔄 Testing incremental run (should process 0 files)...');
    await runCommand('npx', ['tsx', 'src/cli/ingest.ts', 'process', testDir, 
      '--database', 'test_ingestion'
    ]);
    
    console.log('\n✅ All tests completed successfully!');
    console.log('\n💡 Tips:');
    console.log('- Check the conscious memory UI to see the ingested memories');
    console.log('- Use different database names to create separate knowledge bases');
    console.log('- Run with --parallel for faster processing of large codebases');
    
  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    process.exit(1);
  }
}

// Run the test
main().catch(console.error);
