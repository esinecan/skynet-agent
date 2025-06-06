import neo4j, { Driver, Session } from 'neo4j-driver';
import { KgNode } from '../types/knowledge-graph';

// TODO: Consider moving KgRelationship to ../types/knowledge-graph.ts as well
export interface KgRelationship {
  id: string;
  sourceNodeId: string;
  targetNodeId: string;
  type: string; // Relationship type (e.g., "WORKS_FOR", "LIVES_IN", "HAS_MET")
  properties: Record<string, any>; // Arbitrary properties (e.g., { "role": "Software Engineer" })
  // Optional metadata
  createdAt?: Date;
  updatedAt?: Date;
  // Optional source information
  source?: string;
}

class KnowledgeGraphService {
  private driver: Driver;
  private session: Session | null = null;

  constructor() {
    const uri = process.env.NEO4J_URI;
    const user = process.env.NEO4J_USER;
    const password = process.env.NEO4J_PASSWORD;

    if (!uri || !user || !password) {
      throw new Error(
        'Missing Neo4j connection details in environment variables (NEO4J_URI, NEO4J_USER, NEO4J_PASSWORD)',
      );
    }

    this.driver = neo4j.driver(uri, neo4j.auth.basic(user, password));
  }

  async connect(): Promise<void> {
    if (this.session) {
      return;
    }
    try {
      await this.driver.verifyConnectivity();
      this.session = this.driver.session();
      console.log('Successfully connected to Neo4j');
    } catch (error) {
      console.error('Failed to connect to Neo4j:', error);
      throw error;
    }
  }

  async close(): Promise<void> {
    if (this.session) {
      await this.session.close();
      this.session = null;
      console.log('Neo4j session closed');
    }
    await this.driver.close();
    console.log('Neo4j driver closed');
  }

  // Placeholder for adding a node
  async addNode(node: KgNode): Promise<KgNode> {
    if (!this.session) await this.connect();

    const query = `
      MERGE (n:${node.type} {id: $id})
      SET n += $properties, n.updatedAt = datetime()
      RETURN n
    `;

    const result = await this.session!.run(query, {
      id: node.id,
      properties: { ...node.properties, createdAt: node.createdAt || new Date() }
    });

    // Note: The provided snippet returns the input 'node'.
    // Depending on driver specifics and desired return value,
    // you might want to map the result from Neo4j back to a KgNode.
    // For now, sticking to the provided snippet.
    return node;
  }

  // Placeholder for adding a relationship
  // Assuming KgRelationship is defined in ../types/knowledge-graph
  // For now, let's define a minimal one here if not present globally yet.
  // interface KgRelationship { // This was in the prompt, but we have one above.
  //   sourceNodeId: string;
  //   targetNodeId: string;
  //   sourceNodeType: string; // e.g. 'User'
  //   targetNodeType: string; // e.g. 'Message'
  //   relationshipType: string; // e.g. 'SENT'
  //   properties?: Record<string, any>;
  // }

  async addRelationship(relationship: KgRelationship): Promise<void> {
    if (!this.session) await this.connect();

    // Assuming sourceNodeType and targetNodeType are part of KgRelationship
    // If not, this query would need adjustment or those types passed differently.
    // For now, we assume they are NOT part of the existing KgRelationship.
    // The prompt's example KgRelationship had them, but the one in this file does not.
    // We will need to adjust the query to match the existing KgRelationship interface.
    // The prompt's example relationship also used relationship.relationshipType.
    // The existing KgRelationship uses 'type' for the relationship type.

    const query = `
      MATCH (a {id: $sourceNodeId})
      MATCH (b {id: $targetNodeId})
      MERGE (a)-[r:${relationship.type}]->(b)
      SET r += $properties, r.createdAt = datetime(), r.updatedAt = datetime()
      RETURN type(r)
    `;

    await this.session!.run(query, {
      sourceNodeId: relationship.sourceNodeId,
      targetNodeId: relationship.targetNodeId,
      properties: relationship.properties || {}
    });
  }

  async deleteNode(nodeId: string): Promise<void> {
    if (!this.session) await this.connect();
    console.log(`[KnowledgeGraphService] Attempting to delete node with ID: ${nodeId}`);
    // Basic query to detach and delete a node by its generic 'id' property
    // This assumes 'id' is a unique identifier across all node types you wish to delete this way
    const query = `
      MATCH (n {id: $nodeId})
      DETACH DELETE n
    `;
    try {
      await this.session!.run(query, { nodeId });
      console.log(`[KnowledgeGraphService] Successfully deleted node with ID: ${nodeId}`);
    } catch (error) {
      console.error(`[KnowledgeGraphService] Error deleting node ${nodeId}:`, error);
      // Decide on error handling: re-throw, or log and continue, etc.
      throw error; // Re-throwing for now
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      // Assuming runQuery is a method that can execute arbitrary queries.
      // If it's not, this might need to use this.session.run directly.
      // Let's assume a simple query execution for health check.
      // The existing runQuery method is suitable here.
      await this.runQuery('RETURN 1 as health');
      return true;
    } catch (error) {
      console.error('Neo4j health check failed:', error);
      return false;
    }
  }

  // Placeholder for running a generic Cypher query
  async runQuery(query: string, parameters?: Record<string, any>): Promise<any> {
    if (!this.session) {
      await this.connect();
    }
    // This is a non-null assertion. We ensure session is not null by calling connect.
    // However, TypeScript compiler might not infer this correctly in all paths.
    // A runtime check or more sophisticated type guarding might be needed in a real app.
    const session = this.session!;
    try {
      const result = await session.run(query, parameters);
      return result.records.map(record => record.toObject());
    } catch (error) {
      console.error(`Error running query "${query}":`, error);
      throw error;
    }
  }
}

const knowledgeGraphService = new KnowledgeGraphService();
export default knowledgeGraphService;
