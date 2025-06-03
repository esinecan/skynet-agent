'use client'

import React from 'react'
import ChatHistorySidebar from '../components/ChatHistorySidebar'
import ChatInterface from '../components/ChatInterface'
import { ChatSession } from '../lib/chat-history'

export default function Home() {
  const [currentSessionId, setCurrentSessionId] = React.useState<string>('')
  const [sidebarOpen, setSidebarOpen] = React.useState(false)

  const startNewChat = () => {
    const newSessionId = `chat-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    setCurrentSessionId(newSessionId)
  }

  const loadSession = async (session: ChatSession) => {
    setCurrentSessionId(session.id)
    setSidebarOpen(false)
  }

  return (
    <>
      <ChatHistorySidebar
        isOpen={sidebarOpen}
        onToggle={() => setSidebarOpen(!sidebarOpen)}
        onSelectSession={loadSession}
        onNewChat={startNewChat}
        currentSessionId={currentSessionId}
      />
      
      <main className="flex min-h-screen flex-col">
        {/* Header */}
        <div className="bg-white border-b border-gray-200 px-6 py-4">
          <div className="flex items-center justify-between">
            <button
              onClick={() => setSidebarOpen(true)}
              className="bg-gray-800 text-white px-4 py-2 rounded-lg hover:bg-gray-700 transition-colors flex items-center gap-2"
            >
              <span>☰</span>
              History
            </button>
            
            <div className="flex-1 flex justify-center">
              <h1 className="text-2xl font-bold text-gray-900">
                🧠 MCP Chat Client
              </h1>
            </div>
            
            <div className="flex items-center gap-2">
              {/* Navigation Links */}
              <a 
                href="/conscious-memory"
                className="bg-purple-600 text-white px-3 py-2 rounded-lg hover:bg-purple-700 transition-colors text-sm flex items-center gap-1"
                title="Memory Dashboard"
              >
                🧠 Memory
              </a>
              
              <a 
                href="/attachments"
                className="bg-green-600 text-white px-3 py-2 rounded-lg hover:bg-green-700 transition-colors text-sm flex items-center gap-1"
                title="Attachment Dashboard"
              >
                📎 Files
              </a>
              
              <button
                onClick={startNewChat}
                className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2"
              >
                <span>+</span>
                New
              </button>
            </div>
          </div>
        </div>

        {/* Main Chat Interface */}
        <div className="flex-1">
          <ChatInterface 
            sessionId={currentSessionId}
            onNewSession={setCurrentSessionId}
          />
        </div>
      </main>
    </>
  )
}
