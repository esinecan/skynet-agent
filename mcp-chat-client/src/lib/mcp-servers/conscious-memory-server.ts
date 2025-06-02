#!/usr/bin/env node

/**
 * Conscious Memory MCP Server
 * Exposes conscious memory operations as tools for the LLM
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { getConsciousMemoryService } from '../conscious-memory.js';

async function main() {
  console.log('🧠 Starting Conscious Memory MCP Server...');

  // Create MCP server
  const server = new McpServer({
    name: "conscious-memory",
    version: "1.0.0"
  }, {
    capabilities: {
      tools: {}
    }
  });

  // Initialize conscious memory service
  const memoryService = getConsciousMemoryService();
  await memoryService.initialize();

  // === MEMORY SAVE TOOL ===
  server.tool("save_memory", 
    {
      content: z.string().describe("The information to remember"),
      tags: z.array(z.string()).optional().describe("Tags to categorize this memory"),
      importance: z.number().min(1).max(10).optional().describe("Importance level 1-10 (default: 5)"),
      context: z.string().optional().describe("Additional context about when/why this was saved"),
      sessionId: z.string().optional().describe("Session ID to associate with this memory")
    },
    async ({ content, tags, importance, context, sessionId }) => {
      try {
        const id = await memoryService.saveMemory({
          content,
          tags: tags || [],
          importance: importance || 5,
          source: 'explicit',
          context,
          sessionId
        });

        const result = {
          success: true,
          id,
          message: `Memory saved successfully with ID: ${id}`,
          summary: {
            content: content.slice(0, 100) + (content.length > 100 ? '...' : ''),
            tags: tags || [],
            importance: importance || 5
          }
        };

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2)
            }
          ]
        };
      } catch (error) {
        console.error('Failed to save memory:', error);
        const errorResult = {
          success: false,
          error: 'Failed to save memory to conscious storage',
          details: error instanceof Error ? error.message : 'Unknown error'
        };
        
        return {
          content: [
            {
              type: "text", 
              text: JSON.stringify(errorResult, null, 2)
            }
          ],
          isError: true
        };
      }
    }
  );

  // === MEMORY SEARCH TOOL ===
  server.tool("search_memories",
    {
      query: z.string().describe("What to search for in conscious memories"),
      tags: z.array(z.string()).optional().describe("Filter by specific tags"),
      importance_min: z.number().min(1).max(10).optional().describe("Minimum importance level"),
      importance_max: z.number().min(1).max(10).optional().describe("Maximum importance level"),
      limit: z.number().min(1).max(50).optional().describe("Maximum number of results (default: 10)"),
      sessionId: z.string().optional().describe("Filter by session ID")
    },
    async ({ query, tags, importance_min, importance_max, limit, sessionId }) => {
      try {
        const results = await memoryService.searchMemories(query, {
          tags,
          importanceMin: importance_min,
          importanceMax: importance_max,
          limit: limit || 10,
          sessionId
        });

        const result = {
          success: true,
          query,
          found: results.length,
          memories: results.map(result => ({
            id: result.id,
            content: result.text,
            tags: result.tags,
            importance: result.importance,
            score: Math.round(result.score * 100) / 100,
            context: result.context,
            source: result.source
          }))
        };

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2)
            }
          ]
        };
      } catch (error) {
        console.error('Failed to search memories:', error);
        const errorResult = {
          success: false,
          error: 'Failed to search conscious memories',
          details: error instanceof Error ? error.message : 'Unknown error'
        };
        
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(errorResult, null, 2)
            }
          ],
          isError: true
        };
      }
    }
  );

  // === UPDATE MEMORY TOOL ===
  server.tool("update_memory",
    {
      id: z.string().describe("ID of the memory to update"),
      content: z.string().optional().describe("New content for the memory"),
      tags: z.array(z.string()).optional().describe("New tags for the memory"),
      importance: z.number().min(1).max(10).optional().describe("New importance level"),
      context: z.string().optional().describe("New context for the memory")
    },
    async ({ id, content, tags, importance, context }) => {
      try {
        const success = await memoryService.updateMemory({
          id,
          content,
          tags,
          importance,
          context
        });

        const result = success 
          ? {
              success: true,
              id,
              message: `Memory ${id} updated successfully`,
              updates: { content, tags, importance, context }
            }
          : {
              success: false,
              error: `Memory ${id} not found or could not be updated`
            };

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2)
            }
          ],
          isError: !success
        };
      } catch (error) {
        console.error('Failed to update memory:', error);
        const errorResult = {
          success: false,
          error: 'Failed to update conscious memory',
          details: error instanceof Error ? error.message : 'Unknown error'
        };
        
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(errorResult, null, 2)
            }
          ],
          isError: true
        };
      }
    }
  );

  // === DELETE MEMORY TOOL ===
  server.tool("delete_memory",
    {
      id: z.string().describe("ID of the memory to delete")
    },
    async ({ id }) => {
      try {
        const success = await memoryService.deleteMemory(id);

        const result = success
          ? {
              success: true,
              id,
              message: `Memory ${id} deleted successfully`
            }
          : {
              success: false,
              error: `Memory ${id} not found or could not be deleted`
            };

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2)
            }
          ],
          isError: !success
        };
      } catch (error) {
        console.error('Failed to delete memory:', error);
        const errorResult = {
          success: false,
          error: 'Failed to delete conscious memory',
          details: error instanceof Error ? error.message : 'Unknown error'
        };
        
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(errorResult, null, 2)
            }
          ],
          isError: true
        };
      }
    }
  );

  // === GET MEMORY TAGS TOOL ===
  server.tool("get_memory_tags",
    {},
    async () => {
      try {
        const tags = await memoryService.getAllTags();

        const result = {
          success: true,
          tags,
          count: tags.length
        };

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2)
            }
          ]
        };
      } catch (error) {
        console.error('Failed to get memory tags:', error);
        const errorResult = {
          success: false,
          error: 'Failed to retrieve memory tags',
          details: error instanceof Error ? error.message : 'Unknown error'
        };
        
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(errorResult, null, 2)
            }
          ],
          isError: true
        };
      }
    }
  );

  // === GET RELATED MEMORIES TOOL ===
  server.tool("get_related_memories",
    {
      id: z.string().describe("ID of the memory to find relations for"),
      limit: z.number().min(1).max(20).optional().describe("Maximum number of related memories (default: 5)")
    },
    async ({ id, limit }) => {
      try {
        const relatedMemories = await memoryService.getRelatedMemories(id, limit || 5);

        const result = {
          success: true,
          sourceId: id,
          found: relatedMemories.length,
          relatedMemories: relatedMemories.map(result => ({
            id: result.id,
            content: result.text,
            tags: result.tags,
            importance: result.importance,
            score: Math.round(result.score * 100) / 100,
            source: result.source
          }))
        };

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2)
            }
          ]
        };
      } catch (error) {
        console.error('Failed to get related memories:', error);
        const errorResult = {
          success: false,
          error: 'Failed to find related memories',
          details: error instanceof Error ? error.message : 'Unknown error'
        };
        
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(errorResult, null, 2)
            }
          ],
          isError: true
        };
      }
    }
  );

  // === MEMORY STATS TOOL ===
  server.tool("get_memory_stats",
    {},
    async () => {
      try {
        const stats = await memoryService.getStats();

        const result = {
          success: true,
          stats: {
            totalMemories: stats.totalConsciousMemories,
            uniqueTags: stats.tagCount,
            averageImportance: Math.round(stats.averageImportance * 100) / 100,
            sourceBreakdown: stats.sourceBreakdown
          }
        };

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2)
            }
          ]
        };
      } catch (error) {
        console.error('Failed to get memory stats:', error);
        const errorResult = {
          success: false,
          error: 'Failed to retrieve memory statistics',
          details: error instanceof Error ? error.message : 'Unknown error'
        };
        
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(errorResult, null, 2)
            }
          ],
          isError: true
        };
      }
    }
  );

  // Start the server
  const transport = new StdioServerTransport();
  await server.connect(transport);

  console.log('✅ Conscious Memory MCP Server started successfully');
  console.log('🧠 Available tools:');
  console.log('   - save_memory: Save important information');
  console.log('   - search_memories: Search through conscious memories');
  console.log('   - update_memory: Update existing memories');
  console.log('   - delete_memory: Delete memories');
  console.log('   - get_memory_tags: List all available tags');
  console.log('   - get_related_memories: Find semantically similar memories');
  console.log('   - get_memory_stats: Get memory statistics');
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
  console.log('🛑 Shutting down Conscious Memory MCP Server...');
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('🛑 Shutting down Conscious Memory MCP Server...');
  process.exit(0);
});

// Start the server
main().catch((error) => {
  console.error('💥 Failed to start Conscious Memory MCP Server:', error);
  process.exit(1);
});
