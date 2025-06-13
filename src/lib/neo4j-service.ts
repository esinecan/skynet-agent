import neo4j from 'neo4j-driver';

export class Neo4jService {
  private driver: any;
  private initialized: boolean = false;

  constructor() {
    // Configuration for Neo4j connection
    const uri = process.env.NEO4J_URI || 'bolt://localhost:7687';
    const user = process.env.NEO4J_USER || 'neo4j';
    const password = process.env.NEO4J_PASSWORD || 'password'; // Use a strong password in production

    this.driver = neo4j.driver(uri, neo4j.auth.basic(user, password));
    console.log('Neo4jService initialized with URI:', uri);
  }

  async initialize(): Promise<void> {
    if (this.initialized) {
      console.log('Neo4jService already initialized.');
      return;
    }
    try {
      // Verify connectivity
      await this.driver.verifyConnectivity();
      this.initialized = true;
      console.log(' Neo4j connection established successfully.');
    } catch (error) {
      console.error(' Failed to connect to Neo4j:', error);
      throw error;
    }
  }

  async close(): Promise<void> {
    if (this.driver) {
      await this.driver.close();
      this.initialized = false;
      console.log(' Neo4j connection closed.');
    }
  }

  // --- Basic CRUD Operations (to be expanded) ---

  async createNode(label: string, properties: Record<string, any>): Promise<any> {
    const session = this.driver.session();
    try {
      const result = await session.run(
        `CREATE (n:${label} $properties) RETURN n`,
        { properties }
      );
      return result.records[0].get('n').properties;
    } finally {
      await session.close();
    }
  }

  async createRelationship(
    fromNodeId: string,
    fromNodeLabel: string,
    toNodeId: string,
    toNodeLabel: string,
    relationshipType: string,
    properties: Record<string, any> = {}
  ): Promise<any> {
    const session = this.driver.session();
    try {
      const query = `
        MATCH (a:${fromNodeLabel}), (b:${toNodeLabel})
        WHERE a.id = $fromNodeId AND b.id = $toNodeId
        CREATE (a)-[r:${relationshipType} $properties]->(b)
        RETURN r
      `;
      const result = await session.run(query, { fromNodeId, toNodeId, properties });
      return result.records[0].get('r').properties;
    } finally {
      await session.close();
    }
  }

  async findNode(label: string, property: string, value: any): Promise<any | null> {
    const session = this.driver.session();
    try {
      const result = await session.run(
        `MATCH (n:${label} {${property}: $value}) RETURN n LIMIT 1`,
        { value }
      );
      return result.records.length > 0 ? result.records[0].get('n').properties : null;
    } finally {
      await session.close();
    }
  }

  // Add more advanced query methods as needed for graph traversal and reasoning
}

// Export singleton instance
let neo4jServiceInstance: Neo4jService | null = null;

export function getNeo4jService(): Neo4jService {
  if (!neo4jServiceInstance) {
    neo4jServiceInstance = new Neo4jService();
  }
  return neo4jServiceInstance;
}
