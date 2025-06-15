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

export default function ChatInterface({ onNewSession, sessionId }: ChatInterfaceProps) {  
  const { messages, input, handleInputChange, handleSubmit, isLoading, setMessages, error } = useChat({
    id: sessionId,
    api: '/api/chat',
    maxSteps: 35, // Allow multiple tool calls
    streamProtocol: 'text', // Add for debugging
    onError: async (error) => {
      console.error(' Full error object:', error);
      
      // Add check for stream error type that matches the pattern
      if (error.message?.includes('Stream error:') || 
          (error as any).type === 'error') {
        console.error(' Stream contained error detected:', error);
      }
      
      // Keep existing error handling logic
      if ((error as any).fullStream) {
        try {
          const fullStreamText = await (error as any).fullStream.text();
          console.error(' Full stream error details:', fullStreamText);
          
          try {
            const errorData = JSON.parse(fullStreamText);
            if (errorData.error) {
              console.error(' Parsed error:', errorData.error);
            }
          } catch (parseError) {
            // Stream might not be JSON, that's okay
          }
        } catch (streamError) {
          console.error(' Error parsing full stream:', streamError);
        }
      }
      
      if ((error as any).cause && typeof (error as any).cause === 'object') {
        console.error(' Error cause details:', (error as any).cause);
      }
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
    
    if (attachments && attachments.length > 0) {
      // Validation code remains unchanged
      const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB limit
      const MAX_FILES = 10; // Maximum number of files
      
      if (attachments.length > MAX_FILES) {
        alert(`Maximum ${MAX_FILES} files allowed. You selected ${attachments.length}.`);
        return;
      }
      
      for (let i = 0; i < attachments.length; i++) {
        if (attachments[i].size > MAX_FILE_SIZE) {
          alert(`File "${attachments[i].name}" exceeds the 10MB size limit (${(attachments[i].size / 1024 / 1024).toFixed(2)}MB)`);
          return;
        }
      }
      
      // Use experimental_attachments with error handling
      try {
        // Convert FileAttachment[] to match AI SDK's expected format
        await handleSubmit(e, { 
          experimental_attachments: attachments.map(attachment => ({
            name: attachment.name,
            type: attachment.type,
            size: attachment.size,
            data: attachment.data,
            // Add url property as required by AI SDK's Attachment type
            url: `data:${attachment.type};base64,${attachment.data}`
          }))
        });
      } catch (attachmentError) {
        console.error('Attachment error:', attachmentError);
        // Fallback to processing without attachments if needed
        if (confirm('Unable to process attachments. Continue without attachments?')) {
          handleSubmit(e);
        }
      }
    } else {
      // Regular submit without attachments
      handleSubmit(e)
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
            <div className="text-6xl mb-4"></div>
            <h2 className="text-2xl font-semibold mb-2">Welcome to MCP Chat</h2>
            <p className="text-lg mb-4">Your AI assistant with conscious memory</p>
            <div className="text-sm text-gray-400 space-y-1">
              <p> Dual-layer memory system</p>
              <p> MCP tool integration</p>
              <p> File attachment support</p>
              <p> Persistent conversation history</p>
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
        {error && (
          <div className="mx-4 p-4 bg-red-50 border border-red-200 rounded-lg">
            <div className="flex items-start gap-3">
              <div className="text-red-500 text-xl"></div>
              <div className="flex-1">
                <h3 className="font-semibold text-red-800 mb-1">Chat Error</h3>
                <p className="text-red-700 text-sm">{error.message}</p>
                <details className="mt-2">
                  <summary className="text-xs text-red-600 cursor-pointer hover:text-red-800">
                    Show technical details
                  </summary>
                  <pre className="mt-2 text-xs text-red-600 bg-red-100 p-2 rounded overflow-auto max-h-32">
                    {error.stack || JSON.stringify(error, null, 2)}
                  </pre>
                </details>
              </div>
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