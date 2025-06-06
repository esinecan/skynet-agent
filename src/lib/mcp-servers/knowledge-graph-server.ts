import { McpServer, StdioServerTransport, ToolInputSchemas, ToolOutputValues } from '@modelcontextprotocol/sdk';
import { z } from 'zod';
import knowledgeGraphServiceInstance, { KnowledgeGraphService } from '../knowledge-graph-service'; // Assuming singleton instance

// Define input and output schemas using Zod
const toolSchemas = {
  query_knowledge_graph: {
    input: z.object({
      query: z.string().describe(
        "The Cypher query to execute. Ensure the query returns data in a serializable format. For example, RETURN n.name AS name, r.type AS relationship, m.content AS related_content LIMIT 10."
      ),
      params: z.record(z.any()).optional().describe(
        "An optional object of parameters to pass to the Cypher query. E.g., { entityId: 'some-id' }"
      ),
    }),
    output: z.object({
      success: z.boolean(),
      result: z.any().optional().describe("The query result, typically an array of records or a graph structure."),
      error: z.string().optional().describe("Error message if the query failed."),
    }),
  },
  get_related_entities: {
    input: z.object({
      entityId: z.string().describe("The ID of the source entity in the knowledge graph."),
      relationshipTypes: z.array(z.string()).optional().describe(
        "Optional list of relationship types to follow (e.g., ['HAS_TAG', 'REFERENCES_FILE'])."
      ),
      targetLabels: z.array(z.string()).optional().describe(
        "Optional list of labels for the target entities (e.g., ['File', 'Concept'])."
      ),
      limit: z.number().min(1).max(50).optional().default(10).describe(
        "Maximum number of related entities to return (default: 10)."
      ),
    }),
    // Output schema is similar to query_knowledge_graph for now, can be more specific
    output: z.object({
        success: z.boolean(),
        entities: z.array(z.object({
            id: z.string(),
            labels: z.array(z.string()),
            properties: z.record(z.any()),
            relationshipType: z.string().optional(), // If only one type is queried or relevant
            relationshipDirection: z.enum(['INCOMING', 'OUTGOING', 'BOTH']).optional(), // If relevant
        })).optional(),
        error: z.string().optional(),
    }),
  },
  // Optional: find_entities_by_property
   find_entities_by_property: {
    input: z.object({
      label: z.string().describe("The label of the entities to search for (e.g., 'Person', 'FilePath')."),
      propertyName: z.string().describe("The name of the property to filter by (e.g., 'name', 'path')."),
      propertyValue: z.any().describe("The value of the property to match."),
      limit: z.number().min(1).max(50).optional().default(10).describe("Maximum number of entities to return."),
    }),
    output: z.object({
        success: z.boolean(),
        entities: z.array(z.object({
            id: z.string(),
            labels: z.array(z.string()),
            properties: z.record(z.any()),
        })).optional(),
        error: z.string().optional(),
    }),
  },
  // Optional: get_entity_details
  get_entity_details: {
    input: z.object({
      entityId: z.string().describe("The ID of the entity to retrieve."),
    }),
    output: z.object({
        success: z.boolean(),
        entity: z.object({
            id: z.string(),
            labels: z.array(z.string()),
            properties: z.record(z.any()),
        }).optional(),
        error: z.string().optional(),
    }),
  }
};

