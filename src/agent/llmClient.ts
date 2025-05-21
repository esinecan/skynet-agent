import { GoogleGenerativeAI } from "@google/generative-ai";

// Initialize the Google Generative AI client
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");

// Get the model
const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro" });

export async function generateResponse(
  messages: Array<{ role: string; content: string }>,
  systemPrompt?: string
): Promise<string> {
  try {
    // Convert our message format to Gemini's format
    const geminiMessages = messages.map(msg => {
      // Gemini uses "user" instead of "human" and "model" instead of "ai"
      const role = msg.role === "human" ? "user" : 
                  msg.role === "ai" ? "model" : "system";
      return { role, parts: [{ text: msg.content }] };
    });

    // Setup chat session with system prompt if provided
    const chatConfig: any = {};
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
    const result = await chatSession.sendMessage(lastMessage.parts[0].text);
    const response = result.response;
    return response.text();
  } catch (error) {
    console.error("Error generating response:", error);
    return "I encountered an error while processing your request.";
  }
}
