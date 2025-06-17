#!/usr/bin/env node

/**
 * Migration script to convert ISO string timestamps to numeric timestamps in ChromaDB
 */
import { getMemoryStore } from '../lib/memory-store';

async function main() {
  console.log('Starting timestamp migration');
  
  const memoryStore = getMemoryStore();
  await memoryStore.initialize();
  
  try {
    await memoryStore.migrateTimestamps();
    console.log('Migration completed successfully');
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  }
}

main().catch(console.error);
