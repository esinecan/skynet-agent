export interface Message {
  role: 'user' | 'assistant'
  content: string
  timestamp: Date
}

export interface ChatRequest {
  message: string
}

export interface ChatResponse {
  message: string
  timestamp: string
}