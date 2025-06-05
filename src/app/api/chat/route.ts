import { streamText } from 'ai';
import { NextRequest } from 'next/server';
import { LLMService } from '../../../lib/llm-service';
import { ChatHistoryDatabase } from '../../../lib/chat-history';
import { readFileSync } from 'fs';
import { join } from 'path';

// Global LLM service instance
let llmService: LLMService | null = null;

// Add diagnostic logging for debugging
function logDiagnostics() {
  console.log('🔍 Chat API Diagnostics:');
  console.log('  - RAG_ENABLED:', process.env.RAG_ENABLED);
  console.log('  - RAG_ENABLE_SUMMARIZATION:', process.env.RAG_ENABLE_SUMMARIZATION);
  console.log('  - GOOGLE_API_KEY exists:', !!process.env.GOOGLE_API_KEY);
  console.log('  - CHROMA_URL:', process.env.CHROMA_URL);
  //WILL YOU FUCKING STOP DOING THIS? PUT A SINGLE LOG STATEMENT AND MAKE IT INFORMATIVE
  //STOP SPAMMING THE CONSOLE WITH REDUNDANT LOGS
}

// Helper function to load system prompt
function loadSystemPrompt(): string {
  try {
    const systemPromptPath = join(process.cwd(), 'system-prompt.md');
    const content = readFileSync(systemPromptPath, 'utf-8').trim();
    
    if (content) {
      console.log('📝 Chat API: Loaded system prompt from system-prompt.md');
      return content;
    } else {
      console.log('📝 Chat API: system-prompt.md is empty, using no system prompt');
      return '';
    }
  } catch (error) {
    if ((error as any).code === 'ENOENT') {
      console.log('📝 Chat API: system-prompt.md not found, using no system prompt');
    } else {
      console.warn('📝 Chat API: Error reading system-prompt.md:', error);
    }
    return '';
  }
}

