#!/usr/bin/env node

/**
 * Knowledge Graph MCP Server
 * Exposes knowledge graph operations as tools for the LLM
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
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

  // Initialize knowledge graph service
  const kgService = knowledgeGraphServiceInstance;
  
  try {
    await kgService.connect();
    console.log('Knowledge Graph Service connected for MCP Server.');
  } catch (error) {
    console.error('Failed to connect to Knowledge Graph Service for MCP Server:', error);
    process.exit(1);
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
        // Build Cypher query based on parameters
        let query: string;
        let params: any = { entityId };

        if (relationshipType) {
          params.relType = relationshipType;
          switch (direction) {
            case 'incoming':
              query = `MATCH (related)-[r:$relType]->(target {id: $entityId}) RETURN related, r, target LIMIT 20`;
              break;
            case 'outgoing':
              query = `MATCH (target {id: $entityId})-[r:$relType]->(related) RETURN target, r, related LIMIT 20`;
              break;
            default:
              query = `MATCH (target {id: $entityId})-[r:$relType]-(related) RETURN target, r, related LIMIT 20`;
          }
        } else {
          switch (direction) {
            case 'incoming':
              query = `MATCH (related)-[r]->(target {id: $entityId}) RETURN related, r, target LIMIT 20`;
              break;
            case 'outgoing':
              query = `MATCH (target {id: $entityId})-[r]->(related) RETURN target, r, related LIMIT 20`;
              break;
            default:
              query = `MATCH (target {id: $entityId})-[r]-(related) RETURN target, r, related LIMIT 20`;
          }
        }

        const entities = await kgService.runQuery(query, params);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({ success: true, entities }, null, 2)
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
        const query = `MATCH (n:${label}) WHERE n.${property} = $value RETURN n LIMIT 20`;
        const params = { value };
        const entities = await kgService.runQuery(query, params);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({ success: true, entities }, null, 2)
            }
          ]
        };
      } catch (error: any) {
        console.error('Error executing find_entities_by_property:', error);
        const errorResult = {
          success: false,
          error: error.message || 'Failed to find entities by property.',
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

  // Start the server
  const transport = new StdioServerTransport();
  await server.connect(transport);

  console.log(' Knowledge Graph MCP Server started successfully');
  console.log('Available tools:');
  console.log('  - query_knowledge_graph: Execute Cypher queries');
  console.log('  - get_related_entities: Find related entities');
  console.log('  - find_entities_by_property: Search entities by property');
  console.log('  - get_entity_details: Get entity details');

  // Graceful shutdown
  process.on('SIGINT', async () => {
    console.log('SIGINT received, shutting down Knowledge Graph MCP Server...');
    await kgService.close();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    console.log('SIGTERM received, shutting down Knowledge Graph MCP Server...');
    await kgService.close();
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
  process.exit(1);
});
