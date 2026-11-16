#!/usr/bin/env node

import { spawn } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';

/**
 * Parallel ingestion script for large codebases
 * Usage: node parallel-ingest.js /path/to/project
 */

const projectPath = process.argv[2];
if (!projectPath) {
  console.error('Usage: node parallel-ingest.js /path/to/project');
  process.exit(1);
}

const SUBFOLDERS = ['src', 'lib', 'components', 'pages', 'utils', 'api', 'services'];
const processes: any[] = [];

async function processFolder(folder: string) {
  const fullPath = path.join(projectPath, folder);
  const dbName = `skynet_${folder.replace(/\//g, '_')}`;
  
  if (!fs.existsSync(fullPath)) {
    console.log(`Skipping ${folder} - directory not found`);
    return;
  }
  
  console.log(`Starting ingestion for ${folder} with database ${dbName}`);
  
  const proc = spawn('npx', [
    'tsx',
    'src/cli/ingest.ts',
    'process',
    fullPath,
    '--database', dbName,
    '--recursive',
    '--parallel',
    '--concurrency', '5'
  ], {
    stdio: 'inherit',
    shell: true
  });
  
  processes.push({
    folder,
    process: proc,
    promise: new Promise((resolve, reject) => {
      proc.on('close', (code) => {
        if (code === 0) {
          console.log(`✓ Completed ingestion for ${folder}`);
          resolve(code);
        } else {
          console.error(`✗ Failed ingestion for ${folder} with code ${code}`);
          reject(new Error(`Process exited with code ${code}`));
        }
      });
      
      proc.on('error', (err) => {
        console.error(`Error in ${folder}:`, err);
        reject(err);
      });
    })
  });
}

async function main() {
  console.log(`🚀 Starting parallel ingestion for ${projectPath}`);
  console.log(`📁 Folders to process: ${SUBFOLDERS.join(', ')}`);
  console.log('');
  
  // Start all processes
  for (const folder of SUBFOLDERS) {
    await processFolder(folder);
  }
  
  // Wait for all processes to complete
  console.log('\n⏳ Waiting for all ingestion processes to complete...\n');
  
  try {
    await Promise.all(processes.map(p => p.promise));
    console.log('\n✅ All ingestion processes completed successfully!');
  } catch (error) {
    console.error('\n❌ Some ingestion processes failed:', error);
    process.exit(1);
  }
}

main().catch(console.error);
