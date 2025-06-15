import React from 'react'
import { Message } from 'ai'
import ToolCallDisplay from './ToolCallDisplay'

interface ChatMessageProps {
  message: Message
}

const AttachmentPreview: React.FC<{ attachment: any }> = ({ attachment }) => {
  // AI SDK FilePart can have 'data' (base64) or 'url'
  const isImage = attachment.type.startsWith('image/')
  const displaySrc = attachment.data ? `data:${attachment.type};base64,${attachment.data}` : attachment.url
  
  const handleDownload = () => {
    if (attachment.data) {
      const blob = new Blob([Uint8Array.from(atob(attachment.data), c => c.charCodeAt(0))], {
        type: attachment.type
      })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = attachment.name || 'download'
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } else if (attachment.url) {
      // For URLs, simply open in new tab or trigger download
      window.open(attachment.url, '_blank')
    }
  }

  if (isImage && displaySrc) {
    return (
      <div className="mt-2 max-w-sm">
        <img
          src={displaySrc}
          alt={attachment.name || 'Attached image'}
          className="rounded-lg shadow-sm cursor-pointer hover:shadow-md transition-shadow"
          onClick={handleDownload}
          style={{ maxHeight: '200px', width: 'auto' }}
        />
        <div className="text-xs text-gray-500 mt-1 flex items-center justify-between">
          <span>{attachment.name || 'Image'}</span>
          {attachment.size && <span>{(attachment.size / 1024).toFixed(1)}KB</span>}
        </div>
      </div>
    )
  }

  // Generic file preview for non-images or if image source is missing
  return (
    <div className="mt-2 bg-gray-50 rounded-lg p-3 max-w-sm border">
      <div className="flex items-center gap-3">
        <div className="text-2xl">
          {attachment.type?.includes('pdf') ? '📄' :
           attachment.type?.includes('text') ? '📝' :
           attachment.type?.includes('json') ? '🔧' :
           attachment.type?.includes('word') ? '📘' :
           attachment.type?.includes('excel') || attachment.type?.includes('sheet') ? '📊' :
           attachment.type?.includes('powerpoint') || attachment.type?.includes('presentation') ? '📽️' :
           attachment.type?.includes('javascript') || attachment.type?.includes('typescript') ? '💻' :
           attachment.type?.includes('html') ? '🌐' :
           attachment.type?.includes('css') ? '🎨' : '📎'}
        </div>
        
        <div className="flex-1 min-w-0">
          <div className="font-medium text-gray-900 truncate">
            {attachment.name || 'Unknown File'}
          </div>
          <div className="text-sm text-gray-500">
            {attachment.type || 'application/octet-stream'} • {attachment.size ? `${(attachment.size / 1024).toFixed(1)}KB` : 'N/A'}
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
        {/* Message Content and Parts */}
        {message.parts && message.parts.length > 0 && (
          <div className="space-y-2">
            {message.parts.map((part: any, index: number) => {
              switch (part.type) {
                case 'text':
                  return <div key={index} className="whitespace-pre-wrap">{part.text}</div>
                case 'file':
                  return <AttachmentPreview key={index} attachment={part} />
                // Add more cases for other part types (e.g., 'tool-call', 'tool-result', 'reasoning') if needed
                default:
                  return null
              }
            })}
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