'use client'

import React from 'react'
import { useChat } from 'ai/react'
import ChatMessage from './ChatMessage'
import { Message } from 'ai'

interface ChatInterfaceProps {
  onNewSession?: (sessionId: string) => void
  sessionId?: string
}

export default function ChatInterface({ onNewSession, sessionId }: ChatInterfaceProps) {
  const { messages, input, handleInputChange, handleSubmit, isLoading, setMessages } = useChat({
    id: sessionId,
    onFinish: async (message) => {
      // Save message to database after completion
      if (sessionId) {
        try {
          await fetch(`/api/chat-history/${sessionId}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
              message: {
                id: message.id,
                role: message.role,
                content: message.content,
                toolInvocations: message.toolInvocations,
              }
            })
          })
        } catch (error) {
          console.error('Failed to save message:', error)
        }
      }
    }
  })

  // Save user messages immediately when sent
  const handleChatSubmit = async (e: React.FormEvent) => {
    handleSubmit(e)
    
    // Save user message to database
    if (sessionId && input.trim()) {
      try {
        await fetch(`/api/chat-history/${sessionId}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            message: {
              id: `user-${Date.now()}`,
              role: 'user',
              content: input,
            }
          })
        })
      } catch (error) {
        console.error('Failed to save user message:', error)
      }
    }
  }

  React.useEffect(() => {
    if (!sessionId && onNewSession) {
      const newSessionId = `session-${Date.now()}`
      onNewSession(newSessionId)
    }
  }, [sessionId, onNewSession])

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 ? (
          <div className="text-center text-gray-500 mt-8">
            <h2 className="text-2xl font-semibold mb-2">Welcome to MCP Chat</h2>
            <p>Start a conversation with your AI assistant</p>
          </div>
        ) : (
          messages.map((message: Message) => (
            <ChatMessage 
              key={message.id} 
              message={message}
            />
          ))
        )}
        {isLoading && (
          <div className="flex justify-center">
            <div className="animate-pulse text-gray-500">AI is thinking...</div>
          </div>
        )}
      </div>

      {/* Input */}
      <div className="border-t p-4">
        <form onSubmit={handleChatSubmit} className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={handleInputChange}
            placeholder="Type your message..."
            className="flex-1 border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            disabled={isLoading}
          />
          <button
            type="submit"
            disabled={isLoading || !input.trim()}
            className="bg-blue-500 text-white px-6 py-2 rounded-lg hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Send
          </button>
        </form>
      </div>
    </div>
  )
}