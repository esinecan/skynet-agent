import React, { useState, useRef } from 'react'
import { FileAttachment } from '../types/chat'

interface MessageInputProps {
  input: string
  handleInputChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void
  handleSubmit: (e: React.FormEvent, attachments?: FileAttachment[]) => void
  isLoading: boolean
}

export default function MessageInput({ 
  input, 
  handleInputChange, 
  handleSubmit, 
  isLoading 
}: MessageInputProps) {
  const [attachments, setAttachments] = useState<FileAttachment[]>([])
  const [isDragOver, setIsDragOver] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFileSelect = async (files: FileList) => {
    if (files.length === 0) return

    try {
      const formData = new FormData()
      Array.from(files).forEach(file => {
        formData.append('files', file)
      })

      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      })

      const result = await response.json()

      if (result.success) {
        setAttachments(prev => [...prev, ...result.files])
      } else {
        alert(result.error || 'Upload failed')
      }
    } catch (error) {
      console.error('Upload error:', error)
      alert('Upload failed. Please try again.')
    }
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(true)
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)
    
    const files = e.dataTransfer.files
    if (files.length > 0) {
      handleFileSelect(files)
    }
  }

  const removeAttachment = (index: number) => {
    setAttachments(prev => prev.filter((_, i) => i !== index))
  }

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    handleSubmit(e, attachments)
    setAttachments([]) // Clear attachments after sending
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleFormSubmit(e)
    }
  }

  return (
    <div className="border-t p-4">
      {/* Attachments Preview */}
      {attachments.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-2">
          {attachments.map((attachment, index) => (
            <div 
              key={attachment.id} 
              className="bg-gray-100 rounded-lg p-2 flex items-center gap-2 max-w-xs"
            >
              {/* File icon based on type */}
              <div className="text-blue-500">
                {attachment.type.startsWith('image/') ? '🖼️' : 
                 attachment.type.includes('pdf') ? '📄' :
                 attachment.type.includes('text') ? '📝' :
                 attachment.type.includes('code') ? '💻' : '📎'}
              </div>
              
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-gray-900 truncate">
                  {attachment.name}
                </div>
                <div className="text-xs text-gray-500">
                  {(attachment.size / 1024).toFixed(1)}KB
                </div>
              </div>
              
              <button
                type="button"
                onClick={() => removeAttachment(index)}
                className="text-gray-400 hover:text-red-500 ml-1"
                aria-label="Remove attachment"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

      <form onSubmit={handleFormSubmit} className="space-y-2">
        {/* Input Area with Drag & Drop */}
        <div 
          className={`relative rounded-lg border-2 transition-colors ${
            isDragOver 
              ? 'border-blue-400 bg-blue-50' 
              : 'border-gray-300 hover:border-gray-400'
          }`}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          <textarea
            value={input}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            placeholder="Type your message... (Shift+Enter for new line, drag files to attach)"
            className="w-full p-3 border-0 resize-none focus:outline-none focus:ring-0 bg-transparent rounded-lg"
            rows={input.split('\n').length || 1}
            disabled={isLoading}
            style={{ minHeight: '60px', maxHeight: '200px' }}
          />
          
          {isDragOver && (
            <div className="absolute inset-0 flex items-center justify-center bg-blue-50 bg-opacity-90 rounded-lg">
              <div className="text-blue-600 font-medium">
                📎 Drop files here to attach
              </div>
            </div>
          )}
        </div>

        {/* Actions Row */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {/* File Upload Button */}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="p-2 text-gray-500 hover:text-blue-500 hover:bg-blue-50 rounded-lg transition-colors"
              disabled={isLoading}
              title="Attach files"
            >
              📎
            </button>
            
            <input
              ref={fileInputRef}
              type="file"
              multiple
              onChange={(e) => e.target.files && handleFileSelect(e.target.files)}
              className="hidden"
              accept="image/*,.pdf,.txt,.md,.csv,.json,.xml,.docx,.xlsx,.pptx,.doc,.xls,.ppt,.js,.ts,.html,.css"
            />

            {/* Attachment count */}
            {attachments.length > 0 && (
              <span className="text-xs text-gray-500">
                {attachments.length} file{attachments.length > 1 ? 's' : ''} attached
              </span>
            )}
          </div>

          {/* Send Button */}
          <button
            type="submit"
            disabled={isLoading || (!input.trim() && attachments.length === 0)}
            className="bg-blue-500 text-white px-6 py-2 rounded-lg hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isLoading ? (
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                Sending...
              </div>
            ) : (
              'Send'
            )}
          </button>
        </div>
      </form>
    </div>
  )
}