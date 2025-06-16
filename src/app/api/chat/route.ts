import { streamText } from 'ai';
import { NextRequest } from 'next/server';
import { LLMService } from '../../../lib/llm-service';
import { ChatHistoryDatabase } from '../../../lib/chat-history';
import knowledgeGraphSyncService from '../../../lib/knowledge-graph-sync-service';
import { kgSyncQueue } from '../../../lib/kg-sync-queue';
import { readFileSync } from 'fs';
import { join } from 'path';
import { createLogger } from '../../../lib/logger';

// Create logger for this module
const logger = createLogger('chat-api');

// Global LLM service instance
let llmService: LLMService | null = null;

// Helper function to load system prompt
function loadSystemPrompt(): string {
  try {
    const systemPromptPath = join(process.cwd(), 'system-prompt.md');
    const content = readFileSync(systemPromptPath, 'utf-8').trim();
    
    if (content) {
      logger.info('Loaded system prompt from system-prompt.md');
      return content;
    } else {
      logger.info('system-prompt.md is empty, using no system prompt');
      return '';
    }
  } catch (error) {
    if ((error as any).code === 'ENOENT') {
      logger.info('system-prompt.md not found, using no system prompt');
    } else {
      console.warn(' Chat API: Error reading system-prompt.md:', error);
    }
    return '';
  }
}

async function getLLMService(): Promise<LLMService> {
  if (!llmService) {
    llmService = new LLMService();
    await llmService.initialize();
    
    // Log knowledge graph statistics on first initialization
    try {
      await knowledgeGraphSyncService.logStartupStatistics();
    } catch (kgError) {
      console.warn(' Chat API: Could not load knowledge graph statistics:', kgError);
    }
  }
  return llmService;
}

