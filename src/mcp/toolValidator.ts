import { createLogger } from '../utils/logger';

const logger = createLogger('mcpToolValidator');

function deepCleanSchema(obj: any, parentPath = ''): any {
  // Base case for non-objects
  if (!obj || typeof obj !== 'object') return obj;
  
  // Handle arrays
  if (Array.isArray(obj)) {
    return obj.map(item => deepCleanSchema(item, parentPath));
  }
  
  // Clone the object to avoid modifying the original
  const result = {...obj};
  
  // Special handling for parameters with required fields
  if (parentPath.endsWith('.parameters') && result.properties && result.required) {
    // Ensure required only references properties that exist
    result.required = result.required.filter((prop: string) => 
      prop in (result.properties || {})
    );
    
    if (result.required.length === 0) {
      delete result.required;
    }
  }
  
  // Special handling for objects with properties and required fields
  if (result.properties && result.required) {
    // Ensure required only references properties that exist
    result.required = result.required.filter((prop: string) =>
      prop in result.properties
    );
    
    if (result.required.length === 0) {
      delete result.required;
    }
  }
  
  // Recursively process all properties
  for (const key of Object.keys(result)) {
    const newPath = parentPath ? `${parentPath}.${key}` : key;
    result[key] = deepCleanSchema(result[key], newPath);
  }
  
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
  if (!toolDefinitions || !toolDefinitions.function_declarations) {
    return toolDefinitions;
  }

  try {
    // Apply deep cleaning to the entire tool definitions object
    const sanitized = deepCleanSchema(toolDefinitions);
    
    logger.info(`Sanitized ${sanitized.function_declarations.length} function declarations`);
    return sanitized;
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    logger.error('Error sanitizing tool definitions:', err);
    return toolDefinitions; // Return original if sanitization fails
  }
}