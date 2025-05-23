import { z } from "zod";

// Define message structure
export const MessageSchema = z.object({
  role: z.enum(["human", "ai", "system"]),
  content: z.string()
});

export type Message = z.infer<typeof MessageSchema>;

// Define tool call structure
export const ToolCallSchema = z.object({
  server: z.string(),
  tool: z.string(),
  args: z.record(z.string(), z.any())
});

export type ToolCall = z.infer<typeof ToolCallSchema>;

// Define reflection result structure
export const ReflectionResultSchema = z.object({
  score: z.number().optional(),
  critique: z.string(),
  improved: z.boolean().optional().describe("Whether the response was improved")
});

export type ReflectionResult = z.infer<typeof ReflectionResultSchema>;

// Define the agent's state structure
export const AppStateSchema = z.object({
  input: z.string().describe("Current user query"),
  messages: z.array(MessageSchema).default([]).describe("Conversation history"),
  aiResponse: z.string().optional().describe("Current AI response"),
  toolCall: ToolCallSchema.optional().describe("Current tool call data"),
  toolResults: z.record(z.string(), z.any()).optional().describe("Results from tool calls"),
  reflectionResult: ReflectionResultSchema.optional().describe("Self-reflection results"),
  memoryId: z.string().optional().describe("ID of stored memory")
});

export type AppState = z.infer<typeof AppStateSchema>;
