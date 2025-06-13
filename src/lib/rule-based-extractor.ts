import { ExtractedEntity, ExtractedRelationship } from './llm-service'; // Assuming these are compatible
import { ToolCall } from '@/types/chat'; // Assuming this is the type for toolInvocations JSON
import { ConsciousMemory, ConsciousMemoryMetadata } from '@/types/memory'; // For ConsciousMemory types
import { randomUUID } from 'crypto'; // For generating unique IDs
import { createHash } from 'crypto'; // For hashing file paths

// Re-export for consistency, or define specific ones if they diverge
export type { ExtractedEntity, ExtractedRelationship };

export interface RuleBasedExtractionResult {
  entities: ExtractedEntity[];
  relationships: ExtractedRelationship[];
}

/**
 * Generates a unique ID for an entity based on its properties to ensure idempotency if possible.
 * For file paths, it uses a hash. For tags, it uses the tag name.
 * For others, it might use a combination of type and a primary property or a UUID.
 */
export function generateEntityId(label: string, primaryProperty: string | Record<string, any>): string {
  if (label === 'FilePath' && typeof primaryProperty === 'string') {
    return `filepath-${createHash('sha256').update(primaryProperty).digest('hex').substring(0, 16)}`;
  }
  if (label === 'Tag' && typeof primaryProperty === 'string') {
    // Normalize tag name for ID generation (e.g., lowercase, remove spaces)
    const normalizedTagName = primaryProperty.toLowerCase().replace(/\s+/g, '-');
    return `tag-${normalizedTagName}`;
  }
  if (label === 'Tool' && typeof primaryProperty === 'string') {
    return `tool-${primaryProperty.replace(/_/g, '-')}`;
  }
  // For tool invocations, a random ID is more appropriate as they are unique events
  if (label === 'ToolInvocation') {
     return `inv-${randomUUID()}`;
  }
   if (label === 'ConsciousMemory' && typeof primaryProperty === 'string') {
    return `cm-${primaryProperty}`;
  }
  if (label === 'Session' && typeof primaryProperty === 'string') {
    return `session-${primaryProperty}`;
  }
  // Fallback for other types or if primaryProperty is complex
  return `${label.toLowerCase()}-${randomUUID()}`;
}


/**
 * Extracts entities and relationships from tool invocation data.
 */
export function extractToolInvocations(toolInvocationsJson: string): RuleBasedExtractionResult {
  const entities: ExtractedEntity[] = [];
  const relationships: ExtractedRelationship[] = [];

  try {
    const toolCalls: ToolCall[] = JSON.parse(toolInvocationsJson);

    for (const toolCall of toolCalls) {
      const toolName = toolCall.toolName; // e.g., "conscious-memory_save_memory"
      const [server, ...restOfName] = toolName.split('_');
      const actualToolName = restOfName.join('_');

      // 1. Create Tool entity
      const toolId = generateEntityId('Tool', toolName);
      entities.push({
        id: toolId,
        label: 'Tool',
        properties: {
          name: actualToolName,
          server: server,
          fullToolName: toolName,
        },
      });

      // 2. Create ToolInvocation entity
      const invocationId = generateEntityId('ToolInvocation', toolName); // Each invocation is unique
      entities.push({
        id: invocationId,
        label: 'ToolInvocation',
        properties: {
          toolName: toolName,
          toolId: toolId, // Link to the tool entity's ID
          args: toolCall.args, // Store args as string or parsed object
          result: toolCall.result, // Store result as string or parsed object
        },
      });

      // 3. Create Relationship: (ToolInvocation)-[:OF_TYPE]->(Tool)
      relationships.push({
        id: `rel-${invocationId}-${toolId}`,
        sourceEntityId: invocationId,
        targetEntityId: toolId,
        type: 'OF_TYPE',
        properties: {},
      });

      // TODO: Consider if arguments or results of tool calls might contain other identifiable entities
      // For example, if args contain a memoryId, create a relationship to that memory.
      // This would require more sophisticated parsing of args and results.
    }
  } catch (error) {
    console.error('Error extracting from tool invocations:', error);
    // Optionally, return partial results or an error indicator
  }

  return { entities, relationships };
}

/**
 * Extracts FilePath entities from a string of text using regular expressions.
 */
