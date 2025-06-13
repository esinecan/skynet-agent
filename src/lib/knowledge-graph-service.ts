import neo4j, { Driver, Session } from 'neo4j-driver';
import { KgNode, KgRelationship } from '../types/knowledge-graph';

class KnowledgeGraphService {
  private driver: Driver | null = null;
  private session: Session | null = null;
  private initializationError: string | null = null;

  constructor() {
    // Don't throw during construction - defer to connect() method
    try {
      const uri = process.env.NEO4J_URI;
      const user = process.env.NEO4J_USER;
      const password = process.env.NEO4J_PASSWORD;

      if (!uri || !user || !password) {
        this.initializationError = 'Missing Neo4j connection details in environment variables (NEO4J_URI, NEO4J_USER, NEO4J_PASSWORD)';
        return;
      }

      this.driver = neo4j.driver(uri, neo4j.auth.basic(user, password));
    } catch (error) {
      this.initializationError = `Failed to initialize Neo4j driver: ${error}`;
    }
  }  async connect(): Promise<void> {
    if (this.initializationError) {
      console.warn('[KG Service] Initialization previously failed:', this.initializationError);
      // Don't throw here, allow operation with reduced functionality
      return;
    }

    if (!this.driver) {
      try {
        const uri = process.env.NEO4J_URI || 'bolt://localhost:7687';
        const user = process.env.NEO4J_USER || 'neo4j';
        const password = process.env.NEO4J_PASSWORD || 'password';
        
        this.driver = neo4j.driver(uri, neo4j.auth.basic(user, password), {
          maxConnectionLifetime: 3 * 60 * 60 * 1000, // 3 hours
          maxConnectionPoolSize: 50,
          connectionAcquisitionTimeout: 10 * 1000, // 10 seconds
        });
        
        console.log('[KG Service] Neo4j driver created');
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error('[KG Service] Failed to create Neo4j driver:', errorMessage);
        this.initializationError = errorMessage;
        // Don't throw, allow operation with reduced functionality
        return;
      }
    }

    if (this.session) {
      try {
        await this.session.close();
      } catch (error) {
        console.warn('[KG Service] Error closing existing session:', error);
      }
      this.session = null;
    }

    try {
      await this.driver.verifyConnectivity();
      this.session = this.driver.session();
      console.log('Successfully connected to Neo4j');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('[KG Service] Failed to connect to Neo4j:', errorMessage);
      this.initializationError = errorMessage;
      // Don't throw, allow operation with reduced functionality
      return;
    }
  }  async close(): Promise<void> {
    try {
      if (this.session) {
        await this.session.close();
        this.session = null;
        console.log('Neo4j session closed');
      }
    } catch (error) {
      console.error('[KG Service] Error closing Neo4j session:', error);
    }
    
    try {      if (this.driver) {
        await this.driver.close();
        this.driver = null;
        console.log('Neo4j driver closed');
      }
    } catch (error) {
      console.error('[KG Service] Error closing Neo4j driver:', error);
    }
  }

  // Placeholder for adding a node
  async addNode(node: KgNode): Promise<KgNode> {
    if (!this.session) await this.connect();

    // Serialize any Date objects to ISO strings for Neo4j compatibility
    const sanitizedProperties = this.sanitizeProperties({
      ...node.properties, 
      createdAt: node.createdAt ? node.createdAt.toISOString() : new Date().toISOString()
    });

    const query = `
      MERGE (n:${node.type} {id: $id})
      SET n += $properties, n.updatedAt = datetime()
      RETURN n
    `;

    const result = await this.session!.run(query, {
      id: node.id,
      properties: sanitizedProperties
    });

    // Note: The provided snippet returns the input 'node'.
    // Depending on driver specifics and desired return value,
    // you might want to map the result from Neo4j back to a KgNode.
    // For now, sticking to the provided snippet.
    return node;
  }

