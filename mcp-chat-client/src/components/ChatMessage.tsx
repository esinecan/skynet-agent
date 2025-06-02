import React from 'react'
import { Message } from 'ai'
import ToolCallDisplay from './ToolCallDisplay'

interface ChatMessageProps {
  message: Message
}

export default function ChatMessage({ message }: ChatMessageProps) {
  const isUser = message.role === 'user'
  
  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-4`}>
      <div className={`max-w-3xl px-4 py-2 rounded-lg ${
        isUser 
          ? 'bg-blue-500 text-white' 
          : 'bg-gray-100 text-gray-900'
      }`}>
        <div className="whitespace-pre-wrap">{message.content}</div>
        
        {/* Tool Invocations */}
        {message.toolInvocations && message.toolInvocations.length > 0 && (
          <div className="mt-2 space-y-2">
            {message.toolInvocations.map((toolInvocation, index) => (
              <ToolCallDisplay 
                key={index} 
                toolInvocation={toolInvocation}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}