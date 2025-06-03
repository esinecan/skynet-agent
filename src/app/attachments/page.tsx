'use client'

import React from 'react'
import AttachmentDashboard from '../../components/AttachmentDashboard'
import Link from 'next/link'

export default function AttachmentsPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Navigation */}
      <nav className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex items-center">
              <Link href="/" className="text-xl font-bold text-gray-900 hover:text-blue-600">
                🧠 MCP Chat Client
              </Link>
            </div>
            <div className="flex items-center space-x-6">
              <Link 
                href="/" 
                className="text-gray-600 hover:text-gray-900 px-3 py-2 rounded-md text-sm font-medium"
              >
                Chat
              </Link>
              <Link 
                href="/conscious-memory" 
                className="text-gray-600 hover:text-gray-900 px-3 py-2 rounded-md text-sm font-medium"
              >
                Memory
              </Link>
              <Link 
                href="/attachments" 
                className="bg-blue-100 text-blue-700 px-3 py-2 rounded-md text-sm font-medium"
              >
                Attachments
              </Link>
            </div>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        <div className="px-4 py-6 sm:px-0">
          {/* Header */}
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-gray-900">
              Attachment Management
            </h1>
            <p className="mt-2 text-lg text-gray-600">
              View and manage file attachments across all your conversations
            </p>
          </div>

          {/* Dashboard Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Main Dashboard */}
            <div className="lg:col-span-2">
              <AttachmentDashboard />
            </div>

            {/* Info Panel */}
            <div className="space-y-6">
              {/* Supported Formats */}
              <div className="bg-white rounded-lg shadow-sm border p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">
                  Supported Formats
                </h3>
                <div className="space-y-3">
                  <div>
                    <h4 className="text-sm font-medium text-gray-700 mb-1">Images</h4>
                    <p className="text-sm text-gray-600">JPEG, PNG, GIF, WebP, SVG</p>
                  </div>
                  <div>
                    <h4 className="text-sm font-medium text-gray-700 mb-1">Documents</h4>
                    <p className="text-sm text-gray-600">PDF, TXT, MD, CSV, JSON, XML</p>
                  </div>
                  <div>
                    <h4 className="text-sm font-medium text-gray-700 mb-1">Office Files</h4>
                    <p className="text-sm text-gray-600">DOCX, XLSX, PPTX, DOC, XLS, PPT</p>
                  </div>
                  <div>
                    <h4 className="text-sm font-medium text-gray-700 mb-1">Code Files</h4>
                    <p className="text-sm text-gray-600">JS, TS, HTML, CSS</p>
                  </div>
                </div>
              </div>

              {/* Upload Guidelines */}
              <div className="bg-blue-50 rounded-lg border border-blue-200 p-6">
                <h3 className="text-lg font-semibold text-blue-900 mb-4">
                  Upload Guidelines
                </h3>
                <ul className="space-y-2 text-sm text-blue-800">
                  <li className="flex items-start">
                    <span className="text-blue-500 mr-2">•</span>
                    Maximum file size: 10MB per file
                  </li>
                  <li className="flex items-start">
                    <span className="text-blue-500 mr-2">•</span>
                    Up to 10 files per message
                  </li>
                  <li className="flex items-start">
                    <span className="text-blue-500 mr-2">•</span>
                    Drag & drop directly in chat
                  </li>
                  <li className="flex items-start">
                    <span className="text-blue-500 mr-2">•</span>
                    Files are stored securely with your chat history
                  </li>
                </ul>
              </div>

              {/* Quick Actions */}
              <div className="bg-white rounded-lg shadow-sm border p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">
                  Quick Actions
                </h3>
                <div className="space-y-3">
                  <Link 
                    href="/"
                    className="block w-full bg-blue-500 text-white text-center py-2 px-4 rounded-lg hover:bg-blue-600 transition-colors"
                  >
                    🚀 Start New Chat
                  </Link>
                  <Link 
                    href="/conscious-memory"
                    className="block w-full bg-gray-100 text-gray-700 text-center py-2 px-4 rounded-lg hover:bg-gray-200 transition-colors"
                  >
                    🧠 View Memories
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
