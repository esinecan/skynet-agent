import { streamText } from 'ai';
import { NextRequest } from 'next/server';
import { LLMService } from '../../../lib/llm-service';
import { ChatHistoryDatabase } from '../../../lib/chat-history';
import { readFileSync } from 'fs';
import { join } from 'path';

// Global LLM service instance
let llmService: LLMService | null = null;

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
    const { messages, sessionId: providedSessionId } = await request.json();
    
    if (!messages || !Array.isArray(messages)) {
      return new Response('Invalid messages format', { status: 400 });
    }
    
    // Get or generate session ID
    const sessionId = providedSessionId || extractOrGenerateSessionId(messages);
    const userMessage = extractUserMessage(messages);
    
    console.log('🔍 Chat API: Processing messages:', messages.length);
    console.log('🏷️  Chat API: Session ID:', sessionId);
    console.log('💬 Chat API: User message:', userMessage.slice(0, 100) + '...');
    
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
            
            console.log('🔍 Chat API: RAG context:', ragResult.context.slice(0, 200) + '...');
            console.log('🔍 Chat API: Enhanced messages count:', enhancedMessages.length);
            console.log('🔍 Chat API: System message being added:', JSON.stringify(systemMessage, null, 2));
            
            // Insert system message before the last user message
            enhancedMessages = [
              ...messages.slice(0, -1),
              systemMessage,
              messages[messages.length - 1]
            ];
            
            console.log('🔍 Chat API: Messages after RAG enhancement:', enhancedMessages.length);
            console.log('🔍 Chat API: All message roles:', enhancedMessages.map(m => m.role).join(', '));
            
            console.log('🧠 Chat API: Enhanced with RAG context');
            console.log('� Chat API: Retrieved memories:', ragResult.memories.length);
          }
        }
      } catch (ragError) {
        console.warn('⚠️  Chat API: RAG enhancement failed, continuing without memory:', ragError);
      }
    }
      console.log('🚀 Chat API: About to call streamText with', enhancedMessages.length, 'messages');
    console.log('🚀 Chat API: Last message:', JSON.stringify(enhancedMessages[enhancedMessages.length - 1], null, 2));
    
    // Load system prompt
    const systemPrompt = loadSystemPrompt();
    
    // Stream the response with tool support
    try {
      const result = await streamText({
        model: model,
        system: systemPrompt || undefined, // Include system prompt if available
        messages: enhancedMessages,
        tools: tools,
        maxTokens: parseInt(process.env.MAX_TOKENS || '4096'),
        temperature: parseFloat(process.env.TEMPERATURE || '0.7'),
        maxSteps: 5, // Allow multiple tool calls
        onFinish: async (finishResult) => {
        // Store conversation in memory after successful completion
        if (enableRAG && userMessage && finishResult.text) {
          try {
            await service.storeConversationInMemory(userMessage, finishResult.text, sessionId);
            console.log('💾 Chat API: Conversation stored in memory');
          } catch (memoryError) {
            console.warn('⚠️  Chat API: Failed to store conversation in memory:', memoryError);
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
          });
          
          // Store assistant response
          await chatHistory.addMessage({
            id: `msg_${Date.now()}_assistant`,
            sessionId: sessionId,
            role: 'assistant',
            content: finishResult.text,
            toolInvocations: finishResult.toolCalls,
          });
          
          console.log('📝 Chat API: Conversation stored in chat history');
        } catch (historyError) {
          console.warn('⚠️  Chat API: Failed to store in chat history:', historyError);
        }
      },
    });
    
    console.log('✅ Chat API: streamText completed successfully');
    return result.toDataStreamResponse();
    
    } catch (streamError) {
      console.error('❌ Chat API: streamText failed:', streamError);
      throw streamError;
    }
    
  } catch (error) {
    console.error('❌ Chat API Error:', error);
    
    return new Response(
      JSON.stringify({ 
        error: 'Failed to process request',
        message: 'Sorry, I encountered an error while processing your request.'
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