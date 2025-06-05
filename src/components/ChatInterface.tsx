'use client'

import React from 'react'
import { useChat } from 'ai/react'
import ChatMessage from './ChatMessage'
import MessageInput from './MessageInput'
import { Message } from 'ai'
import { FileAttachment } from '../types/chat'

interface ChatInterfaceProps {
  onNewSession?: (sessionId: string) => void
  sessionId?: string
}

export default function ChatInterface({ onNewSession, sessionId }: ChatInterfaceProps) {  const { messages, input, handleInputChange, handleSubmit, isLoading, setMessages } = useChat({
    id: sessionId,
    api: '/api/chat',
    maxSteps: 5, // Allow multiple tool calls
    onError: (error) => {
      console.error('Chat error:', error);
    },    onFinish: async (message) => {
      // Message storage is now handled by the chat API
      // No need to store separately here
    }
  })

  // Enhanced input change handler to support textarea
  const handleInputChangeEnhanced = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const syntheticEvent = {
      target: {
        value: e.target.value
      }
    } as React.ChangeEvent<HTMLInputElement>
    handleInputChange(syntheticEvent)
  }

  // Enhanced submit handler with attachment support
  const handleChatSubmit = async (e: React.FormEvent, attachments?: FileAttachment[]) => {
    e.preventDefault()
    
    // If we have attachments, we need to handle them specially
    if (attachments && attachments.length > 0) {
      // Add user message with attachments to UI immediately
      const userMessage: Message & { attachments?: FileAttachment[] } = {
        id: `user-${Date.now()}`,
        role: 'user',
        content: input,
        createdAt: new Date(),
        attachments
      }
        setMessages(prev => [...prev, userMessage])
      
      // User message storage is now handled by the chat API
      // No need to store separately here
      
      // Send to chat API with attachment info in the message content
      const attachmentInfo = attachments.map(att => 
        `[Attachment: ${att.name} (${att.type}, ${(att.size/1024).toFixed(1)}KB)]`
      ).join('\n')
      
      const enhancedContent = attachmentInfo + (input ? '\n\n' + input : '')
      
      // Use the regular handleSubmit with enhanced content
      const syntheticEvent = {
        target: { value: enhancedContent }
      } as React.ChangeEvent<HTMLInputElement>
      handleInputChange(syntheticEvent)
      handleSubmit(e)
      
    } else {      // Regular submit without attachments
      handleSubmit(e)
      
      // User message storage is now handled by the chat API
      // No need to store separately here
    }
  }

  React.useEffect(() => {
    if (!sessionId && onNewSession) {
      const newSessionId = `session_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`
      onNewSession(newSessionId)
    }
  }, [sessionId, onNewSession])

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Header */}
      <div className="border-b p-4 bg-gray-50">
        <h1 className="text-xl font-semibold text-gray-800">
          MCP Chat Client
        </h1>
        <p className="text-sm text-gray-600">
          AI Assistant with Dual-Layer Memory & File Support
        </p>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 ? (
          <div className="text-center text-gray-500 mt-8">
            <div className="text-6xl mb-4">🧠</div>
            <h2 className="text-2xl font-semibold mb-2">Welcome to MCP Chat</h2>
            <p className="text-lg mb-4">Your AI assistant with conscious memory</p>
            <div className="text-sm text-gray-400 space-y-1">
              <p>✨ Dual-layer memory system</p>
              <p>🔧 MCP tool integration</p>
              <p>📎 File attachment support</p>
              <p>💾 Persistent conversation history</p>
            </div>
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
            <div className="flex items-center gap-2 text-gray-500">
              <div className="w-4 h-4 border-2 border-gray-300 border-t-blue-500 rounded-full animate-spin"></div>
              AI is thinking...
            </div>
          </div>
        )}
      </div>

      {/* Enhanced Input with Attachment Support */}
      <MessageInput
        input={input}
        handleInputChange={handleInputChangeEnhanced}
        handleSubmit={handleChatSubmit}
        isLoading={isLoading}
      />
    </div>
  )
}