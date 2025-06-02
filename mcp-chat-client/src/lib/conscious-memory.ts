/**
 * Conscious Memory Service
 * Extends the existing ChromaDB memory system with conscious memory functionality
 */

import { 
  ConsciousMemoryService,
  ConsciousMemorySearchOptions,
  ConsciousMemorySearchResult,
  ConsciousMemoryMetadata,
  MemorySaveRequest,
  MemoryUpdateRequest,
  ConsciousMemoryStats
} from '../types/memory';
import { getMemoryStore } from './memory-store';
import { getEmbeddingService } from './embeddings';

export class ConsciousMemoryServiceImpl implements ConsciousMemoryService {
  private memoryStore = getMemoryStore();
  private embeddingService = getEmbeddingService();
  private initialized = false;

  async initialize(): Promise<void> {
    if (!this.initialized) {
      await this.memoryStore.initialize();
      this.initialized = true;
      console.log('🧠 ConsciousMemoryService initialized');
    }
  }

  async saveMemory(request: MemorySaveRequest): Promise<string> {
    if (!this.initialized) {
      await this.initialize();
    }    // Create conscious memory metadata
    const metadata: ConsciousMemoryMetadata = {
      sessionId: request.sessionId || 'default',
      timestamp: new Date().toISOString(),
      messageType: 'assistant', // Conscious memories are typically assistant-generated
      textLength: request.content.length,
      memoryType: 'conscious',
      tags: request.tags || [],
      importance: request.importance || 5,
      source: request.source || 'explicit',
      context: request.context,
      relatedMemoryIds: []
    };

    // Create ChromaDB-compatible metadata (flatten arrays to strings)
    const chromaMetadata = {
      ...metadata,
      tags: JSON.stringify(metadata.tags),
      relatedMemoryIds: JSON.stringify(metadata.relatedMemoryIds),
      context: metadata.context || ''
    };    // Store using the existing memory store infrastructure
    const id = await this.memoryStore.storeMemory(request.content, chromaMetadata as any);
    
    console.log(`🧠 Conscious memory saved: ${id} (importance: ${metadata.importance}, tags: ${metadata.tags.join(', ')})`);
    return id;
  }  async searchMemories(
    query: string, 
    options: ConsciousMemorySearchOptions = {}
  ): Promise<ConsciousMemorySearchResult[]> {
    if (!this.initialized) {
      await this.initialize();
    }

    console.log(`🧠 Conscious memory search: "${query}" with options:`, options);

    // Stage 1: Semantic search with embeddings
    const semanticResults = await this.memoryStore.retrieveMemories(query, {
      limit: options.limit || 10,
      sessionId: options.sessionId,
      minScore: options.minScore || 0.0  // Very low threshold to catch more results
    });

    console.log(`🧠 Semantic search results: ${semanticResults.length} memories found`);

    // Stage 2: Keyword fallback search if semantic results are limited
    let keywordResults: any[] = [];
    const minSemanticResults = 2; // If we get fewer than this, try keyword search
    
    if (semanticResults.length < minSemanticResults) {
      console.log(`🧠 Semantic results below threshold (${semanticResults.length}), trying keyword search...`);
      keywordResults = await this.performKeywordSearch(query, options);
      console.log(`🧠 Keyword search results: ${keywordResults.length} memories found`);
    }

    // Stage 3: Merge and deduplicate results
    const combinedResults = this.mergeSearchResults(semanticResults, keywordResults);
    console.log(`🧠 Combined search results: ${combinedResults.length} memories found`);    // Filter and enhance results - include both conscious memories AND regular memories
    const filtered = combinedResults
      .filter(result => {
        const metadata = result.metadata as ConsciousMemoryMetadata;
        
        console.log(`🧠 Processing memory ${result.id}: type=${metadata.memoryType}, score=${result.score}`);
        
        // If it's a conscious memory, apply conscious memory specific filters
        if (metadata.memoryType === 'conscious') {
          // Apply conscious memory specific filters
          if (options.tags && options.tags.length > 0) {
            if (!metadata.tags || !options.tags.some(tag => metadata.tags.includes(tag))) {
              return false;
            }
          }
          
          if (options.importanceMin && metadata.importance < options.importanceMin) {
            return false;
          }
          
          if (options.importanceMax && metadata.importance > options.importanceMax) {
            return false;
          }
          
          if (options.source && metadata.source !== options.source) {
            return false;
          }
        }
        // For regular memories, include them unless explicitly filtering for conscious-only
        else if (options.consciousOnly) {
          return false;
        }
        
        return true;      })
      .map(result => {
        const metadata = result.metadata as any; // ChromaDB metadata might have stringified arrays
        
        // Parse stringified arrays back to arrays
        let tags: string[] = [];
        let relatedMemoryIds: string[] = [];
        
        try {
          tags = typeof metadata.tags === 'string' ? JSON.parse(metadata.tags) : (metadata.tags || []);
        } catch {
          tags = [];
        }
        
        try {
          relatedMemoryIds = typeof metadata.relatedMemoryIds === 'string' ? JSON.parse(metadata.relatedMemoryIds) : (metadata.relatedMemoryIds || []);
        } catch {
          relatedMemoryIds = [];
        }
        
        return {
          id: result.id,
          text: result.text,
          score: result.score,
          metadata: result.metadata,
          tags,
          importance: metadata.importance || 5,
          source: metadata.source || 'chat',
          context: metadata.context,
          relatedMemoryIds
        };
      })
      .sort((a, b) => b.score - a.score); // Sort by relevance score first, then importance

    console.log(`🧠 Conscious memory search returning ${filtered.length} results`);
    return filtered;
  }

