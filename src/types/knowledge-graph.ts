export interface KgNode {
  id: string;
  type: string; // e.g., 'Person', 'Organization', 'Memory', 'Concept'
  properties: Record<string, any>; // Flexible properties
  createdAt?: Date; // Optional, can be set by the service
  updatedAt?: Date; // Optional, can be set by the service
}

// You can add other related types here as they become necessary,
// for example, for relationships:
export interface KgRelationship {
  id?: string; // Optional, Neo4j can auto-generate
  type: string; // e.g., 'WORKS_FOR', 'RELATED_TO'
  sourceNodeId: string;
  targetNodeId: string;
  properties?: Record<string, any>;
  createdAt?: Date;
  updatedAt?: Date;
}