export function extractFilePaths(text: string): RuleBasedExtractionResult {
  const entities: ExtractedEntity[] = [];
  const filePathRegex = /(\/[^\s"'<>()]*\.\w+|\b(?:[a-zA-Z]:)?(?:[\/\\][^<>:"|?*]*)+?\.\w+\b|[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+\.\w+)/g;
  // Regex explanation:
  // (\/[^\s"'<>()]*\.\w+) : Absolute paths starting with / followed by non-whitespace/quote/bracket chars, ending with .extension
  // | : OR
  // \b(?:[a-zA-Z]:)?(?:[\/\\][^<>:"|?*]*)+?\.\w+\b : Windows paths (optional drive letter) or relative paths using / or \, ending with .extension
  // | : OR
  // [a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+\.\w+ : Simple relative paths like "src/file.ts"

  let match;
  const addedPaths = new Set<string>(); // To avoid duplicate entities for the same path

  try {
    while ((match = filePathRegex.exec(text)) !== null) {
      const pathString = match[0];
      if (addedPaths.has(pathString)) continue;

      const parts = pathString.split(/[/\\]/);
      const filename = parts.pop() || '';
      const extension = filename.includes('.') ? filename.substring(filename.lastIndexOf('.')) : '';
      // Basic check for type, could be improved
      const type = extension === '' && !filename.includes('.') ? 'directory' : 'file';


      const pathId = generateEntityId('FilePath', pathString);
      entities.push({
        id: pathId,
        label: 'FilePath',
        properties: {
          path: pathString,
          filename: filename,
          extension: extension,
          type: type,
          // TODO: Add heuristics to determine if it's an absolute or relative path
        },
      });
      addedPaths.add(pathString);
    }
  } catch (error) {
    console.error('Error extracting file paths:', error);
  }
  return { entities, relationships: [] }; // No relationships from this extractor alone
}


/**
 * Extracts entities and relationships from ConsciousMemory metadata.
 */
