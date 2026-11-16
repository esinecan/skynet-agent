import { ChunkingConfig } from '../types/file-mapping';

export const fileTypeMappings: ChunkingConfig = {
  typescript: {
    extensions: ['.ts', '.tsx'],
    chunkingStrategy: {
      type: 'function',
      patterns: [
        /^export\s+(async\s+)?function/,
        /^(export\s+)?class\s+/,
        /^(export\s+)?interface\s+/,
        /^(export\s+)?const\s+\w+\s*=\s*(async\s*)?\(/
      ],
      lookahead: 5
    },
    contextClues: ['function', 'class', 'interface', 'const', 'export'],
    minLines: 3,
    maxLines: 500
  },
  javascript: {
    extensions: ['.js', '.jsx', '.mjs'],
    chunkingStrategy: {
      type: 'function',
      patterns: [
        /^(export\s+)?(async\s+)?function/,
        /^class\s+/,
        /^const\s+\w+\s*=\s*(async\s*)?\(/
      ],
      lookahead: 5
    },
    minLines: 3,
    maxLines: 500
  },
  python: {
    extensions: ['.py'],
    chunkingStrategy: {
      type: 'function',
      patterns: [
        /^def\s+/,
        /^class\s+/,
        /^async\s+def\s+/
      ],
      lookahead: 3
    },
    contextClues: ['def', 'class', 'async def'],
    minLines: 2,
    maxLines: 300
  },
  markdown: {
    extensions: ['.md', '.mdx'],
    chunkingStrategy: {
      type: 'section',
      patterns: [
        /^#{1,6}\s+/
      ],
      delimiters: ['---', '***']
    },
    minLines: 5,
    maxLines: 200
  },
  json: {
    extensions: ['.json'],
    chunkingStrategy: {
      type: 'semantic',
      preserveStructure: true
    },
    minLines: 1,
    maxLines: 1000
  },
  text: {
    extensions: ['.txt', '.log'],
    chunkingStrategy: {
      type: 'paragraph',
      delimiters: ['\n\n', '\r\n\r\n']
    },
    minLines: 10,
    maxLines: 100
  },
  default: {
    extensions: ['*'],
    chunkingStrategy: {
      type: 'fixed'
    },
    minLines: 10,
    maxLines: 100
  }
};

export default fileTypeMappings;
