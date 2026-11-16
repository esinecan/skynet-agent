import { ProcessingResult, FileQueueItem } from '../types/ingestion';
import * as fs from 'fs/promises';
import * as path from 'path';

export class ProgressTracker {
  private processedFiles: Set<string> = new Set();
  private manifestPath: string;

  constructor(rootPath: string) {
    this.manifestPath = path.join(rootPath, '.skynet-processed.json');
  }

  async load(): Promise<void> {
    try {
      const content = await fs.readFile(this.manifestPath, 'utf-8');
      const manifest = JSON.parse(content);
      this.processedFiles = new Set(manifest.processedFiles || []);
      console.log(`Loaded ${this.processedFiles.size} previously processed files`);
    } catch {
      console.log('No previous processing manifest found, starting fresh');
    }
  }

  async save(results: ProcessingResult[]): Promise<void> {
    // Add newly processed files
    for (const result of results) {
      if (!result.errors || result.errors.length === 0) {
        this.processedFiles.add(result.file);
      }
    }

    const manifest = {
      version: '1.0',
      lastRun: new Date().toISOString(),
      processedFiles: Array.from(this.processedFiles),
      totalFiles: this.processedFiles.size,
      lastRunStats: {
        filesProcessed: results.length,
        totalSegments: results.reduce((sum, r) => sum + r.segments, 0),
        totalMemories: results.reduce((sum, r) => sum + r.memories.length, 0),
        errors: results.filter(r => r.errors && r.errors.length > 0).length
      }
    };

    await fs.writeFile(this.manifestPath, JSON.stringify(manifest, null, 2));
    console.log(`Saved progress: ${this.processedFiles.size} total files processed`);
  }

  isProcessed(filePath: string): boolean {
    return this.processedFiles.has(filePath);
  }

  filterUnprocessed(files: FileQueueItem[]): FileQueueItem[] {
    return files.filter(f => !this.isProcessed(f.path));
  }
}
