import React, { useState, useEffect } from 'react'
import { ChatHistoryDatabase } from '../lib/chat-history'

interface AttachmentStats {
  totalAttachments: number
  totalSize: number
  types: Record<string, number>
}

export default function AttachmentDashboard() {
  const [stats, setStats] = useState<AttachmentStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchAttachmentStats()
  }, [])
  const fetchAttachmentStats = async () => {
    try {
      setLoading(true)
      const response = await fetch('/api/attachments')
      const result = await response.json()
      
      if (result.success) {
        setStats(result.data)
      } else {
        throw new Error(result.error || 'Failed to fetch stats')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch stats')
    } finally {
      setLoading(false)
    }
  }

  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes'
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  const getFileTypeIcon = (type: string): string => {
    if (type.startsWith('image/')) return '🖼️'
    if (type.includes('pdf')) return '📄'
    if (type.includes('text')) return '📝'
    if (type.includes('word')) return '📘'
    if (type.includes('excel') || type.includes('sheet')) return '📊'
    if (type.includes('powerpoint') || type.includes('presentation')) return '📽️'
    if (type.includes('javascript') || type.includes('typescript')) return '💻'
    if (type.includes('html')) return '🌐'
    if (type.includes('css')) return '🎨'
    return '📎'
  }

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow-sm border p-6">
        <div className="animate-pulse">
          <div className="h-6 bg-gray-200 rounded w-1/4 mb-4"></div>
          <div className="space-y-3">
            <div className="h-4 bg-gray-200 rounded w-3/4"></div>
            <div className="h-4 bg-gray-200 rounded w-1/2"></div>
            <div className="h-4 bg-gray-200 rounded w-2/3"></div>
          </div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="bg-white rounded-lg shadow-sm border p-6">
        <div className="text-red-600">
          <h3 className="text-lg font-semibold mb-2">Error</h3>
          <p>{error}</p>
          <button 
            onClick={fetchAttachmentStats}
            className="mt-4 bg-red-500 text-white px-4 py-2 rounded hover:bg-red-600"
          >
            Retry
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-lg shadow-sm border p-6">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-semibold text-gray-900">
          📎 Attachment Overview
        </h3>
        <button 
          onClick={fetchAttachmentStats}
          className="text-blue-500 hover:text-blue-700 text-sm"
        >
          Refresh
        </button>
      </div>

      {stats && (
        <div className="space-y-6">
          {/* Summary Stats */}
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-blue-50 rounded-lg p-4">
              <div className="text-2xl font-bold text-blue-600">
                {stats.totalAttachments}
              </div>
              <div className="text-sm text-blue-800">Total Files</div>
            </div>
            <div className="bg-green-50 rounded-lg p-4">
              <div className="text-2xl font-bold text-green-600">
                {formatBytes(stats.totalSize)}
              </div>
              <div className="text-sm text-green-800">Storage Used</div>
            </div>
          </div>

          {/* File Types Breakdown */}
          {Object.keys(stats.types).length > 0 ? (
            <div>
              <h4 className="text-md font-medium text-gray-800 mb-3">
                File Types
              </h4>
              <div className="space-y-2">
                {Object.entries(stats.types)
                  .sort(([,a], [,b]) => b - a)
                  .map(([type, count]) => (
                    <div key={type} className="flex items-center justify-between py-2 px-3 bg-gray-50 rounded">
                      <div className="flex items-center gap-2">
                        <span className="text-lg">{getFileTypeIcon(type)}</span>
                        <span className="text-sm font-medium text-gray-700">
                          {type.split('/')[1]?.toUpperCase() || type}
                        </span>
                      </div>
                      <span className="text-sm text-gray-500">
                        {count} file{count > 1 ? 's' : ''}
                      </span>
                    </div>
                  ))}
              </div>
            </div>
          ) : (
            <div className="text-center py-8 text-gray-500">
              <div className="text-4xl mb-2">📎</div>
              <p>No attachments yet</p>
              <p className="text-sm">Start uploading files to see statistics</p>
            </div>
          )}

          {/* Usage Tips */}
          <div className="bg-gray-50 rounded-lg p-4">
            <h4 className="text-sm font-semibold text-gray-800 mb-2">
              💡 Attachment Tips
            </h4>
            <ul className="text-sm text-gray-600 space-y-1">
              <li>• Drag and drop files directly into the chat input</li>
              <li>• Maximum file size: 10MB per file</li>
              <li>• Supports images, documents, code files, and more</li>
              <li>• Click attachment previews to download</li>
            </ul>
          </div>
        </div>
      )}
    </div>
  )
}
