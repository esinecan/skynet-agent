#!/usr/bin/env node

/**
 * Knowledge Graph MCP Server
 * Exposes knowledge graph operations as tools for the LLM
 * Improved error handling to prevent stream termination
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import knowledgeGraphServiceInstance from '../knowledge-graph-service.js';

async function main() {
  console.log(' Starting Knowledge Graph MCP Server...');

  // Create MCP server
  const server = new McpServer({
    name: "knowledge-graph",
    version: "1.0.0"
  }, {
    capabilities: {
      tools: {}
    }
  });

  // Initialize knowledge graph service with error handling
  const kgService = knowledgeGraphServiceInstance;
  
  try {
    await kgService.connect();
    console.log('Knowledge Graph Service connected for MCP Server.');
  } catch (error) {
    console.error('Failed to connect to Knowledge Graph Service for MCP Server:', error);
    // Continue running with limited functionality instead of process.exit(1)
    console.log('Running with limited functionality - some operations may fail');
  }

  // === QUERY KNOWLEDGE GRAPH TOOL ===
  server.tool("query_knowledge_graph",
    {
      query: z.string().describe(
        "The Cypher query to execute. Ensure the query returns data in a serializable format. For example, RETURN n.name AS name, r.type AS relationship, m.content AS related_content LIMIT 10."
      ),
      params: z.record(z.any()).optional().describe(
        "An optional object of parameters to pass to the Cypher query. E.g., { entityId: 'some-id' }"
      ),
    },
    async ({ query, params }) => {
      try {
        const result = await kgService.runQuery(query, params);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({ success: true, result }, null, 2)
            }
          ]
        };
      } catch (error: any) {
        console.error('Error executing query:', error);
        const errorResult = {
          success: false,
          error: error.message || 'Failed to execute query.',
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

  // === GET RELATED ENTITIES TOOL ===
  server.tool("get_related_entities",
    {
      entityId: z.string().describe("The ID of the entity to find related entities for."),
      relationshipType: z.string().optional().describe("Filter by specific relationship type."),
      direction: z.enum(['incoming', 'outgoing', 'both']).default('both').describe("Direction of relationships to follow."),
      depth: z.number().min(1).max(3).default(1).describe("Maximum depth to traverse."),
    },
    async ({ entityId, relationshipType, direction, depth }) => {
      try {
        // Construct a Cypher query based on parameters
        let query = '';
        const params: Record<string, any> = { entityId };
        
        if (direction === 'incoming') {
          query = `
            MATCH (n)-[r${relationshipType ? `:${relationshipType}` : ''}]->(m {id: $entityId})
            WHERE n:${depth > 1 ? '*1..' + depth : ''}
            RETURN n, r, m
            LIMIT 25
          `;
        } else if (direction === 'outgoing') {
          query = `
            MATCH (n {id: $entityId})-[r${relationshipType ? `:${relationshipType}` : ''}]->(m)
            ${depth > 1 ? `WHERE length(shortestPath((n)-[*1..${depth}]->(m))) <= ${depth}` : ''}
            RETURN n, r, m
            LIMIT 25
          `;
        } else {
          // both directions
          query = `
            MATCH path = (n)-[r${relationshipType ? `:${relationshipType}` : ''}]-(m)
            WHERE n.id = $entityId
            ${depth > 1 ? `AND length(path) <= ${depth}` : ''}
            RETURN n, r, m
            LIMIT 25
          `;
        }

        const result = await kgService.runQuery(query, params);
        
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({ success: true, entities: result }, null, 2)
            }
          ]
        };
      } catch (error: any) {
        console.error('Error executing get_related_entities:', error);
        const errorResult = {
          success: false,
          error: error.message || 'Failed to get related entities.',
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

  // === FIND ENTITIES BY PROPERTY TOOL ===
  server.tool("find_entities_by_property",
    {
      label: z.string().describe("The entity label/type to search for."),
      property: z.string().describe("The property name to search by."),
      value: z.any().describe("The property value to match."),
    },
    async ({ label, property, value }) => {
      try {
        // Handle different types of values correctly in the query
        const params: Record<string, any> = { value };
        
        // For string values, allow substring matching with CONTAINS
        const valueComparison = typeof value === 'string' 
          ? `CONTAINS($value) OR n.${property} = $value`
          : `= $value`;
        
        const query = `
          MATCH (n:${label})
          WHERE n.${property} ${valueComparison}
          RETURN n
          LIMIT 20
        `;

        const result = await kgService.runQuery(query, params);
        
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({ success: true, entities: result }, null, 2)
            }
          ]
        };
      } catch (error: any) {
        console.error('Error executing find_entities_by_property:', error);
        const errorResult = {
          success: false,
          error: error.message || 'Failed to find entities.',
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

  // === GET ENTITY DETAILS TOOL ===
  server.tool("get_entity_details",
    {
      entityId: z.string().describe("The ID of the entity to retrieve."),
    },
    async ({ entityId }) => {
      try {
        const query = `MATCH (n {id: $entityId}) RETURN n`;
        const params = { entityId };
        const results = await kgService.runQuery(query, params);
        
        if (results.length === 0) {
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({ success: false, error: `Entity with ID ${entityId} not found.` }, null, 2)
              }
            ],
            isError: true
          };
        }
        
        const record = results[0];
        
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({ 
                success: true, 
                entity: { 
                  id: record.id, 
                  labels: record.labels, 
                  properties: record.properties 
                }
              }, null, 2)
            }
          ]
        };
      } catch (error: any) {
        console.error('Error executing get_entity_details:', error);
        const errorResult = {
          success: false,
          error: error.message || 'Failed to get entity details.',
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


  // === FIND PURPOSEFUL CONNECTIONS TOOL ===
  server.tool("find_purposeful_connections",
    {
      relationshipType: z.string().describe("Type of relationship to find (e.g., 'WORKS_ON', 'USES', 'PREFERS', 'LEARNED_ABOUT')"),
      sourceType: z.string().optional().describe("Entity type/label of the source (e.g., 'Person', 'User', 'Project')"),
      sourceName: z.string().optional().describe("Name property to match on source entities"),
      targetType: z.string().optional().describe("Entity type/label of the target (e.g., 'Project', 'Tool')"),
      targetName: z.string().optional().describe("Name property to match on target entities"),
      includeProperties: z.boolean().optional().default(true).describe("Include relationship properties in results")
    },
    async ({ relationshipType, sourceType, sourceName, targetType, targetName, includeProperties }) => {
      try {
        // Build query based on provided parameters
        const params: Record<string, any> = {};
        
        // Build Cypher match patterns based on provided filters
        let sourcePattern = "(source";
        if (sourceType) {
          sourcePattern += `:${sourceType}`;
        }
        if (sourceName) {
          sourcePattern += " {name: $sourceName}";
          params.sourceName = sourceName;
        }
        sourcePattern += ")";
        
        let targetPattern = "(target";
        if (targetType) {
          targetPattern += `:${targetType}`;
        }
        if (targetName) {
          targetPattern += " {name: $targetName}";
          params.targetName = targetName;
        }
        targetPattern += ")";
        
        // Build relationship pattern
        let relPattern = `[rel:${relationshipType}]`;
        
        // Combine into complete query
        const query = `
          MATCH ${sourcePattern}-${relPattern}->${targetPattern}
          RETURN 
            source.id AS sourceId,
            source.name AS sourceName,
            labels(source)[0] AS sourceType,
            target.id AS targetId,
            target.name AS targetName,
            labels(target)[0] AS targetType,
            type(rel) AS relationship
            ${includeProperties ? ', properties(rel) AS properties' : ''}
          LIMIT 20
        `;
        
        const results = await kgService.runQuery(query, params);
        
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({ 
                success: true, 
                connections: results,
                count: results.length
              }, null, 2)
            }
          ]
        };
      } catch (error: any) {
        console.error('Error finding purposeful connections:', error);
        const errorResult = {
          success: false,
          error: error.message || 'Failed to find connections',
          details: error instanceof Error ? error.message : 'Unknown error'
        };
        return {
          content: [{ type: "text", text: JSON.stringify(errorResult, null, 2) }],
          isError: true
        };
      }
    }
  );

  // Start the server
  const transport = new StdioServerTransport();
  
  try {
    await server.connect(transport);
    console.log(' Knowledge Graph MCP Server started successfully');
    console.log('Available tools:');
    console.log('  - query_knowledge_graph: Execute Cypher queries');
    console.log('  - get_related_entities: Find related entities');
    console.log('  - find_entities_by_property: Search entities by property');
    console.log('  - get_entity_details: Get entity details');
    console.log('  - find_purposeful_connections: Find purposeful connections by relationship type');
  } catch (error) {
    console.error('Failed to start MCP server transport:', error);
    // Don't terminate the process
  }

  // Graceful shutdown
  process.on('SIGINT', async () => {
    console.log('SIGINT received, shutting down Knowledge Graph MCP Server...');
    try {
      await kgService.close();
    } catch (error) {
      console.error('Error during shutdown:', error);
    }
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    console.log('SIGTERM received, shutting down Knowledge Graph MCP Server...');
    try {
      await kgService.close();
    } catch (error) {
      console.error('Error during shutdown:', error);
    }
    process.exit(0);
  });
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
  console.log(' Shutting down Knowledge Graph MCP Server...');
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log(' Shutting down Knowledge Graph MCP Server...');
  process.exit(0);
});

// Start the server
main().catch((error) => {
  console.error(' Failed to start Knowledge Graph MCP Server:', error);
  // Don't terminate process, stay running with limited functionality
  console.error(' Server will continue with limited functionality');
});