export function extractFromConsciousMemory(memory: ConsciousMemory): RuleBasedExtractionResult {
  const entities: ExtractedEntity[] = [];
  const relationships: ExtractedRelationship[] = [];

  if (!memory || !memory.id || !memory.metadata) {
    console.warn('Invalid ConsciousMemory object provided for extraction.');
    return { entities, relationships };
  }

  try {
    // 1. Create ConsciousMemory node
    const cmId = generateEntityId('ConsciousMemory', memory.id);
    entities.push({
      id: cmId,
      label: 'ConsciousMemory',
      properties: {
        memoryId: memory.id, // Original ID
        content: memory.content, // Full content
        importance: memory.metadata.importance,
        source: memory.metadata.source,
        context: memory.metadata.context,
        createdAt: memory.metadata.createdAt,
        updatedAt: memory.metadata.updatedAt,
        lastAccessedAt: memory.metadata.lastAccessedAt,
      },
    });

    // 2. Tags
    if (memory.metadata.tags) {
      for (const tagName of memory.metadata.tags) {
        if (!tagName.trim()) continue; // Skip empty tags
        const tagId = generateEntityId('Tag', tagName);
        entities.push({
          id: tagId,
          label: 'Tag',
          properties: { name: tagName.trim() },
        });
        relationships.push({
          id: `rel-${cmId}-has_tag-${tagId}`,
          sourceEntityId: cmId,
          targetEntityId: tagId,
          type: 'HAS_TAG',
          properties: {},
        });
      }
    }

    // 3. Related Memory IDs
    if (memory.metadata.relatedMemoryIds) {
      for (const relatedId of memory.metadata.relatedMemoryIds) {
        if (!relatedId.trim()) continue;
        const targetCmId = generateEntityId('ConsciousMemory', relatedId);
        // We don't create the target ConsciousMemory node here, just the relationship.
        // The sync service will ensure all CM nodes are created.
        relationships.push({
          id: `rel-${cmId}-related_to-${targetCmId}`,
          sourceEntityId: cmId,
          targetEntityId: targetCmId, // Points to the ID of another ConsciousMemory entity
          type: 'RELATED_TO',
          properties: {},
        });
      }
    }

    // 4. Session ID
    if (memory.metadata.sessionId) {
      const sessionIdValue = memory.metadata.sessionId;
      const sessionId = generateEntityId('Session', sessionIdValue);
      // Check if Session entity already exists to avoid duplicates if processing multiple memories from the same session
      if (!entities.find(e => e.id === sessionId)) {
         entities.push({
            id: sessionId,
            label: 'Session',
            properties: { sessionId: sessionIdValue },
         });
      }
      relationships.push({
        id: `rel-${cmId}-part_of_session-${sessionId}`,
        sourceEntityId: cmId,
        targetEntityId: sessionId,
        type: 'PART_OF_SESSION',
        properties: {},
      });
    }

    // 5. Extract purposeful relationships from memory content
    const userId = 'User_Default'; // Default user entity - can be enhanced with actual user identification
    
    // Extract LEARNED_ABOUT relationships from content containing learning signals
    if (memory.content.match(/(?:I learned|I understand|I now know|I've learned|I figured out)/i)) {
      // Extract potential concepts being learned
      const concepts = extractConceptsFromText(memory.content);
      
      for (const concept of concepts) {
        const conceptId = generateEntityId('Concept', concept);
        entities.push({
          id: conceptId,
          label: 'Concept',
          properties: { name: concept }
        });
        
        relationships.push({
          id: `rel-${userId}-learned-${conceptId}`,
          sourceEntityId: userId,
          targetEntityId: conceptId,
          type: 'LEARNED_ABOUT',
          properties: {}
        });
      }
    }

    // Extract PREFERS relationships from content containing preference signals
    if (memory.content.match(/(?:I prefer|I like|I favor|I'd rather|my preference)/i)) {
      // Extract potential preferences
      const preferences = extractPreferencesFromText(memory.content);
      
      for (const preference of preferences) {
        const preferenceId = generateEntityId('Preference', preference);
        entities.push({
          id: preferenceId,
          label: 'Preference',
          properties: { name: preference }
        });
        
        relationships.push({
          id: `rel-${userId}-prefers-${preferenceId}`,
          sourceEntityId: userId,
          targetEntityId: preferenceId,
          type: 'PREFERS',
          properties: {}
        });
      }
    }

    // Extract WORKS_ON relationships from content containing project indicators
    if (memory.content.match(/(?:working on|developing|building|creating|implementing)/i)) {
      const projects = extractProjectsFromText(memory.content);
      
      for (const project of projects) {
        const projectId = generateEntityId('Project', project);
        entities.push({
          id: projectId,
          label: 'Project',
          properties: { name: project }
        });
        
        relationships.push({
          id: `rel-${userId}-works_on-${projectId}`,
          sourceEntityId: userId,
          targetEntityId: projectId,
          type: 'WORKS_ON',
          properties: {}
        });
      }
    }

    // Extract USES relationships from content containing tool/technology mentions
    if (memory.content.match(/(?:using|utilize|work with|implement with)/i)) {
      const tools = extractToolsFromText(memory.content);
      
      for (const tool of tools) {
        const toolId = generateEntityId('Tool', tool);
        entities.push({
          id: toolId,
          label: 'Tool',
          properties: { name: tool }
        });
        
        relationships.push({
          id: `rel-${userId}-uses-${toolId}`,
          sourceEntityId: userId,
          targetEntityId: toolId,
          type: 'USES',
          properties: {}
        });
      }
    }

  } catch (error) {
    console.error(`Error extracting from conscious memory ${memory.id}:`, error);
  }

  return { entities, relationships };
}


/**
 * Main function to apply all rule-based extractors.
 * This can be expanded to take more specific inputs if needed.
 */
export function extractUsingRules(
  textPayload?: string, // For general text analysis like file paths
  toolInvocationsPayload?: string, // JSON string of tool invocations
  consciousMemoryPayload?: ConsciousMemory // Full ConsciousMemory object
): RuleBasedExtractionResult {
  let allEntities: ExtractedEntity[] = [];
  let allRelationships: ExtractedRelationship[] = [];
  const entityIds = new Set<string>(); // To help deduplicate entities by ID

  const addResults = (result: RuleBasedExtractionResult) => {
    result.entities.forEach(entity => {
      if (!entityIds.has(entity.id)) {
        allEntities.push(entity);
        entityIds.add(entity.id);
      } else {
        // Optionally merge properties if an entity with the same ID is found
        // This requires a more complex merging strategy. For now, we keep the first one.
      }
    });
    allRelationships.push(...result.relationships);
  };

  if (textPayload) {
    addResults(extractFilePaths(textPayload));
    // Potentially other text-based rule extractors could be called here
  }

  if (toolInvocationsPayload) {
    addResults(extractToolInvocations(toolInvocationsPayload));
  }

  if (consciousMemoryPayload) {
    addResults(extractFromConsciousMemory(consciousMemoryPayload));
  }

  // Deduplicate relationships (simple deduplication based on ID for now)
  // More complex relationship deduplication might consider source, target, and type.
  const uniqueRelationshipIds = new Set<string>();
  allRelationships = allRelationships.filter(rel => {
    const relKey = rel.id || `${rel.sourceEntityId}-${rel.type}-${rel.targetEntityId}`; // Fallback key if id is not present
    if (!uniqueRelationshipIds.has(relKey)) {
      uniqueRelationshipIds.add(relKey);
      return true;
    }
    return false;
  });


  return { entities: allEntities, relationships: allRelationships };
}

// Helper functions to extract concepts, preferences, projects, and tools
function extractConceptsFromText(text: string): string[] {
  const concepts: string[] = [];
  // Simple regex to find noun phrases following learning signals
  const matches = text.match(/(?:learned|understand|know about|figured out)\s+(?:about\s+)?([a-zA-Z0-9\s]+?)(?:\.|,|;|$)/gi);
  if (matches) {
    matches.forEach(match => {
      const concept = match.replace(/(?:learned|understand|know about|figured out)\s+(?:about\s+)?/i, '').trim();
      if (concept && concept.length > 2 && concept.length < 50) {
        concepts.push(concept);
      }
    });
  }
  return [...new Set(concepts)]; // Remove duplicates
}

function extractPreferencesFromText(text: string): string[] {
  const preferences: string[] = [];
  // Extract preferences
  const matches = text.match(/(?:prefer|like|favor)\s+(?:using\s+)?([a-zA-Z0-9\s]+?)(?:\s+over|\s+instead|\.|,|;|$)/gi);
  if (matches) {
    matches.forEach(match => {
      const preference = match.replace(/(?:prefer|like|favor)\s+(?:using\s+)?/i, '')
        .replace(/\s+over.*$|\s+instead.*$/i, '')
        .trim();
      if (preference && preference.length > 2 && preference.length < 50) {
        preferences.push(preference);
      }
    });
  }
  return [...new Set(preferences)];
}

function extractProjectsFromText(text: string): string[] {
  const projects: string[] = [];
  // Extract project names
  const matches = text.match(/(?:working on|developing|building|creating|implementing)\s+(?:the\s+)?([a-zA-Z0-9\-_\s]+?)(?:\s+project|\s+app|\s+application|\s+system|\.|,|;|$)/gi);
  if (matches) {
    matches.forEach(match => {
      const project = match.replace(/(?:working on|developing|building|creating|implementing)\s+(?:the\s+)?/i, '')
        .replace(/\s+project|\s+app|\s+application|\s+system/i, '')
        .trim();
      if (project && project.length > 2 && project.length < 50) {
        projects.push(project);
      }
    });
  }
  return [...new Set(projects)];
}

function extractToolsFromText(text: string): string[] {
  const tools: string[] = [];
  // Common development tools and technologies
  const knownTools = [
    'React', 'Vue', 'Angular', 'TypeScript', 'JavaScript', 'Python', 'Java', 'C#', 'C++',
    'Node.js', 'Express', 'Django', 'Flask', 'Spring', 'ASP.NET', 'Ruby on Rails',
    'MongoDB', 'PostgreSQL', 'MySQL', 'Redis', 'Neo4j', 'ChromaDB',
    'Docker', 'Kubernetes', 'AWS', 'Azure', 'GCP', 'Git', 'GitHub', 'VSCode', 'IntelliJ',
    'Next.js', 'Gatsby', 'Webpack', 'Vite', 'Jest', 'Cypress', 'Playwright'
  ];
  
  // Check for known tools in the text
  knownTools.forEach(tool => {
    const regex = new RegExp(`\\b${tool}\\b`, 'i');
    if (regex.test(text)) {
      tools.push(tool);
    }
  });
  
  // Also try to extract tools from "using X" patterns
  const matches = text.match(/(?:using|utilize|work with|implement with)\s+([a-zA-Z0-9\.\-]+)/gi);
  if (matches) {
    matches.forEach(match => {
      const tool = match.replace(/(?:using|utilize|work with|implement with)\s+/i, '').trim();
      if (tool && tool.length > 1 && tool.length < 30 && !tools.includes(tool)) {
        tools.push(tool);
      }
    });
  }
  
  return [...new Set(tools)];
}
