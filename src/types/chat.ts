export interface FileAttachment {
  id: string
  name: string
  type: string // MIME type
  size: number
  data: string // Base64 encoded file data
  uploadedAt: Date
}

export interface Message {
  role: 'user' | 'assistant'
  content: string
  timestamp: Date
  attachments?: FileAttachment[]
}

export interface ChatRequest {
  message: string
  attachments?: FileAttachment[]
}

export interface ToolCall {
  toolName: string
  args: Record<string, any>
  result?: any
}

export interface ChatResponse {
  message: string
  timestamp: string
}