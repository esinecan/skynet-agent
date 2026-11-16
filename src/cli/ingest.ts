#!/usr/bin/env node

import 'dotenv/config';
import { Command } from 'commander';
import { buildFileQueue } from '../lib/file-utils';
import { FileProcessor } from './file-processor';
import { ProgressTracker } from './progress-tracker';
import { IngestionOptions } from '../types/ingestion';
import * as path from 'path';
import * as fs from 'fs/promises';

const program = new Command();

program
  .name('skynet-ingest')
  .description('Ingest files into Skynet Agent conscious memory')
  .version('1.0.0');

program
  .command('process <path>')
  .description('Process files in the specified path')
  .option('-r, --recursive', 'Process subdirectories recursively', true)
  .option('-p, --parallel', 'Enable parallel processing', false)
  .option('-c, --concurrency <number>', 'Max concurrent file processing', '3')
  .option('--context-reset <type>', 'Context reset strategy: memory|document', 'memory')
  .option('-d, --database <n>', 'Database name for personality', 'default')
  .option('-i, --incremental', 'Only process new files', true)
  .option('-t, --types <extensions...>', 'File types to process (e.g., .ts .js)')
  .option('-e, --exclude <patterns...>', 'Exclude patterns (regex)')
  .option('--dry-run', 'Show what would be processed without actually processing')
  .action(async (targetPath: string, options) => {
    try {
      const absolutePath = path.resolve(targetPath);
      
      // Verify path exists
      const stats = await fs.stat(absolutePath);
      if (!stats.isDirectory()) {
        console.error('Error: Path must be a directory');
        process.exit(1);
      }

      console.log(`\n🚀 Skynet Agent File Ingestion Service`);
      console.log(`📁 Target: ${absolutePath}`);
      console.log(`⚙️  Options:`);
      console.log(`   - Recursive: ${options.recursive}`);
      console.log(`   - Parallel: ${options.parallel}`);
      console.log(`   - Context Reset: ${options.contextReset}`);
      console.log(`   - Database: ${options.database}`);
      console.log(`   - Incremental: ${options.incremental}\n`);

      // Build file queue
      console.log('🔍 Scanning for files...');
      const allFiles = await buildFileQueue(absolutePath, {
        recursive: options.recursive,
        fileTypes: options.types,
        excludePatterns: options.exclude || [
          'node_modules',
          '\\.git',
          '\\.next',
          'dist',
          'build',
          '\\.skynet-processed\\.json'
        ]
      });

      console.log(`📊 Found ${allFiles.length} files`);

      // Load progress if incremental
      let filesToProcess = allFiles;
      if (options.incremental) {
        const tracker = new ProgressTracker(absolutePath);
        await tracker.load();
        filesToProcess = tracker.filterUnprocessed(allFiles);
        console.log(`📈 ${filesToProcess.length} new files to process`);
      }

      if (filesToProcess.length === 0) {
        console.log('✅ All files already processed!');
        return;
      }

      // Dry run check
      if (options.dryRun) {
        console.log('\n🏃 DRY RUN - Files that would be processed:');
        filesToProcess.forEach(f => console.log(`   - ${f.relativePath}`));
        return;
      }

      // Process files
      console.log('\n🏭 Starting file processing...\n');
      const processor = new FileProcessor();
      const startTime = Date.now();

      const results = await processor.processQueue(filesToProcess, {
        path: absolutePath,
        recursive: options.recursive,
        parallel: options.parallel,
        contextReset: options.contextReset as 'memory' | 'document',
        databaseName: options.database,
        incremental: options.incremental,
        fileTypes: options.types,
        excludePatterns: options.exclude,
        maxConcurrency: parseInt(options.concurrency)
      });

      // Save progress
      if (options.incremental) {
        const tracker = new ProgressTracker(absolutePath);
        await tracker.save(results);
      }

      // Summary
      const totalTime = (Date.now() - startTime) / 1000;
      const successCount = results.filter(r => !r.errors || r.errors.length === 0).length;
      const errorCount = results.length - successCount;
      const totalSegments = results.reduce((sum, r) => sum + r.segments, 0);
      const totalMemories = results.reduce((sum, r) => sum + r.memories.length, 0);

      console.log('\n📊 Ingestion Complete!');
      console.log(`⏱️  Total time: ${totalTime.toFixed(2)}s`);
      console.log(`✅ Files processed: ${successCount}`);
      console.log(`❌ Files with errors: ${errorCount}`);
      console.log(`📝 Total segments: ${totalSegments}`);
      console.log(`🧠 Total memories created: ${totalMemories}`);
      console.log(`💾 Database: ${options.database}`);

      if (errorCount > 0) {
        console.log('\n❌ Errors:');
        results.filter(r => r.errors && r.errors.length > 0).forEach(r => {
          console.log(`   - ${r.file}: ${r.errors!.join(', ')}`);
        });
      }

    } catch (error) {
      console.error('Fatal error:', error);
      process.exit(1);
    }
  });

program
  .command('stats <path>')
  .description('Show statistics for a previously processed directory')
  .action(async (targetPath: string) => {
    try {
      const absolutePath = path.resolve(targetPath);
      const manifestPath = path.join(absolutePath, '.skynet-processed.json');
      
      const content = await fs.readFile(manifestPath, 'utf-8');
      const manifest = JSON.parse(content);
      
      console.log('\n📊 Ingestion Statistics');
      console.log(`📁 Directory: ${absolutePath}`);
      console.log(`📅 Last run: ${manifest.lastRun}`);
      console.log(`📄 Total files processed: ${manifest.totalFiles}`);
      
      if (manifest.lastRunStats) {
        console.log('\n📈 Last Run Stats:');
        console.log(`   - Files: ${manifest.lastRunStats.filesProcessed}`);
        console.log(`   - Segments: ${manifest.lastRunStats.totalSegments}`);
        console.log(`   - Memories: ${manifest.lastRunStats.totalMemories}`);
        console.log(`   - Errors: ${manifest.lastRunStats.errors}`);
      }
    } catch (error) {
      console.error('No ingestion data found for this directory');
    }
  });

program
  .command('reset <path>')
  .description('Reset processing history for a directory')
  .action(async (targetPath: string) => {
    try {
      const absolutePath = path.resolve(targetPath);
      const manifestPath = path.join(absolutePath, '.skynet-processed.json');
      
      await fs.unlink(manifestPath);
      console.log('✅ Processing history reset');
    } catch (error) {
      console.error('No processing history to reset');
    }
  });

program.parse();
