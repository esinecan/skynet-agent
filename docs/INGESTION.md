# Skynet Agent Ingestion Service

The ingestion service allows you to process large codebases and documents into the Skynet Agent's conscious memory system. It intelligently segments files into meaningful chunks and stores them as searchable memories.

## Features

- **Intelligent Segmentation**: Uses LLM-powered analysis to detect complete functions, classes, and logical units
- **Multiple File Type Support**: Handles TypeScript, JavaScript, Python, Markdown, JSON, and text files
- **Incremental Processing**: Only processes new files on subsequent runs
- **Parallel Processing**: Process multiple files concurrently for faster ingestion
- **Context Management**: Options for memory or document-level context reset
- **Progress Tracking**: Saves progress and allows resuming interrupted ingestion

## Installation

The ingestion service is included with the Skynet Agent. Ensure you have:

1. Installed all dependencies:
   ```bash
   npm install --legacy-peer-deps
   ```

2. Set up your environment variables in `.env.local`:
   ```env
   # Ingestion Configuration
   INGESTION_LLM_PROVIDER=google
   INGESTION_LLM_MODEL=gemini-2.5-flash-preview-05-20
   INGESTION_MAX_TOKENS=1000
   INGESTION_TEMPERATURE=0.1
   ```

## Usage

### Basic Usage

Process a single directory:
```bash
npm run ingest process ./src
```

Process recursively with specific file types:
```bash
npm run ingest process ./project -- --types .ts .tsx .js --recursive
```

### Advanced Options

```bash
npm run ingest process <path> [options]

Options:
  -r, --recursive              Process subdirectories recursively (default: true)
  -p, --parallel              Enable parallel processing (default: false)
  -c, --concurrency <number>  Max concurrent file processing (default: 3)
  --context-reset <type>      Context reset strategy: memory|document (default: memory)
  -d, --database <n>       Database name for personality (default: default)
  -i, --incremental           Only process new files (default: true)
  -t, --types <extensions...> File types to process (e.g., .ts .js)
  -e, --exclude <patterns...> Exclude patterns (regex)
  --dry-run                   Show what would be processed without processing
```

### Examples

#### Parallel Processing
```bash
npm run ingest process ./project -- --parallel --concurrency 5
```

#### Custom Database for Different Projects
```bash
npm run ingest process ./react-app -- --database react_expert
npm run ingest process ./python-ml -- --database ml_expert
```

#### Dry Run
```bash
npm run ingest process ./project -- --dry-run
```

#### Process Everything Fresh
```bash
npm run ingest reset ./project
npm run ingest process ./project -- --incremental false
```

### View Statistics
```bash
npm run ingest stats ./project
```

### Reset Processing History
```bash
npm run ingest reset ./project
```

## Parallel Processing for Large Codebases

For very large codebases, use the parallel ingestion script:

```bash
node scripts/parallel-ingest.js /path/to/large/project
```

This will process different subdirectories in parallel with separate databases.

## File Type Mappings

The ingestion service uses different strategies for different file types:

- **TypeScript/JavaScript**: Detects functions, classes, and exports
- **Python**: Detects functions, classes, and async functions
- **Markdown**: Splits by headers and sections
- **JSON**: Preserves structure with semantic analysis
- **Text**: Splits by paragraphs
- **Default**: Fixed-size chunks of 100 lines

## Memory Storage

Ingested segments are stored as conscious memories with:
- **Content**: The actual code/text segment
- **Tags**: File type, filename, and ingestion date
- **Context**: File path, line numbers, and AI-generated summary
- **Importance**: 5 for complete segments, 4 for partial segments
- **Source**: Marked as 'derived' (from ingestion process)

## Troubleshooting

### Out of Memory
For very large files, the ingestion service reads in chunks of 100 lines. If you still encounter memory issues:
- Reduce concurrency: `--concurrency 1`
- Process smaller directories individually
- Exclude large generated files: `--exclude "*.min.js" "dist/*"`

### Slow Processing
- Enable parallel processing: `--parallel`
- Increase concurrency: `--concurrency 10`
- Use a faster LLM model in the environment configuration

### Incomplete Segments
The LLM uses confidence scoring to determine segment completeness. If segments are being cut off:
- The service will mark partial segments with lower importance (4 vs 5)
- Adjust the `minLines` and `maxLines` in file type mappings if needed

## Best Practices

1. **Start Small**: Test on a small directory first to ensure configuration is correct
2. **Use Incremental Mode**: Leave incremental mode on for subsequent runs
3. **Organize by Project**: Use different database names for different projects/domains
4. **Review Statistics**: Check stats after processing to verify completeness
5. **Exclude Generated Files**: Always exclude node_modules, dist, build directories

## Integration with Chat

Once files are ingested, they become searchable in the chat interface:
- The AI can reference specific code segments
- Search conscious memories to find ingested content
- Combine multiple project databases for cross-project knowledge