async function main() {
  const kgService: KnowledgeGraphService = knowledgeGraphServiceInstance;

  try {
    await kgService.connect();
    console.log('Knowledge Graph Service connected for MCP Server.');
  } catch (error) {
    console.error('Failed to connect to Knowledge Graph Service for MCP Server:', error);
    process.exit(1); // Exit if we can't connect to the KG
  }

  const server = new McpServer({
    name: 'knowledge-graph',
    description: 'A server for interacting with the Neo4j knowledge graph.',
    tools: {
      query_knowledge_graph: {
        description: 'Queries the Neo4j knowledge graph using a Cypher query. Use this to find complex relationships, patterns, or retrieve specific structured data.',
        inputSchema: toolSchemas.query_knowledge_graph.input,
        outputSchema: toolSchemas.query_knowledge_graph.output,
        execute: async (input) => {
          try {
            const result = await kgService.runQuery(input.query, input.params);
            return { success: true, result };
          } catch (error: any) {
            console.error('Error executing query_knowledge_graph:', error);
            return { success: false, error: error.message || 'Failed to execute Cypher query.' };
          }
        },
      },
      get_related_entities: {
        description: 'Retrieves entities directly related to a given entity ID, optionally filtered by relationship types or target entity labels.',
        inputSchema: toolSchemas.get_related_entities.input,
        outputSchema: toolSchemas.get_related_entities.output,
        execute: async (input) => {
          const { entityId, relationshipTypes, targetLabels, limit } = input;
          let query = `MATCH (source)-[r]-(target) WHERE source.id = $entityId `;
          const params: Record<string, any> = { entityId, limit };

          if (relationshipTypes && relationshipTypes.length > 0) {
            query += `AND type(r) IN $relationshipTypes `;
            params.relationshipTypes = relationshipTypes;
          }
          if (targetLabels && targetLabels.length > 0) {
            query += `AND size([label IN labels(target) WHERE label IN $targetLabels | 1]) > 0 `;
            params.targetLabels = targetLabels;
          }
          query += `RETURN target.id AS id, labels(target) AS labels, properties(target) AS properties, type(r) AS relationshipType LIMIT $limit`;

          try {
            const results = await kgService.runQuery(query, params);
            // Ensure results are in the expected format
            const entities = results.map((record: any) => ({
                id: record.id,
                labels: record.labels,
                properties: record.properties,
                relationshipType: record.relationshipType,
            }));
            return { success: true, entities };
          } catch (error: any) {
            console.error('Error executing get_related_entities:', error);
            return { success: false, error: error.message || 'Failed to get related entities.' };
          }
        },
      },
      find_entities_by_property: {
        description: 'Finds entities by a specific label and property value.',
        inputSchema: toolSchemas.find_entities_by_property.input,
        outputSchema: toolSchemas.find_entities_by_property.output,
        execute: async (input) => {
            const { label, propertyName, propertyValue, limit } = input;
            // Basic input validation for propertyName to prevent injection, though params should handle it.
            // A more robust solution would be to ensure propertyName does not contain malicious characters.
            if (!/^[a-zA-Z0-9_]+$/.test(propertyName)) {
                 return { success: false, error: "Invalid propertyName." };
            }
            const query = `MATCH (n:\`${label}\`) WHERE n.${propertyName} = $propertyValue RETURN n.id AS id, labels(n) AS labels, properties(n) AS properties LIMIT $limit`;
            const params = { propertyValue, limit };
            try {
                const results = await kgService.runQuery(query, params);
                 const entities = results.map((record: any) => ({
                    id: record.id,
                    labels: record.labels,
                    properties: record.properties,
                }));
                return { success: true, entities };
            } catch (error: any) {
                console.error('Error executing find_entities_by_property:', error);
                return { success: false, error: error.message || 'Failed to find entities by property.' };
            }
        },
      },
      get_entity_details: {
        description: 'Retrieves all properties and labels for a given entity ID.',
        inputSchema: toolSchemas.get_entity_details.input,
        outputSchema: toolSchemas.get_entity_details.output,
        execute: async (input) => {
            const { entityId } = input;
            const query = `MATCH (n) WHERE n.id = $entityId RETURN n.id AS id, labels(n) AS labels, properties(n) AS properties LIMIT 1`;
            const params = { entityId };
            try {
                const results = await kgService.runQuery(query, params);
                if (results.length === 0) {
                    return { success: false, error: `Entity with ID ${entityId} not found.` };
                }
                const record = results[0];
                return { success: true, entity: { id: record.id, labels: record.labels, properties: record.properties }};
            } catch (error: any) {
                console.error('Error executing get_entity_details:', error);
                return { success: false, error: error.message || 'Failed to get entity details.' };
            }
        },
      },
    },
  });

  const transport = new StdioServerTransport();
  server.connect(transport);
  console.log('Knowledge Graph MCP Server started and connected to StdioTransport.');

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

main().catch(error => {
  console.error('Failed to start Knowledge Graph MCP Server:', error);
  process.exit(1);
});
