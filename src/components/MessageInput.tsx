import React, { useState, useRef } from 'react'

interface MessageInputProps {
  input: string
  handleInputChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void
  handleSubmit: (e: React.FormEvent, files?: FileList) => void
  isLoading: boolean
}

export default function MessageInput({ 
  input, 
  handleInputChange, 
  handleSubmit, 
  isLoading 
}: MessageInputProps) {
  const [files, setFiles] = useState<FileList | undefined>(undefined)
  const [isDragOver, setIsDragOver] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

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
    
    const droppedFiles = e.dataTransfer.files
    if (droppedFiles.length > 0) {
      setFiles(droppedFiles)
    }
  }

  const removeFile = (index: number) => {
    if (!files) return
    const dt = new DataTransfer()
    Array.from(files).forEach((file, i) => {
      if (i !== index) dt.items.add(file)
    })
    setFiles(dt.files.length > 0 ? dt.files : undefined)
  }

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    console.log('MessageInput: handleFormSubmit called with files:', files)
    if (files) {
      console.log('MessageInput: Files count:', files.length)
      for (let i = 0; i < files.length; i++) {
        console.log(`MessageInput: File ${i + 1}:`, files[i].name, files[i].type, files[i].size)
      }
    }
    handleSubmit(e, files)
    setFiles(undefined)
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleFormSubmit(e)
    }
  }
  return (
    <div className="space-y-3">
      {/* Files Preview */}
      {files && files.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {Array.from(files).map((file, index) => (
            <div 
              key={`${file.name}-${index}`} 
              className="bg-blue-50 border border-blue-200 rounded-xl p-3 flex items-center gap-3 max-w-64"
            >
              {/* File icon based on type */}
              <div className="text-lg">
                {file.type.startsWith('image/') ? '🖼️' : 
                 file.type.includes('pdf') ? '📄' :
                 file.type.includes('text') ? '📝' :
                 file.type.includes('code') ? '💻' : '📎'}
              </div>
              
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-gray-900 truncate">
                  {file.name}
                </div>
                <div className="text-xs text-gray-500">
                  {(file.size / 1024).toFixed(1)}KB
                </div>
              </div>
              
              <button
                type="button"
                onClick={() => removeFile(index)}
                className="text-gray-400 hover:text-red-500 p-1 rounded-full hover:bg-red-50 transition-colors"
                aria-label="Remove file"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

      <form onSubmit={handleFormSubmit}>
        {/* Input Area with Drag & Drop */}
        <div 
          className={`relative rounded-xl border-2 transition-all duration-200 ${
            isDragOver 
              ? 'border-blue-400 bg-blue-50 shadow-lg' 
              : 'border-gray-200 hover:border-gray-300 bg-white shadow-sm'
          }`}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          <div className="flex items-end gap-3 p-3">
            {/* File Upload Button */}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="p-2 text-gray-400 hover:text-blue-500 hover:bg-blue-50 rounded-lg transition-colors flex-shrink-0 self-end"
              disabled={isLoading}
              title="Attach files"
            >
              📎
            </button>
            
            <div className="flex-1">
              <textarea
                value={input}
                onChange={handleInputChange}
                onKeyDown={handleKeyDown}
                placeholder="Type your message... (Shift+Enter for new line)"
                className="w-full border-0 resize-none focus:outline-none bg-transparent text-gray-900 placeholder-gray-500"
                rows={Math.min(Math.max(input.split('\n').length, 1), 6)}
                disabled={isLoading}
                style={{ minHeight: '24px' }}
              />
            </div>

            {/* Send Button */}
            <button
              type="submit"
              disabled={isLoading || (!input.trim() && (!files || files.length === 0))}
              className="bg-blue-500 text-white p-2 rounded-lg hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex-shrink-0 self-end"
              title="Send message"
            >
              {isLoading ? (
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
              ) : (
                <svg className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor">
                  <path d="M10.894 2.553a1 1 0 00-1.788 0l-7 14a1 1 0 001.169 1.409l5-1.429A1 1 0 009 15.571V11a1 1 0 112 0v4.571a1 1 0 00.725.962l5 1.428a1 1 0 001.17-1.408l-7-14z" />
                </svg>
              )}
            </button>
          </div>
          
          {isDragOver && (
            <div className="absolute inset-0 flex items-center justify-center bg-blue-50 bg-opacity-95 rounded-xl">
              <div className="text-blue-600 font-medium flex items-center gap-2">
                <div className="text-2xl">📎</div>
                Drop files here to attach
              </div>
            </div>
          )}
        </div>
        
        <input
          ref={fileInputRef}
          type="file"
          multiple
          onChange={(e) => {
            if (e.target.files) {
              setFiles(e.target.files)
            }
          }}
          className="hidden"
        />

        {/* Helper text */}
        <div className="flex items-center justify-between text-xs text-gray-500 px-1">
          <div className="flex items-center gap-4">
            {files && files.length > 0 && (
              <span>
                {files.length} file{files.length > 1 ? 's' : ''} attached
              </span>
            )}
            <span>Press Shift+Enter for new line</span>
          </div>
          <div>
            {input.length > 0 && (
              <span className={input.length > 1000 ? 'text-orange-600' : ''}>
                {input.length} characters
              </span>
            )}
          </div>
        </div>
      </form>
    </div>
  )
}