import * as Sentry from "@sentry/node";
// TODO: Eren: update module system. "type": "module" <--- Add this line
// Using dynamic import for @google/genai due to ES Module compatibility
import type { Message } from "./schemas/appStateSchema";
import * as dotenv from 'dotenv';
import * as path from 'node:path';

// Load environment variables immediately
const envPath = path.resolve(process.cwd(), '.env');
console.log('LLMClient: Loading environment from:', envPath);
dotenv.config({ path: envPath });

// Check for API key
const apiKey = process.env.GEMINI_API_KEY;

// Log environment details for debugging
console.log('Environment variables loaded:');
console.log('- GEMINI_API_KEY exists:', !!apiKey);
if (apiKey) {
  // Show first 4 and last 4 chars only, for security
  const maskedKey = apiKey.length > 8 
    ? `${apiKey.substring(0, 4)}...${apiKey.substring(apiKey.length - 4)}`
    : '****';
  console.log('- API Key (masked):', maskedKey);
}

// Initialize the Google Generative AI client only if we have a valid API key
let genAI: any = null;
let model: unknown | null = null;

// Check if the API key is valid
const isValidKey = apiKey && 
                  apiKey !== "your_gemini_api_key_here";

console.log('- API Key appears valid:', isValidKey);

// Dynamic import and initialization function
async function initializeGenAI() {
  if (isValidKey && !genAI) {
    console.log('Initializing Gemini model with the API key...');
    const { GoogleGenAI } = await import('@google/genai');
    genAI = new GoogleGenAI({ apiKey: apiKey });
    model = genAI.models; // Get the models module
    console.log('Gemini model initialized successfully.');
  } else if (!isValidKey) {
    console.error('WARNING: Invalid or missing GEMINI_API_KEY. LLM functionality will not work.');
  }
}

export async function generateResponse(
  messages: Array<Message>,
  systemPrompt?: string
): Promise<string> {
  try {
    return await Sentry.startSpan({ name: 'llm.generate_response' }, async (span) => {
      span?.setAttribute('message_count', messages.length);
      span?.setAttribute('has_system_prompt', !!systemPrompt);
      
      Sentry.addBreadcrumb({
        message: 'Generating LLM response',
        category: 'llm',
        level: 'info',
        data: { 
          messageCount: messages.length,
          hasSystemPrompt: !!systemPrompt 
        }
      });

      // Initialize GenAI if not already done
      await initializeGenAI();

      // Check if client is initialized
      if (!genAI) {
        throw new Error("Gemini client is not initialized. Check your API key.");
      }

      // Convert our message format to Gemini's format
      const geminiMessages = messages.map(msg => {
        // Gemini uses "user" instead of "human" and "model" instead of "ai"
        const role = msg.role === "human" ? "user" : 
                    msg.role === "ai" ? "model" : "user"; // treat system as user for now
        
        return { role, parts: [{ text: msg.content }] };
      });

      // Filter system messages from history since they're handled separately
      const historyMessages = geminiMessages.filter(msg => msg.role !== "system");

      // Create chat session with system prompt if provided
      const chatConfig: {
        model: string;
        systemInstruction?: { text: string };
        history?: Array<{ role: string; parts: Array<{ text: string }> }>;
      } = {
        model: "gemini-2.5-flash-preview-05-20"
      };
      
      if (systemPrompt) {
        chatConfig.systemInstruction = { text: systemPrompt };
      }

      if (historyMessages.length > 1) {
        // Use history excluding the last message (which we'll send separately)
        chatConfig.history = historyMessages.slice(0, -1);
      }

      const chat = genAI.chats.create(chatConfig);

      // Get the latest user message to send
      const userMessages = geminiMessages.filter(msg => msg.role === "user");
      const lastMessage = userMessages[userMessages.length - 1];
      
      if (!lastMessage) {
        throw new Error("No user messages found in conversation history");
      }

      const result = await chat.sendMessage({
        message: lastMessage.parts[0].text
      });
      
      return result.text || "";
    }) || "";
  } catch (error) {
    console.error("Error generating response:", error);
    // Provide more detailed error messages
    if (!apiKey || apiKey === "your_gemini_api_key_here") {
      return "Error: Missing API key. Please add a valid GEMINI_API_KEY to your .env file.";
    }
    if (!genAI) {
      return "Error: Failed to initialize LLM. Please check your API key and try again.";
    }
    const errorMessage = error instanceof Error ? error.message : String(error);
    return `Error: ${errorMessage}`;
  }
}