  async updateMemory(request: MemoryUpdateRequest): Promise<boolean> {
    if (!this.initialized) {
      await this.initialize();
    }

    // For now, we'll implement update by deleting and re-creating
    // This could be optimized in the future with ChromaDB's update capabilities
    
    try {
      // First, search for the memory to get its current data
      const currentMemories = await this.memoryStore.retrieveMemories(request.id, { limit: 1 });
      const currentMemory = currentMemories.find(m => m.id === request.id);
      
      if (!currentMemory) {
        console.warn(`🧠 Memory ${request.id} not found for update`);
        return false;
      }

      const currentMetadata = currentMemory.metadata as ConsciousMemoryMetadata;
      
      // Create updated memory with merged data
      const updatedMetadata: ConsciousMemoryMetadata = {
        ...currentMetadata,
        timestamp: new Date().toISOString(),
        textLength: (request.content || currentMemory.text).length,
        tags: request.tags || currentMetadata.tags,
        importance: request.importance || currentMetadata.importance,
        context: request.context || currentMetadata.context
      };

      // Store new version (the underlying ChromaDB will handle ID conflicts)
      await this.memoryStore.storeMemory(
        request.content || currentMemory.text,
        updatedMetadata
      );

      console.log(`🧠 Memory ${request.id} updated successfully`);
      return true;
    } catch (error) {
      console.error(`🧠 Failed to update memory ${request.id}:`, error);
      return false;
    }
  }

  async deleteMemory(id: string): Promise<boolean> {
    // ChromaDB doesn't have a direct delete method in our current implementation
    // This would need to be added to the ChromaMemoryStore class
    // For now, we'll return false to indicate deletion is not yet supported
    console.warn(`🧠 Memory deletion not yet implemented for id: ${id}`);
    return false;
  }

  async getAllTags(): Promise<string[]> {
    if (!this.initialized) {
      await this.initialize();
    }

    try {
      // Get all memories and extract unique tags
      // This is inefficient but works with current ChromaDB setup
      const allMemories = await this.memoryStore.retrieveMemories('', { limit: 1000 });
      
      const tagSet = new Set<string>();
      
      allMemories.forEach(memory => {
        const metadata = memory.metadata as ConsciousMemoryMetadata;
        if (metadata.memoryType === 'conscious' && metadata.tags) {
          metadata.tags.forEach(tag => tagSet.add(tag));
        }
      });
      
      return Array.from(tagSet).sort();
    } catch (error) {
      console.error('🧠 Failed to get all tags:', error);
      return [];
    }
  }

  async getRelatedMemories(id: string, limit = 5): Promise<ConsciousMemorySearchResult[]> {
    if (!this.initialized) {
      await this.initialize();
    }

    try {
      // Find the source memory first
      const sourceMemories = await this.memoryStore.retrieveMemories(id, { limit: 1 });
      const sourceMemory = sourceMemories.find(m => m.id === id);
      
      if (!sourceMemory) {
        console.warn(`🧠 Source memory ${id} not found for related search`);
        return [];
      }

      // Use the source memory's content to find similar memories
      const relatedResults = await this.searchMemories(sourceMemory.text, { 
        limit: limit + 1 // Get one extra to exclude the source
      });
      
      // Filter out the source memory itself
      return relatedResults.filter(result => result.id !== id).slice(0, limit);
    } catch (error) {
      console.error(`🧠 Failed to get related memories for ${id}:`, error);
      return [];
    }
  }

