'use client'

import React from 'react'
import { useChat } from 'ai/react'
import ChatHistorySidebar from '../components/ChatHistorySidebar'
import MessageInput from '../components/MessageInput'
import { ChatSession } from '../lib/chat-history'
import { FileAttachment } from '../types/chat'

export default function Home() {
  // Generate session ID immediately, before useChat
  const [currentSessionId, setCurrentSessionId] = React.useState<string>(() => 
    `session_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`
  )
  const [sidebarOpen, setSidebarOpen] = React.useState(false)
    const { messages, input, handleInputChange, handleSubmit, isLoading, setMessages } = useChat({
    id: currentSessionId,
    api: '/api/chat',
    maxSteps: 5, // Allow multiple tool calls
    onError: (error) => {
      console.error('Chat error:', error);
    },    onFinish: async (message) => {
      // Message storage is now handled by the chat API
      // No need to store separately here
    }
  })  // Save user messages immediately when sent
  const handleChatSubmit = async (e: React.FormEvent, attachments?: FileAttachment[]) => {
    handleSubmit(e)
    
    // User message storage is now handled by the chat API
    // No need to store separately here
  }
  // Session ID is now generated immediately in useState initializer
  // No need for useEffect to set it after first message

  const startNewChat = () => {
    const newSessionId = `session_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`
    setCurrentSessionId(newSessionId)
    setMessages([])
    setSidebarOpen(false)
  }

  const loadSession = async (session: ChatSession) => {
    console.log('🔍 Loading session:', session.id)
    console.log('🔍 Session has', session.messages.length, 'messages')
    console.log('🔍 Messages:', session.messages.map(m => ({ role: m.role, content: m.content.slice(0, 50) + '...' })))
    
    // CRITICAL FIX: Load session data fresh from API to avoid stale data
    try {
      const response = await fetch(`/api/chat-history/${session.id}`)
      const data = await response.json()
      
      if (response.ok && data.session) {
        setCurrentSessionId(session.id)
        setMessages(data.session.messages || [])
        setSidebarOpen(false)
      } else {
        console.error('Failed to load session:', data.error)
        // Fallback to passed session data
        setCurrentSessionId(session.id)
        setMessages(session.messages)
        setSidebarOpen(false)
      }
    } catch (error) {
      console.error('Error loading session:', error)
      // Fallback to passed session data
      setCurrentSessionId(session.id)
      setMessages(session.messages)
      setSidebarOpen(false)
    }
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
      
      <main className="flex min-h-screen flex-col items-center justify-between p-24">
        <div className="z-10 max-w-5xl w-full items-center justify-between font-mono text-sm">          {/* Header with sidebar toggle */}
          <div className="flex items-center justify-between mb-8">
            <button
              onClick={() => setSidebarOpen(true)}
              className="bg-gray-800 text-white px-4 py-2 rounded-lg hover:bg-gray-700 transition-colors flex items-center gap-2"
            >
              <span>☰</span>
              History
            </button>
            
            <div className="flex-1 flex justify-center">
              <h1 className="text-4xl font-bold">
                MCP Chat Client
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
        
        <div className="bg-gray-100 border border-gray-300 rounded-lg p-4 h-96 overflow-y-auto mb-4">
          {messages.length === 0 ? (
            <p className="text-gray-500 text-center">Start a conversation...</p>
          ) : (            messages.map((message) => (
              <div key={message.id} className={`mb-4 p-3 rounded-lg ${
                message.role === 'user' 
                  ? 'bg-blue-100 ml-auto max-w-xs text-blue-900' 
                  : 'bg-white mr-auto max-w-md text-gray-800 border border-gray-200'
              }`}>
                <div className="font-semibold text-xs mb-1 uppercase opacity-75">
                  {message.role === 'user' ? 'You' : 'Assistant'}
                </div>
                
                {/* Display message content */}
                <div className="whitespace-pre-wrap">{message.content}</div>
                  {/* Display tool calls */}
                {message.toolInvocations && message.toolInvocations.length > 0 && (
                  <div className="mt-3 space-y-2">
                    {message.toolInvocations.map((toolCall) => (
                      <div key={toolCall.toolCallId} className="bg-yellow-50 border border-yellow-200 rounded p-2 text-sm">
                        <div className="font-medium text-yellow-800">
                          🔧 Tool Call: {toolCall.toolName}
                        </div>
                        <div className="text-yellow-700 mt-1">
                          <strong>Args:</strong> {JSON.stringify(toolCall.args, null, 2)}
                        </div>
                        {toolCall.state === 'result' && 'result' in toolCall && (
                          <div className="text-green-700 mt-1">
                            <strong>Result:</strong> {JSON.stringify(toolCall.result, null, 2)}
                          </div>
                        )}
                        {toolCall.state === 'call' && (
                          <div className="text-blue-600 mt-1">⏳ Executing...</div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))
          )}
          
          {isLoading && (
            <div className="text-gray-500 text-center">
              <div className="animate-pulse">Assistant is thinking...</div>
            </div>
          )}        </div>
        
        <MessageInput
          input={input}
          handleInputChange={handleInputChange}
          handleSubmit={handleChatSubmit}
          isLoading={isLoading}
        />
        
        <div className="text-xs text-gray-500 mt-4 text-center">
          Connected MCP servers: filesystem, windows-cli, playwright, sequential-thinking
        </div>
      </div>
    </main>
    </>
  )
}
