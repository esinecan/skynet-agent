import { createLogger } from '../utils/logger';

const logger = createLogger('mcpToolValidator');

/**
 * Validates and sanitizes tool schemas to ensure compatibility with LLM APIs
 */
export function validateAndSanitizeSchema(schema: any): any {
  const cleanId = Math.random().toString(36).substring(7);
  
  logger.debug('Schema validation started', {
    cleanId,
    schemaType: typeof schema,
    isArray: Array.isArray(schema),
    isNull: schema === null
  });

  // Return early for non-objects or null
  if (!schema || typeof schema !== 'object') {
    logger.debug('Non-object schema provided, returning default', { cleanId });
    return { type: 'object', properties: {}, additionalProperties: false };
  }

  try {
    // Deep clone to avoid modifying original
    const cleanedSchema = JSON.parse(JSON.stringify(schema));
    
    // Add specific provider compatibility fixes here
    // OpenAI requires 'additionalProperties' to be defined for objects
    if (cleanedSchema.type === 'object' && cleanedSchema.additionalProperties === undefined) {
      cleanedSchema.additionalProperties = false;
    }
    
    // Ensure there's a type field
    if (!cleanedSchema.type) {
      cleanedSchema.type = 'object';
    }
    
    // Process object schemas
    if (cleanedSchema.type === 'object') {
      // Ensure properties exists
      if (!cleanedSchema.properties) {
        cleanedSchema.properties = {};
      }
      
      // Handle required properties
      if (cleanedSchema.required && Array.isArray(cleanedSchema.required)) {
        const originalRequired = [...cleanedSchema.required];
        // Validate that required properties exist in properties
        cleanedSchema.required = originalRequired.filter(reqProp => {
          const exists = cleanedSchema.properties && cleanedSchema.properties[reqProp];
          if (!exists) {
            logger.warn(`Required property '${reqProp}' not found in properties, removing from required array`, { cleanId });
          }
          return exists;
        });
      }
      
      // Process nested properties
      if (cleanedSchema.properties && typeof cleanedSchema.properties === 'object') {
        const cleanedProperties: Record<string, any> = {};
        for (const [propName, propSchema] of Object.entries(cleanedSchema.properties)) {
          cleanedProperties[propName] = validateAndSanitizeSchema(propSchema);
        }
        cleanedSchema.properties = cleanedProperties;
      }
    }
    
    // Process array schemas
    if (cleanedSchema.type === 'array' && cleanedSchema.items) {
      cleanedSchema.items = validateAndSanitizeSchema(cleanedSchema.items);
    }
    
    // Handle union types with oneOf, anyOf, allOf
    for (const unionType of ['oneOf', 'anyOf', 'allOf']) {
      if (cleanedSchema[unionType] && Array.isArray(cleanedSchema[unionType])) {
        cleanedSchema[unionType] = cleanedSchema[unionType].map(
          (subSchema: any) => validateAndSanitizeSchema(subSchema)
        );
      }
    }
    
    // Remove unsupported fields for some LLM APIs
    const fieldsToRemove = ['$schema', '$id', 'examples', 'default'];
    for (const field of fieldsToRemove) {
      if (field in cleanedSchema) {
        delete cleanedSchema[field];
      }
    }
    
    logger.debug('Schema validation completed', { cleanId });
    
    return cleanedSchema;
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    logger.error('Schema validation failed', {
      cleanId,
      error: err.message, 
      stack: err.stack
    });
    
    // Return a minimal valid schema as fallback
    return { type: 'object', properties: {}, additionalProperties: false };
  }
}