  async getStats(): Promise<ConsciousMemoryStats> {
    if (!this.initialized) {
      await this.initialize();
    }

    try {
      // Get all memories to calculate stats
      const allMemories = await this.memoryStore.retrieveMemories('', { limit: 1000 });
      
      const consciousMemories = allMemories.filter(memory => {
        const metadata = memory.metadata as ConsciousMemoryMetadata;
        return metadata.memoryType === 'conscious';
      });
      
      const tags = new Set<string>();
      const sourceBreakdown: Record<string, number> = { explicit: 0, suggested: 0, derived: 0 };
      let totalImportance = 0;
      
      consciousMemories.forEach(memory => {
        const metadata = memory.metadata as ConsciousMemoryMetadata;
        
        if (metadata.tags) {
          metadata.tags.forEach(tag => tags.add(tag));
        }
        
        sourceBreakdown[metadata.source] = (sourceBreakdown[metadata.source] || 0) + 1;
        totalImportance += metadata.importance;
      });
      
      return {
        totalConsciousMemories: consciousMemories.length,
        tagCount: tags.size,
        averageImportance: consciousMemories.length > 0 ? totalImportance / consciousMemories.length : 0,
        sourceBreakdown
      };
    } catch (error) {
      console.error('🧠 Failed to get stats:', error);
      return {
        totalConsciousMemories: 0,
        tagCount: 0,
        averageImportance: 0,
        sourceBreakdown: { explicit: 0, suggested: 0, derived: 0 }
      };
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      if (!this.initialized) {
        await this.initialize();
      }
      return await this.memoryStore.healthCheck();
    } catch (error) {
      console.error('🧠 Conscious memory health check failed:', error);
      return false;
    }
  }

  async testMemorySystem(): Promise<boolean> {
    try {
      const testContent = `Conscious memory test at ${new Date().toISOString()}`;
      
      // Test save
      const id = await this.saveMemory({
        content: testContent,
        tags: ['test', 'system-check'],
        importance: 5,
        source: 'explicit',
        context: 'System test'
      });
      
      // Short delay
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Test search
      const results = await this.searchMemories(testContent, { limit: 1 });
      
      const success = results.length > 0 && results[0].id === id;
      
      if (success) {
        console.log('🧠 Conscious memory system test passed');
      } else {
        console.error('🧠 Conscious memory system test failed');
      }
      
      return success;
    } catch (error) {
      console.error('🧠 Conscious memory system test error:', error);
      return false;
    }
  }

  /**
   * Perform keyword-based search as fallback when semantic search returns few results
   */
  private async performKeywordSearch(
    query: string, 
    options: ConsciousMemorySearchOptions
  ): Promise<any[]> {
    try {
      // Get all memories with a very low threshold to retrieve most of the collection
      const allMemories = await this.memoryStore.retrieveMemories('', {
        limit: 1000, // Large limit to get most memories
        sessionId: options.sessionId,
        minScore: -1.0 // Very low to get everything
      });

      // Split query into keywords
      const keywords = query.toLowerCase().split(/\s+/).filter(word => word.length > 2);
      
      // Score memories based on keyword matches
      const scoredMemories = allMemories
        .map(memory => {
          const text = memory.text.toLowerCase();
          let keywordScore = 0;
          let exactMatches = 0;
          
          for (const keyword of keywords) {
            if (text.includes(keyword)) {
              exactMatches++;
              keywordScore += 0.3; // Base score for keyword match
              
              // Bonus for exact word boundary matches
              const wordRegex = new RegExp(`\\b${keyword}\\b`, 'i');
              if (wordRegex.test(text)) {
                keywordScore += 0.2;
              }
            }
          }
          
          // Calculate final score
          const coverage = exactMatches / keywords.length; // How many keywords matched
          const finalScore = keywordScore * coverage;
          
          return {
            ...memory,
            score: finalScore,
            keywordMatches: exactMatches
          };
        })
        .filter(memory => memory.keywordMatches > 0) // Only keep memories with keyword matches
        .sort((a, b) => b.score - a.score) // Sort by keyword relevance
        .slice(0, options.limit || 10);

      return scoredMemories;
    } catch (error) {
      console.error('🧠 Keyword search error:', error);
      return [];
    }
  }

  /**
   * Merge semantic and keyword search results, removing duplicates and ranking
   */
  private mergeSearchResults(semanticResults: any[], keywordResults: any[]): any[] {
    const mergedMap = new Map();
    
    // Add semantic results first (higher priority)
    for (const result of semanticResults) {
      mergedMap.set(result.id, {
        ...result,
        searchType: 'semantic'
      });
    }
    
    // Add keyword results, but don't overwrite semantic ones
    for (const result of keywordResults) {
      if (!mergedMap.has(result.id)) {
        mergedMap.set(result.id, {
          ...result,
          searchType: 'keyword'
        });
      }
    }
    
    // Convert back to array and sort by score
    return Array.from(mergedMap.values())
      .sort((a, b) => {
        // Prioritize semantic results if scores are close
        if (Math.abs(a.score - b.score) < 0.1) {
          return a.searchType === 'semantic' ? -1 : 1;
        }
        return b.score - a.score;
      });
  }
}

// Export singleton instance
let consciousMemoryService: ConsciousMemoryServiceImpl | null = null;

export function getConsciousMemoryService(): ConsciousMemoryService {
  if (!consciousMemoryService) {
    consciousMemoryService = new ConsciousMemoryServiceImpl();
  }
  return consciousMemoryService;
}