  // Batch add nodes for improved performance
  async addNodesBatch(nodes: KgNode[]): Promise<{ succeeded: number; failed: number }> {
    if (!this.session) await this.connect();
    
    const query = `
      UNWIND $nodes AS node
      MERGE (n {id: node.id})
      SET n = node.properties, n:${nodes[0]?.type || 'Node'}, n.updatedAt = datetime()
      RETURN n.id as nodeId
    `;
    
    // Prepare nodes with sanitized properties
    const sanitizedNodes = nodes.map(node => ({
      id: node.id,
      properties: this.sanitizeProperties({
        ...node.properties,
        id: node.id,
        createdAt: node.createdAt ? node.createdAt.toISOString() : new Date().toISOString()
      })
    }));
    
    try {
      const result = await this.session!.run(query, { nodes: sanitizedNodes });
      return { succeeded: result.records.length, failed: nodes.length - result.records.length };
    } catch (error) {
      console.error('[KG Service] Batch node insertion failed:', error);
      return { succeeded: 0, failed: nodes.length };
    }
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

    // Sanitize relationship properties for Neo4j compatibility
    const sanitizedProperties = this.sanitizeProperties(relationship.properties || {});

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
      properties: sanitizedProperties
    });
  }

  // Batch add relationships for improved performance
  async addRelationshipsBatch(relationships: KgRelationship[]): Promise<{ succeeded: number; failed: number }> {
    if (!this.session) await this.connect();
    
    const query = `
      UNWIND $relationships AS rel
      MATCH (a {id: rel.sourceNodeId})
      MATCH (b {id: rel.targetNodeId})
      MERGE (a)-[r:RELATIONSHIP]->(b)
      SET r += rel.properties, r.type = rel.type, r.createdAt = datetime(), r.updatedAt = datetime()
      RETURN a.id as sourceId, b.id as targetId
    `;
    
    // Prepare relationships with sanitized properties
    const sanitizedRelationships = relationships.map(rel => ({
      sourceNodeId: rel.sourceNodeId,
      targetNodeId: rel.targetNodeId,
      type: rel.type,
      properties: this.sanitizeProperties({
        ...rel.properties,
        type: rel.type
      })
    }));
    
    try {
      const result = await this.session!.run(query, { relationships: sanitizedRelationships });
      return { succeeded: result.records.length, failed: relationships.length - result.records.length };
    } catch (error) {
      console.error('[KG Service] Batch relationship insertion failed:', error);
      return { succeeded: 0, failed: relationships.length };
    }
  }

  // Find node by ID
  async findNodeById(nodeId: string): Promise<KgNode | null> {
    if (!this.session) await this.connect();
    
    const query = `
      MATCH (n {id: $nodeId})
      RETURN n, labels(n) as labels
    `;
    
    try {
      const result = await this.session!.run(query, { nodeId });
      if (result.records.length === 0) {
        return null;
      }
      
      const record = result.records[0];
      const nodeData = record.get('n').properties;
      const labels = record.get('labels') as string[];
      
      return {
        id: nodeData.id,
        type: labels[0] || 'Node',
        properties: nodeData,
        createdAt: nodeData.createdAt ? new Date(nodeData.createdAt) : undefined,
        updatedAt: nodeData.updatedAt ? new Date(nodeData.updatedAt) : undefined
      };
    } catch (error) {
      console.error(`[KG Service] Error finding node ${nodeId}:`, error);
      return null;
    }
  }
  
  // Enhanced node deletion with safety and cascade options
  async deleteNode(nodeId: string, options?: {
    nodeType?: string;
    cascadeDelete?: boolean;
    skipDependencyCheck?: boolean;
  }): Promise<{ deleted: boolean; reason?: string }> {
    if (!this.session) await this.connect();
    
    const { nodeType, cascadeDelete = false, skipDependencyCheck = false } = options || {};
    
    console.log(`[KnowledgeGraphService] Attempting to delete node with ID: ${nodeId}${nodeType ? ` (type: ${nodeType})` : ''}`);
    
    try {
      // Safety check: verify node exists and get its type
      const nodeCheckQuery = nodeType 
        ? `MATCH (n:${nodeType} {id: $nodeId}) RETURN n, labels(n) as labels`
        : `MATCH (n {id: $nodeId}) RETURN n, labels(n) as labels`;
      
      const nodeCheckResult = await this.session!.run(nodeCheckQuery, { nodeId });
      
      if (nodeCheckResult.records.length === 0) {
        console.log(`[KnowledgeGraphService] Node ${nodeId} not found`);
        return { deleted: false, reason: 'Node not found' };
      }
      
      const nodeLabels = nodeCheckResult.records[0].get('labels') as string[];
      console.log(`[KnowledgeGraphService] Found node ${nodeId} with labels: ${nodeLabels.join(', ')}`);
      
      // Dependency check (unless skipped)
      if (!skipDependencyCheck && !cascadeDelete) {
        const dependencyCheck = await this.checkNodeDependencies(nodeId);
        if (dependencyCheck.hasIncomingRelationships) {
          console.log(`[KnowledgeGraphService] Node ${nodeId} has incoming relationships, aborting deletion`);
          return { 
            deleted: false, 
            reason: `Node has ${dependencyCheck.incomingCount} incoming relationships. Use cascadeDelete=true or delete relationships first.` 
          };
        }
      }
      
      // Perform deletion
      let deleteQuery: string;
      if (cascadeDelete) {
        // Delete node and all its relationships
        deleteQuery = nodeType 
          ? `MATCH (n:${nodeType} {id: $nodeId}) DETACH DELETE n RETURN count(n) as deletedCount`
          : `MATCH (n {id: $nodeId}) DETACH DELETE n RETURN count(n) as deletedCount`;
      } else {
        // Delete only outgoing relationships and the node (safer)
        deleteQuery = nodeType
          ? `MATCH (n:${nodeType} {id: $nodeId}) DETACH DELETE n RETURN count(n) as deletedCount`
          : `MATCH (n {id: $nodeId}) DETACH DELETE n RETURN count(n) as deletedCount`;
      }
      
      const deleteResult = await this.session!.run(deleteQuery, { nodeId });
      const deletedCount = deleteResult.records[0]?.get('deletedCount')?.toNumber() || 0;
      
      if (deletedCount > 0) {
        console.log(`[KnowledgeGraphService] Successfully deleted node with ID: ${nodeId}`);
        return { deleted: true };
      } else {
        console.log(`[KnowledgeGraphService] Failed to delete node with ID: ${nodeId}`);
        return { deleted: false, reason: 'Delete operation returned 0 affected nodes' };
      }
      
    } catch (error) {
      console.error(`[KnowledgeGraphService] Error deleting node ${nodeId}:`, error);
      throw error;
    }
  }

  // Check if a node has dependencies (incoming relationships)
  async checkNodeDependencies(nodeId: string): Promise<{
    hasIncomingRelationships: boolean;
    incomingCount: number;
    outgoingCount: number;
    relationshipTypes: string[];
  }> {
    if (!this.session) await this.connect();
    
    const query = `
      MATCH (n {id: $nodeId})
      OPTIONAL MATCH (other)-[incoming]->(n)
      OPTIONAL MATCH (n)-[outgoing]->(target)
      RETURN 
        count(DISTINCT incoming) as incomingCount,
        count(DISTINCT outgoing) as outgoingCount,
        collect(DISTINCT type(incoming)) as incomingTypes,
        collect(DISTINCT type(outgoing)) as outgoingTypes
    `;
    
    const result = await this.session!.run(query, { nodeId });
    const record = result.records[0];
    
    const incomingCount = record.get('incomingCount').toNumber();
    const outgoingCount = record.get('outgoingCount').toNumber();
    const incomingTypes = record.get('incomingTypes').filter((t: string) => t !== null);
    const outgoingTypes = record.get('outgoingTypes').filter((t: string) => t !== null);
    
    return {
      hasIncomingRelationships: incomingCount > 0,
      incomingCount,
      outgoingCount,
      relationshipTypes: [...new Set([...incomingTypes, ...outgoingTypes])]
    };
  }

  // Delete a specific relationship between two nodes
  async deleteRelationship(sourceNodeId: string, targetNodeId: string, relationshipType?: string): Promise<{
    deleted: boolean;
    deletedCount: number;
  }> {
    if (!this.session) await this.connect();
    
    const query = relationshipType
      ? `
        MATCH (a {id: $sourceNodeId})-[r:${relationshipType}]->(b {id: $targetNodeId})
        DELETE r
        RETURN count(r) as deletedCount
      `
      : `
        MATCH (a {id: $sourceNodeId})-[r]->(b {id: $targetNodeId})
        DELETE r
        RETURN count(r) as deletedCount
      `;
    
    const result = await this.session!.run(query, { sourceNodeId, targetNodeId });
    const deletedCount = result.records[0]?.get('deletedCount')?.toNumber() || 0;
    
    console.log(`[KnowledgeGraphService] Deleted ${deletedCount} relationship(s) from ${sourceNodeId} to ${targetNodeId}`);
    
    return {
      deleted: deletedCount > 0,
      deletedCount
    };
  }

  // Batch delete nodes by type and optional filter
  async deleteNodesByType(nodeType: string, filter?: Record<string, any>): Promise<{
    deletedCount: number;
  }> {
    if (!this.session) await this.connect();
    
    let query = `MATCH (n:${nodeType})`;
    const parameters: Record<string, any> = {};
    
    if (filter && Object.keys(filter).length > 0) {
      const sanitizedFilter = this.sanitizeProperties(filter);
      const whereConditions = Object.keys(sanitizedFilter).map(key => {
        parameters[key] = sanitizedFilter[key];
        return `n.${key} = $${key}`;
      });
      query += ` WHERE ${whereConditions.join(' AND ')}`;
    }
    
    query += ` DETACH DELETE n RETURN count(n) as deletedCount`;
    
    const result = await this.session!.run(query, parameters);
    const deletedCount = result.records[0]?.get('deletedCount')?.toNumber() || 0;
    
    console.log(`[KnowledgeGraphService] Deleted ${deletedCount} nodes of type ${nodeType}`);
    
    return { deletedCount };
  }

  // Cascade delete a session and all related data
  async cascadeDeleteSession(sessionId: string): Promise<{
    deletedNodes: number;
    deletedRelationships: number;
  }> {
    if (!this.session) await this.connect();
    
    console.log(`[KnowledgeGraphService] Starting cascade deletion of session ${sessionId}`);
    
    // First, get counts for reporting
    const countQuery = `
      MATCH (session:Session {id: $sessionId})
      OPTIONAL MATCH (session)-[:HAS_MESSAGE]->(message:Message)
      OPTIONAL MATCH (message)-[:INVOKES_TOOL]->(toolInv:ToolInvocation)
      OPTIONAL MATCH (message)-[:HAS_ATTACHMENT]->(file:File)
      OPTIONAL MATCH (memory:Memory)-[:FROM_SESSION]->(session)
      RETURN 
        count(DISTINCT session) as sessionCount,
        count(DISTINCT message) as messageCount,
        count(DISTINCT toolInv) as toolInvCount,
        count(DISTINCT file) as fileCount,
        count(DISTINCT memory) as memoryCount
    `;
    
    const countResult = await this.session!.run(countQuery, { sessionId });
    const counts = countResult.records[0];
    
    // Perform cascade deletion
    const deleteQuery = `
      MATCH (session:Session {id: $sessionId})
      OPTIONAL MATCH (session)-[:HAS_MESSAGE]->(message:Message)
      OPTIONAL MATCH (message)-[:INVOKES_TOOL]->(toolInv:ToolInvocation)
      OPTIONAL MATCH (message)-[:HAS_ATTACHMENT]->(file:File)
      OPTIONAL MATCH (memory:Memory)-[:FROM_SESSION]->(session)
      DETACH DELETE session, message, toolInv, file, memory
      RETURN count(*) as totalDeleted
    `;
    
    const deleteResult = await this.session!.run(deleteQuery, { sessionId });
    const totalDeleted = deleteResult.records[0]?.get('totalDeleted')?.toNumber() || 0;
    
    console.log(`[KnowledgeGraphService] Cascade deletion complete:`, {
      sessionId,
      deletedNodes: totalDeleted,
      breakdown: {
        sessions: counts.get('sessionCount').toNumber(),
        messages: counts.get('messageCount').toNumber(),
        toolInvocations: counts.get('toolInvCount').toNumber(),
        files: counts.get('fileCount').toNumber(),
        memories: counts.get('memoryCount').toNumber()
      }
    });
    
    return {
      deletedNodes: totalDeleted,
      deletedRelationships: 0 // Relationships are automatically deleted with DETACH DELETE
    };
  }

  // Clean up orphaned nodes (nodes with no relationships)
  async cleanupOrphanedNodes(excludeNodeTypes: string[] = []): Promise<{
    deletedCount: number;
    deletedNodeTypes: Record<string, number>;
  }> {
    if (!this.session) await this.connect();
    
    console.log(`[KnowledgeGraphService] Starting orphaned node cleanup`);
    
    let query = `
      MATCH (n)
      WHERE NOT (n)--() 
    `;
    
    if (excludeNodeTypes.length > 0) {
      const excludeConditions = excludeNodeTypes.map(type => `NOT n:${type}`);
      query += ` AND ${excludeConditions.join(' AND ')}`;
    }
    
    query += `
      WITH n, labels(n) as nodeLabels
      DETACH DELETE n
      RETURN count(n) as deletedCount, collect(DISTINCT nodeLabels[0]) as deletedTypes
    `;
    
    const result = await this.session!.run(query);
    const deletedCount = result.records[0]?.get('deletedCount')?.toNumber() || 0;
    const deletedTypes = result.records[0]?.get('deletedTypes') || [];
    
    // Count by type for reporting
    const deletedNodeTypes: Record<string, number> = {};
    deletedTypes.forEach((type: string) => {
      deletedNodeTypes[type] = (deletedNodeTypes[type] || 0) + 1;
    });
    
    console.log(`[KnowledgeGraphService] Cleanup complete: deleted ${deletedCount} orphaned nodes`);
    
    return {
      deletedCount,
      deletedNodeTypes
    };
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
    
    // Automatically sanitize parameters for Neo4j compatibility
    const sanitizedParameters = parameters ? this.sanitizeProperties(parameters) : undefined;
    
    const session = this.session!;
    try {
      const result = await session.run(query, sanitizedParameters);
      return result.records.map(record => record.toObject());
    } catch (error) {
      console.error(`Error running query "${query}":`, error);
      throw error;
    }
  }  /**
   * Get database statistics for logging and monitoring
   */
  async getStatistics(): Promise<{
    nodeCount: number;
    relationshipCount: number;
    labels: string[];
    relationshipTypes: string[];
  }> {
    await this.connect();
    
    const nodeCountQuery = 'MATCH (n) RETURN count(n) as count';
    const relCountQuery = 'MATCH ()-[r]->() RETURN count(r) as count';
    const labelsQuery = 'CALL db.labels()';
    const relTypesQuery = 'CALL db.relationshipTypes()';
    
    // Run queries sequentially to avoid transaction conflicts
    const nodeResult = await this.session!.run(nodeCountQuery);
    const relResult = await this.session!.run(relCountQuery);
    const labelsResult = await this.session!.run(labelsQuery);
    const relTypesResult = await this.session!.run(relTypesQuery);
    
    return {
      nodeCount: nodeResult.records[0]?.get('count')?.toNumber() || 0,
      relationshipCount: relResult.records[0]?.get('count')?.toNumber() || 0,
      labels: labelsResult.records.map(record => record.get('label')),
      relationshipTypes: relTypesResult.records.map(record => record.get('relationshipType'))
    };
  }

  // Helper method to sanitize properties for Neo4j compatibility
  // Neo4j only supports: null, boolean, number, string, and arrays of these types
  private sanitizeProperties(properties: Record<string, any>): Record<string, any> {
    const sanitized: Record<string, any> = {};
    
    for (const [key, value] of Object.entries(properties)) {
      if (value === null || value === undefined) {
        sanitized[key] = null;
      } else if (typeof value === 'boolean' || typeof value === 'number' || typeof value === 'string') {
        // Primitive types are already compatible
        sanitized[key] = value;
      } else if (value instanceof Date) {
        // Convert Date objects to ISO strings
        sanitized[key] = value.toISOString();
      } else if (Array.isArray(value)) {
        // Recursively sanitize array elements
        sanitized[key] = value.map(item => {
          if (item === null || item === undefined) return null;
          if (typeof item === 'boolean' || typeof item === 'number' || typeof item === 'string') return item;
          if (item instanceof Date) return item.toISOString();
          if (typeof item === 'object') return JSON.stringify(item);
          return String(item); // Convert anything else to string as fallback
        });
      } else if (typeof value === 'object') {
        // Convert complex objects to JSON strings
        try {
          sanitized[key] = JSON.stringify(value);
        } catch (error) {
          console.warn(`Failed to serialize object property "${key}":`, error);
          sanitized[key] = String(value); // Fallback to string conversion
        }
      } else {
        // Convert any other type to string as fallback
        sanitized[key] = String(value);
      }
    }
    
    return sanitized;
  }
}

const knowledgeGraphService = new KnowledgeGraphService();
export default knowledgeGraphService;
