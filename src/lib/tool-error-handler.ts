/**
 * Tool Error Handler Utility
 * Handles errors for non-existent tools and converts them to proper tool results
 */

/**
 * Creates a transform stream that converts NoSuchToolError errors into tool results
 * This prevents the conversation from crashing when an AI tries to use a non-existent tool
 */
export function createToolErrorHandlerStream() {
  return new TransformStream({
    transform(chunk, controller) {
      // If this is an error chunk for a non-existent tool, convert it to a tool result
      if (chunk.type === 'error' && 
          (chunk.error?.name === 'AI_NoSuchToolError' || 
           chunk.error?.message?.includes('NoSuchToolError'))) {
        
        const toolName = chunk.error.toolName;
        const toolCallId = chunk.error.toolCallId;
        
        // Find the server name if present in the tool name
        const serverName = toolName.includes('_') ? 
          toolName.split('_')[0] : 'unknown';
        
        // Create a response that informs the AI about the error but allows conversation to continue
        const toolResult = {
          type: 'tool-result',
          toolCallId: toolCallId,
          toolName: toolName,
          result: {
            error: true,
            message: `Tool "${toolName}" does not exist.`,
            details: `Please use one of the available tools instead.`,
            availableTools: chunk.error.availableTools || []
          }
        };
        
        // Send this modified chunk instead of the error
        controller.enqueue(toolResult);
      } else {
        // Pass through all other chunks normally
        controller.enqueue(chunk);
      }
    }
  });
}

/**
 * Middleware for handling AI tool errors
 * Use this in your API routes to wrap the stream handling
 */
export function handleToolErrors(stream: any) {
  return stream.pipeThrough(createToolErrorHandlerStream());
}
