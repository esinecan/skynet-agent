import { streamText } from 'ai';
import { NextRequest } from 'next/server';
import { LLMService } from '../../../lib/llm-service';

// Global LLM service instance
let llmService: LLMService | null = null;

async function getLLMService(): Promise<LLMService> {
  if (!llmService) {
    llmService = new LLMService();
    await llmService.initialize();
  }
  return llmService;
}

export async function POST(request: NextRequest) {
  try {
    const { messages } = await request.json();
    
    if (!messages || !Array.isArray(messages)) {
      return new Response('Invalid messages format', { status: 400 });
    }
    
    // Get LLM service (will initialize on first call)
    const service = await getLLMService();
    
    // Get available tools and model
    const tools = await service.getAvailableTools();
    const model = service.getModel();
    
    console.log('🔍 Chat API: Processing messages:', messages.length);
    console.log('🔧 Chat API: Available tools:', Object.keys(tools));
    
    // Stream the response with tool support
    const result = await streamText({
      model: model,
      messages: messages,
      tools: tools,
      maxTokens: parseInt(process.env.MAX_TOKENS || '4096'),
      temperature: parseFloat(process.env.TEMPERATURE || '0.7'),
      maxSteps: 5, // Allow multiple tool calls
    });
    
    return result.toDataStreamResponse();
    
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