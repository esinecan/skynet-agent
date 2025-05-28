import { createLogger } from '../utils/logger';

const logger = createLogger('mcpToolValidator');

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