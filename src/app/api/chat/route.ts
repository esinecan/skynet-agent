import { streamText } from 'ai';
import { NextRequest } from 'next/server';
import { LLMService } from '../../../lib/llm-service';
import { ChatHistoryDatabase } from '../../../lib/chat-history';
import knowledgeGraphSyncService from '../../../lib/knowledge-graph-sync-service';
import { kgSyncQueue } from '../../../lib/kg-sync-queue';
import { readFileSync } from 'fs';
import { join } from 'path';

// Global LLM service instance
let llmService: LLMService | null = null;

// Add diagnostic logging for debugging
function logDiagnostics() {
  console.log(' Chat API Diagnostics:');
  console.log('  - RAG_ENABLED:', process.env.RAG_ENABLED);
  console.log('  - RAG_ENABLE_SUMMARIZATION:', process.env.RAG_ENABLE_SUMMARIZATION);
  console.log('  - GOOGLE_API_KEY exists:', !!process.env.GOOGLE_API_KEY);
  console.log('  - CHROMA_URL:', process.env.CHROMA_URL);
}

// Helper function to load system prompt
function loadSystemPrompt(): string {
  try {
    const systemPromptPath = join(process.cwd(), 'system-prompt.md');
    const content = readFileSync(systemPromptPath, 'utf-8').trim();
    
    if (content) {
      console.log(' Chat API: Loaded system prompt from system-prompt.md');
      return content;
    } else {
      console.log(' Chat API: system-prompt.md is empty, using no system prompt');
      return '';
    }
  } catch (error) {
    if ((error as any).code === 'ENOENT') {
      console.log(' Chat API: system-prompt.md not found, using no system prompt');
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
    // Add diagnostic logging at the start
    logDiagnostics();
    
    const body = await request.json();
    console.log(' Chat API: Received request body keys:', Object.keys(body));
    console.log(' Chat API: Request body.sessionId:', body.sessionId);
    console.log(' Chat API: Request body.id:', body.id);
    console.log(' Chat API: Any other ID fields:', Object.keys(body).filter(k => k.toLowerCase().includes('id')));
    
    const { messages, sessionId: providedSessionId, id: providedId, attachments } = body;
    
    if (!messages || !Array.isArray(messages)) {
      return new Response('Invalid messages format', { status: 400 });
    }
    
    // AI SDK might send session ID as 'id' instead of 'sessionId'
    const sessionId = providedSessionId || providedId || extractOrGenerateSessionId(messages);    const userMessage = extractUserMessage(messages);
    
    console.log(' Chat API: Processing messages:', messages.length);
    console.log('  Chat API: Provided Session ID:', providedSessionId);
    console.log('  Chat API: Provided ID:', providedId);
    console.log('  Chat API: Final Session ID:', sessionId);
    console.log(' Chat API: User message:', userMessage.slice(0, 100) + '...');
    
    // Log attachment info if present
    if (attachments && attachments.length > 0) {
      console.log(' Chat API: Attachments:', attachments.length);
      console.log(' Chat API: Attachment types:', attachments.map((a: any) => a.type).join(', '));
    }
    
    // Get LLM service (will initialize on first call)
    const service = await getLLMService();
    
    // Get available tools and model
    const tools = await service.getAvailableTools();
    const model = service.getModel();
    const providerInfo = service.getProviderInfo();
    
    console.log(' Chat API: Using provider:', providerInfo.provider, 'with model:', providerInfo.model);
    
    // Create enhanced system message with RAG context if enabled
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
            // Add system message with memory context
            const systemMessage = {
              role: 'system',
              content: ragResult.context
            };
              console.log(`RAG: Added ${ragResult.memories.length} memories, ${enhancedMessages.length} total messages, roles: ${enhancedMessages.map(m => m.role).join(',')}`);
            
            // Insert system message before the last user message
            enhancedMessages = [
              ...messages.slice(0, -1),
              systemMessage,
              messages[messages.length - 1]
            ];
          }
        }      } catch (ragError) {
        console.error(' Chat API: RAG enhancement FAILED:', ragError);
      }}    // Process attachments and add them to the last user message
    if (attachments && attachments.length > 0) {
      console.log(`Attachments: Processing ${attachments.length} files`);
      
      // Find the last user message in enhancedMessages
      const lastUserMessageIndex = enhancedMessages.map(m => m.role).lastIndexOf('user');
      if (lastUserMessageIndex !== -1) {
        const lastUserMessage = enhancedMessages[lastUserMessageIndex];
        
        // Convert attachments to the format expected by AI models
        const attachmentContent: any[] = [];
        
        for (const attachment of attachments) {
          if (attachment.type.startsWith('image/')) {
            // Image attachment
            attachmentContent.push({
              type: 'image',
              image: `data:${attachment.type};base64,${attachment.data}`
            });
            console.log(` Chat API: Added image attachment: ${attachment.name}`);
          } else {
            // Text-based attachment (documents, code, etc.)
            let fileContent;
            try {
              fileContent = Buffer.from(attachment.data, 'base64').toString('utf-8');
            } catch (error) {
              console.warn(` Chat API: Could not decode attachment ${attachment.name} as text, treating as binary`);
              fileContent = `[Binary file: ${attachment.name} (${attachment.type}, ${attachment.size} bytes)]`;
            }
            
            attachmentContent.push({
              type: 'text',
              text: `File: ${attachment.name} (${attachment.type})\n\n${fileContent}`
            });
            console.log(` Chat API: Added text attachment: ${attachment.name}`);
          }
        }
        
        // Update the message content to include attachments
        if (typeof lastUserMessage.content === 'string') {
          // Convert string content to multipart content array
          enhancedMessages[lastUserMessageIndex] = {
            ...lastUserMessage,
            content: [
              { type: 'text', text: lastUserMessage.content },
              ...attachmentContent
            ]
          };
        } else if (Array.isArray(lastUserMessage.content)) {
          // Add to existing content array
          enhancedMessages[lastUserMessageIndex] = {
            ...lastUserMessage,
            content: [...lastUserMessage.content, ...attachmentContent]
          };
        }
        
        console.log(` Chat API: Enhanced message with ${attachments.length} attachments`);
      }
    }
      
    console.log(' Chat API: About to call streamText with', enhancedMessages.length, 'messages');
    console.log(' Chat API: Last message:', JSON.stringify(enhancedMessages[enhancedMessages.length - 1], null, 2));
    
    // Load system prompt
    const systemPrompt = loadSystemPrompt();      // Stream the response with tool support
    try {
      const result = await streamText({
        model: model,
        system: systemPrompt || undefined, // Include system prompt if available
        messages: enhancedMessages,
        tools: tools,
        maxTokens: parseInt(process.env.MAX_TOKENS || '4096'),
        temperature: parseFloat(process.env.TEMPERATURE || '0.7'),        maxSteps: 5, // Allow multiple tool calls
        onFinish: async (finishResult) => {
        console.log(' Chat API: onFinish callback started');
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
                console.log(` ✅ Step 1: Tool execution complete: ${call.toolCallId} (${call.toolName})`);
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
              console.log(' Chat API: Storing conversation in memory...');
              await service.storeConversationInMemory(
                userMessage, 
                finishResult.text || "Memory tool response (no text content)", 
                sessionId
              );
              console.log(' ✅ Step 2: Memory storage complete');
            } else {
              console.log(' Chat API: Skipping memory storage for memory tool call');
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
            
            console.log(' Chat API: Created new session:', sessionId);
          }
          // Store user message
          await chatHistory.addMessage({
            id: `msg_${Date.now()}_user`,
            sessionId: sessionId,
            role: 'user',
            content: userMessage,
            attachments: attachments ? attachments.map((att: any) => ({
              id: att.id || `att_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`,
              messageId: `msg_${Date.now()}_user`,
              name: att.name,
              type: att.type,
              size: att.size,
              data: att.data,
              createdAt: new Date(),
            })) : undefined,
          });          // When storing assistant response, handle memory tool calls with no text
          const assistantContent = finishResult.text || (memoryToolCallFound ? 
            "[Memory tool call execution]" : "");
            
          // Store assistant response
          await chatHistory.addMessage({
            id: `msg_${Date.now()}_assistant`,
            sessionId: sessionId,
            role: 'assistant',
            content: assistantContent,
            toolInvocations: completeToolCalls,
          });            console.log(' ✅ Step 3: Chat history saved successfully');
            // Trigger knowledge graph sync via queue (async, don't wait)
          // Run this completely asynchronously to avoid affecting the stream
          Promise.resolve().then(async () => {
            try {
              await kgSyncQueue.addSyncRequest('chat');
              console.log(' ✅ Step 4: Knowledge graph sync queued successfully');
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

    const dataStreamResponse = result.toDataStreamResponse();
    console.log(' Chat API: stream response: ', dataStreamResponse.json);
    
    console.log(' ✅ Step 5: AI SDK stream finalized successfully');
    return dataStreamResponse;  } catch (streamError) {
    console.error(' Chat API: streamText failed:', streamError);

    // Return a proper JSON error response that AI SDK can handle
    // Include more details about the error
    return new Response(
      JSON.stringify({
        error: 'STREAM_ERROR',
        message: streamError instanceof Error ? streamError.message : 'Stream processing failed',
        details: process.env.NODE_ENV === 'development' 
          ? (streamError instanceof Error ? streamError.stack || streamError.message : 'Unknown stream error details') 
          : 'An error occurred while processing the stream.',
        toolErrorDetails: (streamError as any).toolErrorDetails || null // Propagate specific tool error details if available
      }),
      { 
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }  } catch (error) {
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