import { z } from "zod";

// Define message structure
export const MessageSchema = z.object({
  role: z.enum(["human", "ai", "system"]),
  content: z.string()
});

export type Message = z.infer<typeof MessageSchema>;

// Define the agent's state structure
export const AppStateSchema = z.object({
  input: z.string().describe("Current user query"),
  messages: z.array(MessageSchema).default([]).describe("Conversation history"),
  aiResponse: z.string().optional().describe("Current AI response"),
  toolCall: z.any().optional().describe("Current tool call data"),
  toolResults: z.record(z.string(), z.any()).optional().describe("Results from tool calls")
});

export type AppState = z.infer<typeof AppStateSchema>;
