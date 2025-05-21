import { GoogleGenerativeAI, GenerativeModel, Content, Part } from "@google/generative-ai";
import { Message } from "./schemas/appStateSchema";
import * as dotenv from 'dotenv';
import * as path from 'path';

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
let genAI: GoogleGenerativeAI | null = null;
let model: GenerativeModel | null = null;

// Check if the API key is valid
const isValidKey = apiKey && 
                  apiKey !== "your_gemini_api_key_here";

console.log('- API Key appears valid:', isValidKey);

if (isValidKey) {
  console.log('Initializing Gemini model with the API key...');
  genAI = new GoogleGenerativeAI(apiKey);
  model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
  console.log('Gemini model initialized successfully.');
} else {
  console.error('WARNING: Invalid or missing GEMINI_API_KEY. LLM functionality will not work.');
}

export async function generateResponse(
  messages: Array<Message>,
  systemPrompt?: string
): Promise<string> {
  try {
    // Check if model is initialized
    if (!model) {
      throw new Error("Gemini model is not initialized. Check your API key.");
    }

    // Convert our message format to Gemini's format
    const geminiMessages: Content[] = messages.map(msg => {
      // Gemini uses "user" instead of "human" and "model" instead of "ai"
      const role = msg.role === "human" ? "user" : 
                  msg.role === "ai" ? "model" : "system";
      
      return { role, parts: [{ text: msg.content } as Part] };
    });

    // Setup chat session with system prompt if provided
    const chatConfig: {
      systemInstruction?: {text: string},
      history?: Content[]
    } = {};
    
    if (systemPrompt) {
      chatConfig.systemInstruction = { text: systemPrompt };
    }
    
    const chatSession = model.startChat({
      ...chatConfig,
      history: geminiMessages.filter(msg => msg.role !== "system"),
    });

    // Get the latest message (that isn't a system message)
    const userMessages = geminiMessages.filter(msg => msg.role === "user");
    const lastMessage = userMessages[userMessages.length - 1];
    
    if (!lastMessage) {
      throw new Error("No user messages found in conversation history");
    }
    
    const result = await chatSession.sendMessage(lastMessage.parts[0].text as string);
    const response = result.response;
    return response.text();
  } catch (error) {
    console.error("Error generating response:", error);
    // Provide more detailed error messages
    if (!apiKey || apiKey === "your_gemini_api_key_here") {
      return "Error: Missing API key. Please add a valid GEMINI_API_KEY to your .env file.";
    } else if (!model) {
      return "Error: Failed to initialize LLM. Please check your API key and try again.";
    } else {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return `Error: ${errorMessage}`;
    }
  }
}
