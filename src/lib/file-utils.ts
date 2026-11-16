import * as fs from 'fs/promises';
import * as path from 'path';
import { FileQueueItem } from '../types/ingestion';

export async function buildFileQueue(
  rootPath: string,
  options: {
    recursive?: boolean;
    fileTypes?: string[];
    excludePatterns?: string[];
  }
): Promise<FileQueueItem[]> {
  const queue: FileQueueItem[] = [];
  const excludeRegexes = options.excludePatterns?.map(p => new RegExp(p));

  async function scanDirectory(dirPath: string, baseDir: string) {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      const relativePath = path.relative(baseDir, fullPath);

      // Check exclusions
      if (excludeRegexes?.some(regex => regex.test(relativePath))) {
        continue;
      }

      if (entry.isDirectory() && options.recursive) {
        await scanDirectory(fullPath, baseDir);
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name);
        
        // Check file type filter
        if (options.fileTypes && !options.fileTypes.includes(ext)) {
          continue;
        }

        const stats = await fs.stat(fullPath);
        queue.push({
          path: fullPath,
          relativePath,
          size: stats.size,
          type: ext || 'unknown'
        });
      }
    }
  }

  await scanDirectory(rootPath, rootPath);
  return queue;
}

export async function* readFileInChunks(
  filePath: string,
  chunkSize: number = 100
): AsyncGenerator<{ lines: string[]; startLine: number }, void, unknown> {
  const content = await fs.readFile(filePath, 'utf-8');
  const lines = content.split('\n');
  
  for (let i = 0; i < lines.length; i += chunkSize) {
    yield {
      lines: lines.slice(i, Math.min(i + chunkSize, lines.length)),
      startLine: i + 1
    };
  }
}

export async function saveProcessedFilesList(
  directory: string,
  processedFiles: string[]
): Promise<void> {
  const manifestPath = path.join(directory, '.skynet-processed.json');
  const manifest = {
    version: '1.0',
    lastRun: new Date().toISOString(),
    processedFiles,
    totalFiles: processedFiles.length
  };
  
  await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2));
}

export async function loadProcessedFilesList(
  directory: string
): Promise<string[]> {
  const manifestPath = path.join(directory, '.skynet-processed.json');
  
  try {
    const content = await fs.readFile(manifestPath, 'utf-8');
    const manifest = JSON.parse(content);
    return manifest.processedFiles || [];
  } catch {
    return [];
  }
}
