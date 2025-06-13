import { ExtractedEntity, ExtractedRelationship } from './llm-service';
import { KgNode } from '../types/knowledge-graph';
import { KgRelationship } from '../types/knowledge-graph';

export function convertExtractedEntityToKgNode(entity: ExtractedEntity): KgNode {
  return {
    id: entity.id,
    type: entity.label, // Convert label -> type
    properties: entity.properties,
    createdAt: new Date()
  };
}

export function convertExtractedRelationshipToKgRelationship(rel: ExtractedRelationship): KgRelationship {
  return {
    id: rel.id || `${rel.sourceEntityId}_${rel.type}_${rel.targetEntityId}`, // Generate ID if not provided
    type: rel.type,
    sourceNodeId: rel.sourceEntityId,
    targetNodeId: rel.targetEntityId,
    properties: rel.properties || {},
    createdAt: new Date()
  };
}