// Extract session ID from messages or generate a new one
function extractOrGenerateSessionId(messages: any[]): string {
  // Try to find session ID in the last message metadata
  const lastMessage = messages[messages.length - 1];
  if (lastMessage?.sessionId) {
    return lastMessage.sessionId;
  }
  
  // Generate a new session ID
  return `session_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
}

// Extract the user message from the conversation
function extractUserMessage(messages: any[]): string {
  const userMessages = messages.filter(m => m.role === 'user');
  const lastUserMessage = userMessages[userMessages.length - 1];
  return lastUserMessage?.content || '';
}

// GET handler to load existing chat sessions for useChat hook
export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const sessionId = url.searchParams.get('sessionId');
    
    if (!sessionId) {
      return Response.json({ error: 'sessionId parameter is required' }, { status: 400 });
    }
      console.log(' Loading chat session:', sessionId);
    
    const chatHistory = ChatHistoryDatabase.getInstance();
    const session = chatHistory.getSession(sessionId);
    
    if (!session) {
      console.log(' Session not found:', sessionId);
      return Response.json({ error: 'Session not found' }, { status: 404 });
    }
    
    console.log(' Loaded session with', session.messages.length, 'messages');
    
    // Return messages in the format expected by useChat hook
    return Response.json({
      messages: session.messages
    });
    
  } catch (error) {
    console.error(' Error loading chat session:', error);
    return Response.json({ 
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
   
    const body = await request.json();
    //console.log(' Chat API: Received request body keys:', Object.keys(body));
    //console.log(' Chat API: Request body.sessionId:', body.sessionId);
    //console.log(' Chat API: Request body.id:', body.id);
    //console.log(' Chat API: Any other ID fields:', Object.keys(body).filter(k => k.toLowerCase().includes('id')));
    //console.log(' Chat API: Messages array length:', body.messages?.length);
    if (body.messages && body.messages.length > 0) {
      const lastMsg = body.messages[body.messages.length - 1];
      //console.log(' Chat API: Last message keys:', Object.keys(lastMsg));
      //console.log(' Chat API: Last message experimental_attachments:', lastMsg.experimental_attachments);
      //console.log(' Chat API: Last message attachments:', lastMsg.attachments);
    }
    
    const { messages, sessionId: providedSessionId, id: providedId } = body;
    
    if (!messages || !Array.isArray(messages)) {
      return new Response('Invalid messages format', { status: 400 });
    }
    
    // AI SDK might send session ID as 'id' instead of 'sessionId'
    const sessionId = providedSessionId || providedId || extractOrGenerateSessionId(messages);
    const userMessage = extractUserMessage(messages);
    
    //console.log(' Chat API: Processing messages:', messages.length);
    console.log('  Chat API: Provided Session ID:', providedSessionId);
    console.log('  Chat API: Provided ID:', providedId);
    console.log('  Chat API: Final Session ID:', sessionId);
    //console.log(' Chat API: User message:', userMessage.slice(0, 100) + '...');
    
    // Check if last message has experimental_attachments (AI SDK format)
    const lastMessage = messages[messages.length - 1];
    if (lastMessage?.experimental_attachments) {
      //console.log(' Chat API: Experimental attachments:', lastMessage.experimental_attachments.length);
      //console.log(' Chat API: Attachment types:', lastMessage.experimental_attachments.map((a: any) => a.contentType).join(', '));
    }
    else if (lastMessage?.attachments) {
      lastMessage.experimental_attachments = lastMessage.attachments
    }
    
    // Get LLM service (will initialize on first call)
    const service = await getLLMService();
    
    // Get available tools and model
    const tools = await service.getAvailableTools();
    const model = service.getModel();
    const providerInfo = service.getProviderInfo();
    
    //console.log(' Chat API: Using provider:', providerInfo.provider, 'with model:', providerInfo.model);
    
    // Load system prompt
    const systemPrompt = loadSystemPrompt();
    
    // Create enhanced system message with RAG context if enabled
    let enhancedSystemPrompt = systemPrompt;
    let enhancedMessages = [...messages];
    
    // Check if RAG should be used (enabled by default)
    const enableRAG = process.env.RAG_ENABLED !== 'false';
    
    if (enableRAG && userMessage) {
      try {
        // Get RAG service to retrieve memory context
        const ragService = service['ragService'] as any; // Access private field
        if (ragService) {
          const ragResult = await ragService.retrieveAndFormatContext(userMessage, sessionId);
          
          if (ragResult.shouldRetrieve && ragResult.context) {
            // Combine RAG context with system prompt instead of inserting a new message
            if (enhancedSystemPrompt) {
              enhancedSystemPrompt = `${enhancedSystemPrompt}\n\n${ragResult.context}`;
            } else {
              enhancedSystemPrompt = ragResult.context;
            }
            
            console.log(`RAG: Added ${ragResult.memories.length} memories to system content`);
            // Enhanced logging to show memory previews
            interface MemoryLike {
              text?: string;
              content?: string;
              [key: string]: any;
            }

            (ragResult.memories as MemoryLike[]).forEach((memory: MemoryLike, index: number) => {
              const textContent: string = memory.text || memory.content || JSON.stringify(memory);
              const preview: string = textContent.substring(0, 50) + (textContent.length > 50 ? '...' : '');
              console.log(`  Memory ${index + 1}: ${preview}`);
            });
          }
        }      } catch (ragError) {
        console.error(' Chat API: RAG enhancement FAILED:', ragError);
      }}    
    // experimental_attachments are handled by AI SDK in the messages array
      
    //console.log(' Chat API: About to call streamText with', enhancedMessages.length, 'messages');
    //console.log(' Chat API: Last message:', JSON.stringify(enhancedMessages[enhancedMessages.length - 1], null, 2));

    // --- Start of added logging for attachments ---
    const attachmentsForStream = enhancedMessages[enhancedMessages.length - 1]?.experimental_attachments;
    if (attachmentsForStream && attachmentsForStream.length > 0) {
      //console.log(' Chat API: Attachments being sent to streamText:');
      attachmentsForStream.forEach((att: any, index: number) => {
        const dataPreview = att.data ? (att.data.substring(0, 50) + (att.data.length > 50 ? '...' : '')) : '[No data]';
        console.log(`  Attachment ${index + 1}: Name='${att.name}', Type='${att.contentType}', Size=${att.size}, DataPreview='${dataPreview}'`);
      });
    } else {
      //console.log(' Chat API: No experimental_attachments found on the last message for streamText.');
    }
    // --- End of added logging for attachments ---
    
    // Stream the response with tool support
    try {
      const result = await streamText({
        model: model,
        system: enhancedSystemPrompt || undefined,
        messages: enhancedMessages,
        tools: tools,
        maxTokens: parseInt(process.env.MAX_TOKENS || '4096'),
        temperature: parseFloat(process.env.TEMPERATURE || '0.7'),
        maxSteps: 35,
        toolCallStreaming: true,
        onChunk: ({ chunk }) => {
          /*/ Real-time chunk processing for debugging and monitoring
          if (chunk.type === 'text-delta') {
            // Text streaming - could add real-time processing here
          } else if (chunk.type === 'tool-call-delta') {
            console.log(`🔧 Tool call delta: ${chunk.toolCallId} - ${chunk.toolName}`);
          } else if (chunk.type === 'tool-call') {
            console.log(`🔧 Tool call: ${chunk.toolCallId} - ${chunk.toolName}`);
          } else if (chunk.type === 'tool-result') {
            console.log(`✅ Tool result: ${chunk.toolCallId} - ${chunk.toolName}`);
          }*/
        },
        onError: ({ error }) => {
          console.error('❌ Stream error occurred:', error);
        },
        onFinish: async (finishResult) => {
          //console.log(' Chat API: onFinish callback started');
          console.log(' finishResult.text length:', finishResult.text?.length || 0);
          
          // Extract tool calls from finishResult - AI SDK provides them in a cleaner format
          const completeToolCalls: any[] = [];
          let memoryToolCallFound = false;
          
          // The AI SDK provides tool calls in finishResult.steps
          finishResult.steps?.forEach((step: any, index: number) => {
            console.log(` Step ${index}:`, {
              type: step.type,
              toolCallsCount: step.toolCalls?.length || 0,
              toolResultsCount: step.toolResults?.length || 0
            });
            
            // AI SDK provides tool calls and results in the step
            if (step.toolCalls && step.toolResults) {
              step.toolCalls.forEach((call: any, callIndex: number) => {
                // Find matching result
                const result = step.toolResults[callIndex];
                
                // Check if this is a memory-related tool
                if (call.toolName && (
                    call.toolName.includes('memory') || 
                    call.toolName.includes('search') || 
                    call.toolName === 'get_related_memories'
                )) {
                  memoryToolCallFound = true;
                  console.log(` Memory tool call found: ${call.toolName}`);
                }
                
                if (result) {
                  // Store in AI SDK's expected format
                  const toolInvocation = {
                    toolCallId: call.toolCallId,
                    toolName: call.toolName,
                    args: call.args,
                    result: result.result
                  };
                  completeToolCalls.push(toolInvocation);
                } else {
                  console.warn(` No result found for tool call: ${call.toolCallId} (${call.toolName}) - this may cause AI SDK streaming issues`);
                }
              });
            }
          });
          
          // Store memory regardless of text content if it's a memory tool call
          if (enableRAG && userMessage && (finishResult.text || memoryToolCallFound)) {
            try {
              // Don't try to store empty content if using a memory tool
              if (finishResult.text || !memoryToolCallFound) {
                //console.log(' Chat API: Storing conversation in memory...');
                await service.storeConversationInMemory(
                  userMessage, 
                  finishResult.text || "Memory tool response (no text content)", 
                  sessionId
                );
              } else {
                //console.log(' Chat API: Skipping memory storage for memory tool call');
              }
            } catch (memoryError) {
              console.error(' Chat API: Memory storage FAILED:', memoryError);
              console.error(' Memory Error stack:', (memoryError as Error).stack);
              // Don't throw - log the error but don't break the stream
            }
          }
          
          // Store in chat history database
          try {
            const chatHistory = ChatHistoryDatabase.getInstance();
            
            // Ensure session exists before adding messages
            if (!chatHistory.sessionExists(sessionId)) {
              // Create the session first
              const sessionTitle = chatHistory.generateSessionTitle([
                { role: 'user', content: userMessage }
              ]);
              
              chatHistory.createSession({
                id: sessionId,
                title: sessionTitle,
                messages: []
              });
              
              //console.log(' Chat API: Created new session:', sessionId);
            }
            // Store user message
            // Skip attachment storage for now - AI SDK v3.3 handles attachments differently
            // They're included in the message parts, not as separate attachments
            await chatHistory.addMessage({
              id: `msg_${Date.now()}_user`,
              sessionId: sessionId,
              role: 'user',
              content: userMessage,
              // TODO: Update chat history to handle AI SDK v3.3 attachment format
              attachments: undefined,
            });
            
            // When storing assistant response, handle memory tool calls with no text
            const assistantContent = finishResult.text || (memoryToolCallFound ? 
              "[Memory tool call execution]" : "");
              
            // Store assistant response
            await chatHistory.addMessage({
              id: `msg_${Date.now()}_assistant`,
              sessionId: sessionId,
              role: 'assistant',
              content: assistantContent,
              toolInvocations: completeToolCalls,
            });           
              
            // Trigger knowledge graph sync via queue (async, don't wait)
            Promise.resolve().then(async () => {
              try {
                await kgSyncQueue.addSyncRequest('chat');
              } catch (queueError) {
                console.error(' Chat API: Failed to queue knowledge graph sync:', queueError);
                // Error is contained here and won't affect the stream
              }
            }).catch((promiseError) => {
              console.error(' Chat API: Unexpected error in async KG sync queue:', promiseError);
              // This catch ensures the Promise never becomes an unhandled rejection
            });
          } catch (historyError) {
            console.error(' Chat API: History storage FAILED:', historyError);
            console.error(' History Error stack:', (historyError as Error).stack);
            // Don't throw - log the error but don't break the stream
          }
        },
      });
      
      // Get the fullStream to detect error chunks
      const { fullStream } = result;

      // We need to manually detect errors in the stream, but we can't pipe the fullStream directly
      // to the response as it contains objects, not strings
      try {
        // Return the response using the new API method
        return result.toDataStreamResponse({
          // Optional configuration if needed
          status: 200,
          headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
          },
        });
      } catch (streamError) {
        console.error("Stream iteration failed:", streamError);
        throw streamError; // Re-throw to be caught by outer try/catch
      }
    } catch (error) {
      console.error(' Chat API: streamText failed:', error);

      // Return a proper JSON error response
      return new Response(
        JSON.stringify({
          error: 'STREAM_ERROR',
          message: error instanceof Error ? error.message : 'Stream processing failed',
          details: process.env.NODE_ENV === 'development' 
            ? (error instanceof Error ? error.stack || error.message : 'Unknown stream error details') 
            : 'An error occurred while processing the stream.',
          toolErrorDetails: (error as any).toolErrorDetails || null
        }),
        { 
          status: 500,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }
  } catch (error) {
    console.error(' Chat API Error:', error);
    
    // Return a proper JSON error response
    return new Response(
      JSON.stringify({
        error: 'CHAT_API_ERROR',
        message: error instanceof Error ? error.message : 'Failed to process request',
        details: error instanceof Error ? error.stack || error.message : 'Sorry, I encountered an unknown error while processing your request.',
        toolErrorDetails: (error as any).toolErrorDetails || null // Propagate specific tool error details if available
      }),
      { 
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }
}

// Cleanup on process exit
if (typeof process !== 'undefined') {
  process.on('SIGINT', async () => {
    if (llmService) {
      await llmService.cleanup();
    }
    process.exit(0);
  });
}