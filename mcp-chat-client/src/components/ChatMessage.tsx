import React from 'react'
import { Message } from 'ai'
import { FileAttachment } from '../types/chat'
import ToolCallDisplay from './ToolCallDisplay'

interface ChatMessageProps {
  message: Message & { attachments?: FileAttachment[] }
}

const AttachmentPreview: React.FC<{ attachment: FileAttachment }> = ({ attachment }) => {
  const isImage = attachment.type.startsWith('image/')
  
  const handleDownload = () => {
    const blob = new Blob([Uint8Array.from(atob(attachment.data), c => c.charCodeAt(0))], {
      type: attachment.type
    })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = attachment.name
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  if (isImage) {
    return (
      <div className="mt-2 max-w-sm">
        <img
          src={`data:${attachment.type};base64,${attachment.data}`}
          alt={attachment.name}
          className="rounded-lg shadow-sm cursor-pointer hover:shadow-md transition-shadow"
          onClick={handleDownload}
          style={{ maxHeight: '200px', width: 'auto' }}
        />
        <div className="text-xs text-gray-500 mt-1 flex items-center justify-between">
          <span>{attachment.name}</span>
          <span>{(attachment.size / 1024).toFixed(1)}KB</span>
        </div>
      </div>
    )
  }

  return (
    <div className="mt-2 bg-gray-50 rounded-lg p-3 max-w-sm border">
      <div className="flex items-center gap-3">
        <div className="text-2xl">
          {attachment.type.includes('pdf') ? '📄' :
           attachment.type.includes('text') ? '📝' :
           attachment.type.includes('json') ? '🔧' :
           attachment.type.includes('word') ? '📘' :
           attachment.type.includes('excel') || attachment.type.includes('sheet') ? '📊' :
           attachment.type.includes('powerpoint') || attachment.type.includes('presentation') ? '📽️' :
           attachment.type.includes('javascript') || attachment.type.includes('typescript') ? '💻' :
           attachment.type.includes('html') ? '🌐' :
           attachment.type.includes('css') ? '🎨' : '📎'}
        </div>
        
        <div className="flex-1 min-w-0">
          <div className="font-medium text-gray-900 truncate">
            {attachment.name}
          </div>
          <div className="text-sm text-gray-500">
            {attachment.type} • {(attachment.size / 1024).toFixed(1)}KB
          </div>
        </div>
        
        <button
          onClick={handleDownload}
          className="text-blue-500 hover:text-blue-700 p-1 rounded transition-colors"
          title="Download file"
        >
          ⬇️
        </button>
      </div>
    </div>
  )
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
        {/* Message Content */}
        {message.content && (
          <div className="whitespace-pre-wrap">{message.content}</div>
        )}
        
        {/* Attachments */}
        {message.attachments && message.attachments.length > 0 && (
          <div className="space-y-2">
            {message.attachments.map((attachment) => (
              <AttachmentPreview 
                key={attachment.id} 
                attachment={attachment} 
              />
            ))}
          </div>
        )}

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