async function getLLMService(): Promise<LLMService> {
  if (!llmService) {
    llmService = new LLMService();
    await llmService.initialize();
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

export async function POST(request: NextRequest) {
  try {
    // Add diagnostic logging at the start
    logDiagnostics();
    
    const body = await request.json();
    console.log('🔍 Chat API: Received request body keys:', Object.keys(body));
    console.log('🔍 Chat API: Request body.sessionId:', body.sessionId);
    console.log('🔍 Chat API: Request body.id:', body.id);
    console.log('🔍 Chat API: Any other ID fields:', Object.keys(body).filter(k => k.toLowerCase().includes('id')));
    
    const { messages, sessionId: providedSessionId, id: providedId, attachments } = body;
    
    if (!messages || !Array.isArray(messages)) {
      return new Response('Invalid messages format', { status: 400 });
    }
    
    // AI SDK might send session ID as 'id' instead of 'sessionId'
    const sessionId = providedSessionId || providedId || extractOrGenerateSessionId(messages);    const userMessage = extractUserMessage(messages);
    
    console.log('🔍 Chat API: Processing messages:', messages.length);
    console.log('🏷️  Chat API: Provided Session ID:', providedSessionId);
    console.log('🏷️  Chat API: Provided ID:', providedId);
    console.log('🏷️  Chat API: Final Session ID:', sessionId);
    console.log('💬 Chat API: User message:', userMessage.slice(0, 100) + '...');
    
    // Log attachment info if present
    if (attachments && attachments.length > 0) {
      console.log('📎 Chat API: Attachments:', attachments.length);
      console.log('📎 Chat API: Attachment types:', attachments.map((a: any) => a.type).join(', '));
    }
    
    // Get LLM service (will initialize on first call)
    const service = await getLLMService();
    
    // Get available tools and model
    const tools = await service.getAvailableTools();
    const model = service.getModel();
    const providerInfo = service.getProviderInfo();
    
    console.log('🤖 Chat API: Using provider:', providerInfo.provider, 'with model:', providerInfo.model);
    
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
        console.error('❌ Chat API: RAG enhancement FAILED:', ragError);
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
            console.log(`📎 Chat API: Added image attachment: ${attachment.name}`);
          } else {
            // Text-based attachment (documents, code, etc.)
            let fileContent;
            try {
              fileContent = Buffer.from(attachment.data, 'base64').toString('utf-8');
            } catch (error) {
              console.warn(`📎 Chat API: Could not decode attachment ${attachment.name} as text, treating as binary`);
              fileContent = `[Binary file: ${attachment.name} (${attachment.type}, ${attachment.size} bytes)]`;
            }
            
            attachmentContent.push({
              type: 'text',
              text: `File: ${attachment.name} (${attachment.type})\n\n${fileContent}`
            });
            console.log(`📎 Chat API: Added text attachment: ${attachment.name}`);
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
        
        console.log(`📎 Chat API: Enhanced message with ${attachments.length} attachments`);
      }
    }
      
    console.log('🚀 Chat API: About to call streamText with', enhancedMessages.length, 'messages');
    console.log('🚀 Chat API: Last message:', JSON.stringify(enhancedMessages[enhancedMessages.length - 1], null, 2));
    
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
        console.log('🏁 Chat API: onFinish callback started');
        console.log('🏁 finishResult.text length:', finishResult.text?.length || 0);
        
        // Store conversation in memory after successful completion
        if (enableRAG && userMessage && finishResult.text) {
          try {
            console.log('💾 Chat API: Storing conversation in memory...');
            await service.storeConversationInMemory(userMessage, finishResult.text, sessionId);
            console.log('💾 Chat API: Conversation stored in memory');          } catch (memoryError) {
            console.error('❌ Chat API: Memory storage FAILED:', memoryError);
            console.error('❌ Memory Error stack:', (memoryError as Error).stack);
            throw memoryError; // Don't suppress this error
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
            
            console.log('📁 Chat API: Created new session:', sessionId);
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
          });          // Extract complete tool calls from steps - check all step types
          const completeToolCalls: any[] = [];
          
          finishResult.steps?.forEach((step: any, index: number) => {
            console.log(`🔍 Step ${index}:`, {
              stepType: step.stepType,
              toolCallsCount: step.toolCalls?.length || 0,
              toolResultsCount: step.toolResults?.length || 0,
              hasResult: !!step.result
            });
            
            // Look for tool calls in various step structures
            if (step.toolCalls?.length > 0) {
              step.toolCalls.forEach((call: any) => {
                const matchingResult = step.toolResults?.find((r: any) => r.toolCallId === call.toolCallId);                if (call.result || matchingResult) {
                  // CRITICAL FIX: Merge tool call with its result + ensure AI SDK compatibility
                  const completeCall = {
                    type: 'tool-call',
                    toolCallId: call.toolCallId || call.id,
                    toolName: call.toolName,
                    args: call.args,
                    result: call.result || matchingResult,
                    state: 'result' // Mark as completed for AI SDK
                  };
                  completeToolCalls.push(completeCall);
                  console.log('✅ Found complete tool call:', call.toolCallId);
                }
              });
            }
            
            // Also check if the step itself is a tool call
            if (step.type === 'tool-call' && step.result) {
              completeToolCalls.push(step);
              console.log('✅ Found step-level tool call:', step.toolCallId);
            }
          });
          
          // Store assistant response
          await chatHistory.addMessage({
            id: `msg_${Date.now()}_assistant`,
            sessionId: sessionId,
            role: 'assistant',
            content: finishResult.text,
            toolInvocations: completeToolCalls,
          });
          
          console.log('📝 Chat API: Conversation stored in chat history');        } catch (historyError) {
          console.error('❌ Chat API: History storage FAILED:', historyError);
          console.error('❌ History Error stack:', (historyError as Error).stack);
          throw historyError; // Don't suppress this error
        }
      },    }); 

    const dataStreamResponse = result.toDataStreamResponse();
    console.log('✅ Chat API: stream response: ', dataStreamResponse.json);
    return dataStreamResponse;
  } catch (streamError) {
    console.error('❌ Chat API: streamText failed:', streamError);

    // Return a proper JSON error response that AI SDK can handle
    return new Response(
      JSON.stringify({
        error: 'STREAM_ERROR',
        message: streamError instanceof Error ? streamError.message : 'Stream processing failed',
        details: 'There was an error processing your request. Please try again.'
      }),
        { 
          status: 500,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }
      } catch (error) {
    console.error('❌ Chat API Error:', error);
    
    return new Response(
      JSON.stringify({ 
        error: 'CHAT_API_ERROR',
        message: error instanceof Error ? error.message : 'Failed to process request',
        details: 'Sorry, I encountered an error while processing your request.'
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