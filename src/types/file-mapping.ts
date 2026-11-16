export interface FileTypeMapping {
  extensions: string[];
  chunkingStrategy: ChunkingStrategy;
  contextClues?: string[];
  minLines?: number;
  maxLines?: number;
  preserveStructure?: boolean;
}

export interface ChunkingStrategy {
  type: 'function' | 'class' | 'section' | 'paragraph' | 'fixed' | 'semantic';
  delimiters?: string[];
  patterns?: RegExp[];
  lookahead?: number;
  preserveStructure?: boolean;
}

export interface ChunkingConfig {
  [key: string]: FileTypeMapping;
}
