import { GoogleGenerativeAI, GenerativeModel, Content, Part } from "@google/generative-ai";
import { Message } from "./schemas/appStateSchema";

// Check for API key
const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey || apiKey === "your_gemini_api_key_here") {
  console.warn("WARNING: GEMINI_API_KEY is not set or is using default value. Please add a valid API key to your .env file.");
}

// Initialize the Google Generative AI client
const genAI = new GoogleGenerativeAI(apiKey || "");

// Get the model
const model: GenerativeModel = genAI.getGenerativeModel({ model: "gemini-1.5-pro" });

export async function generateResponse(
  messages: Array<Message>,
  systemPrompt?: string
): Promise<string> {
  try {
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
    return "I encountered an error while processing your request.";
  }
}