function deepCleanSchema(obj: unknown, parentPath = ''): unknown {
  const cleanId = Math.random().toString(36).substring(7);
  
  logger.debug('Schema cleaning started', {
    cleanId,
    parentPath: parentPath || 'root',
    objType: typeof obj,
    isArray: Array.isArray(obj),
    isNull: obj === null
  });
  
  // Base case for non-objects
  if (!obj || typeof obj !== 'object') {
    logger.debug('Schema cleaning - primitive value', {
      cleanId,
      parentPath,
      type: typeof obj
    });
    return obj;
  }
  
  // Handle arrays
  if (Array.isArray(obj)) {
    logger.debug('Schema cleaning - array processing', {
      cleanId,
      parentPath,
      arrayLength: obj.length
    });
    
    const cleaned = obj.map((item, index) => 
      deepCleanSchema(item, `${parentPath}[${index}]`)
    );
    
    logger.debug('Schema cleaning - array completed', {
      cleanId,
      parentPath,
      originalLength: obj.length,
      cleanedLength: cleaned.length
    });
    
    return cleaned;
  }
  
  // Clone the object to avoid modifying the original
  const result = {...(obj as Record<string, unknown>)};
  const originalKeys = Object.keys(result);
  
  logger.debug('Schema cleaning - object processing', {
    cleanId,
    parentPath,
    keyCount: originalKeys.length,
    keys: originalKeys
  });
  
  // Special handling for parameters with required fields
  if (parentPath.endsWith('.parameters') && result.properties && result.required) {
    const originalRequired = [...((result.required as string[]) || [])];
    // Ensure required only references properties that exist
    const filteredRequired = (result.required as string[]).filter((prop: string) => 
      prop in ((result.properties as Record<string, unknown>) || {})
    );
    
    logger.debug('Schema cleaning - parameters required field cleaned', {
      cleanId,
      parentPath,
      originalRequired,
      filteredRequired,
      removedRequired: originalRequired.filter(prop => !filteredRequired.includes(prop))
    });
    
    if (filteredRequired.length === 0) {
      const { required, ...resultWithoutRequired } = result;
      Object.assign(result, resultWithoutRequired);
      logger.debug('Schema cleaning - removed empty required array from parameters', {
        cleanId,
        parentPath
      });
    } else {
      result.required = filteredRequired;
    }
  }
  
  // Special handling for objects with properties and required fields
  if (result.properties && result.required && !parentPath.endsWith('.parameters')) {
    const originalRequired = [...((result.required as string[]) || [])];
    // Ensure required only references properties that exist
    const filteredRequired = (result.required as string[]).filter((prop: string) =>
      prop in (result.properties as Record<string, unknown>)
    );
    
    logger.debug('Schema cleaning - object required field cleaned', {
      cleanId,
      parentPath,
      originalRequired,
      filteredRequired,
      availableProperties: Object.keys(result.properties as Record<string, unknown>)
    });
    
    if (filteredRequired.length === 0) {
      const { required, ...resultWithoutRequired } = result;
      Object.assign(result, resultWithoutRequired);
      logger.debug('Schema cleaning - removed empty required array from object', {
        cleanId,
        parentPath
      });
    } else {
      result.required = filteredRequired;
    }
  }
  
  // Recursively process all properties
  const processedKeys: string[] = [];
  for (const key of Object.keys(result)) {
    const newPath = parentPath ? `${parentPath}.${key}` : key;
    const originalValue = result[key];
    result[key] = deepCleanSchema(result[key], newPath);
    processedKeys.push(key);
    
    logger.debug('Schema cleaning - property processed', {
      cleanId,
      parentPath,
      key,
      newPath,
      originalType: typeof originalValue,
      processedType: typeof result[key]
    });
  }
  
  logger.debug('Schema cleaning - object completed', {
    cleanId,
    parentPath,
    processedKeys,
    resultKeys: Object.keys(result)
  });
  
  return result;
}

/**
 * Validates and sanitizes MCP tool schemas before sending to Gemini API
 */
interface ToolProperty {
  type?: string;
  required?: string[];
  properties?: Record<string, ToolProperty>;
  [key: string]: unknown;
}

interface ToolFunctionDeclaration {
  parameters?: {
    properties?: Record<string, ToolProperty>;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

interface ToolDefinitions {
  function_declarations?: ToolFunctionDeclaration[];
  [key: string]: unknown;
}

export function validateAndSanitizeTools(toolDefinitions: ToolDefinitions): ToolDefinitions {
  const startTime = Date.now();
  const validationId = Math.random().toString(36).substring(7);
  
  logger.debug('Tool validation and sanitization started', {
    validationId,
    hasToolDefinitions: !!toolDefinitions,
    hasFunctionDeclarations: !!(toolDefinitions?.function_declarations),
    functionCount: toolDefinitions?.function_declarations?.length || 0
  });
  
  if (!toolDefinitions || !toolDefinitions.function_declarations) {
    logger.debug('No tool definitions or function declarations to validate', {
      validationId,
      validationTimeMs: Date.now() - startTime
    });
    return toolDefinitions;
  }

  try {
    const originalCount = toolDefinitions.function_declarations.length;
    logger.debug('Starting deep schema cleaning', {
      validationId,
      originalFunctionCount: originalCount,
      toolDefinitionKeys: Object.keys(toolDefinitions)
    });
      // Apply deep cleaning to the entire tool definitions object
    const cleaningStartTime = Date.now();
    const sanitized = deepCleanSchema(toolDefinitions) as ToolDefinitions;
    const cleaningTime = Date.now() - cleaningStartTime;
    const totalTime = Date.now() - startTime;
    
    const sanitizedCount = sanitized.function_declarations?.length || 0;
    
    logger.info(`Sanitized ${sanitizedCount} function declarations`);
    logger.debug('Tool sanitization completed', {
      validationId,
      originalCount,
      sanitizedCount,
      cleaningTimeMs: cleaningTime,
      totalTimeMs: totalTime,
      functionsRemoved: originalCount - sanitizedCount,
      efficiency: `${Math.round((originalCount / totalTime) * 1000)} functions/sec`
    });
    
    return sanitized;
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    const totalTime = Date.now() - startTime;
    
    logger.error('Error sanitizing tool definitions', {
      validationId,
      error: err.message,
      totalTimeMs: totalTime,
      originalFunctionCount: toolDefinitions.function_declarations?.length || 0,
      stack: err.stack
    });
    
    // Return original if sanitization fails
    return toolDefinitions;
  }
}