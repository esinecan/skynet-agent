'use client'

import React from 'react'
import { useChat } from 'ai/react'
import ChatHistorySidebar from '../components/ChatHistorySidebar'
import MessageInput from '../components/MessageInput'
import { ChatSession } from '../lib/chat-history'
import { FileAttachment } from '../types/chat'
import MotiveForceToggle from '../components/MotiveForceToggle'
import MotiveForceStatus from '../components/MotiveForceStatus'
import MotiveForceSettings from '../components/MotiveForceSettings'
import { MotiveForceState, MotiveForceConfig, DEFAULT_MOTIVE_FORCE_CONFIG } from '../types/motive-force'

export default function Home() {
  // Initialize with null to indicate we haven't determined the session ID yet
  const [currentSessionId, setCurrentSessionId] = React.useState<string | null>(null)
  const [sidebarOpen, setSidebarOpen] = React.useState(false)

  // Generate session ID only once on mount, and only if we don't have one
  React.useEffect(() => {
    // Only generate a new session ID if we don't already have one
    if (currentSessionId === null) {
      const newSessionId = `session_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`
      setCurrentSessionId(newSessionId)
    }
  }, [currentSessionId]) // Include currentSessionId in dependency to prevent unnecessary runs
  const startNewChat = () => {
    const newSessionId = `session_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`
    console.log(' Starting new chat with session:', newSessionId)
    setCurrentSessionId(newSessionId)
    setSidebarOpen(false)
  }

  const loadSession = async (session: ChatSession) => {
    console.log(' Loading session:', session.id)
    
    // Only change session if it's actually different
    if (currentSessionId !== session.id) {
      setCurrentSessionId(session.id)
    }
    setSidebarOpen(false)
  }

  return (
    <>      <ChatHistorySidebar
        isOpen={sidebarOpen}
        onToggle={() => setSidebarOpen(!sidebarOpen)}
        onSelectSession={loadSession}
        onNewChat={startNewChat}
        currentSessionId={currentSessionId || undefined}
      />{/* Use key to force remount when session changes */}
      {currentSessionId && (
        <ChatComponent 
          key={currentSessionId} 
          sessionId={currentSessionId} 
          onToggleSidebar={() => setSidebarOpen(!sidebarOpen)}
          onNewChat={startNewChat}
        />
      )}
      
      {/* Loading state while session ID is being generated */}
      {!currentSessionId && (
        <div className="flex h-screen items-center justify-center bg-gray-50">
          <div className="text-center">
            <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
            <p className="text-gray-600">Initializing chat...</p>
          </div>
        </div>
      )}
    </>
  )
}

// Separate component to handle chat functionality
function ChatComponent({ 
  sessionId, 
  onToggleSidebar,
  onNewChat 
}: { 
  sessionId: string, 
  onToggleSidebar: () => void,
  onNewChat: () => void
}) {
  const [initialMessages, setInitialMessages] = React.useState<any[]>([])
  const [isLoadingSession, setIsLoadingSession] = React.useState(true)
  
  // Autopilot state
  const [autopilotState, setAutopilotState] = React.useState<MotiveForceState>({
    enabled: false,
    isGenerating: false,
    currentTurn: 0,
    errorCount: 0
  })
  
  const [autopilotConfig, setAutopilotConfig] = React.useState<MotiveForceConfig>(DEFAULT_MOTIVE_FORCE_CONFIG)
  const [showAutopilotSettings, setShowAutopilotSettings] = React.useState(false)
  const [autopilotTimeoutId, setAutopilotTimeoutId] = React.useState<NodeJS.Timeout | null>(null)

  // Load messages when sessionId changes
  React.useEffect(() => {
    console.log('Loading messages for session:', sessionId)
    setIsLoadingSession(true)
    
    // Make GET request to load existing messages
    fetch(`/api/chat?sessionId=${sessionId}`)
      .then(response => {
        if (response.ok) {
          return response.json()
        } else {
          console.log('No existing messages for session:', sessionId)
          return { messages: [] }
        }
      })
      .then(data => {
        console.log('Loaded', data.messages?.length || 0, 'messages for session')
        setInitialMessages(data.messages || [])
        setIsLoadingSession(false)
      })
      .catch(error => {
        console.error('Error loading messages:', error)
        setInitialMessages([])
        setIsLoadingSession(false)
      })
  }, [sessionId])
  
  // Handle autopilot toggle
  const handleAutopilotToggle = React.useCallback((enabled: boolean) => {
    setAutopilotState(prev => ({
      ...prev,
      enabled,
      currentTurn: enabled ? 0 : prev.currentTurn,
      errorCount: 0
    }));
    
    // Clear any pending autopilot actions
    if (!enabled && autopilotTimeoutId) {
      clearTimeout(autopilotTimeoutId);
      setAutopilotTimeoutId(null);
    }
  }, [autopilotTimeoutId]);
  
  // Save config changes
  const handleSaveAutopilotConfig = async (config: MotiveForceConfig) => {
    try {
      await fetch('/api/motive-force', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'saveConfig',
          data: { config }
        })
      });
      
      setAutopilotConfig(config);
    } catch (error) {
      console.error('Failed to save autopilot config:', error);
    }
  };


  const { messages, input, handleInputChange, handleSubmit, isLoading, setMessages } = useChat({
    id: sessionId,
    api: '/api/chat',
    initialMessages: initialMessages,
    maxSteps: 35, // Allow multiple tool calls
    onError: (error) => {
      console.error('Chat error:', error);
    },
    onFinish: async (message) => {
      // Message storage is now handled by the chat API
      // No need to store separately here
      
      // Trigger autopilot if enabled
      if (
        autopilotState.enabled && 
        autopilotState.currentTurn < autopilotConfig.maxConsecutiveTurns &&
        message.role === 'assistant'
      ) {
        const timeoutId = setTimeout(() => {
          generateAutopilotQuery();
        }, autopilotConfig.delayBetweenTurns);
        
        setAutopilotTimeoutId(timeoutId);
      }
    }
  })

  // Log when component mounts/remounts with new session
  React.useEffect(() => {
    console.log(' Messages loaded:', messages.length)
  }, [sessionId])
  
  // Generate autopilot query
  const generateAutopilotQuery = React.useCallback(async () => {
    if (!sessionId || autopilotState.isGenerating) return;
    
    try {
      setAutopilotState(prev => ({ ...prev, isGenerating: true }));
      
      const response = await fetch('/api/motive-force', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'generate',
          sessionId: sessionId
        })
      });
      
      if (!response.ok) {
        throw new Error('Failed to generate autopilot query');
      }
      
      const { query } = await response.json();
      
      // Add autopilot query as user message
      const autopilotMessage = {
        id: `autopilot-${Date.now()}`,
        role: 'user' as const,
        content: `[Autopilot] ${query}`,
        createdAt: new Date()
      };
      
      setMessages(prev => [...prev, autopilotMessage]);
      
      // Save to chat history
      await fetch(`/api/chat-history/${sessionId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: autopilotMessage })
      });
      
      // Submit the query
      handleInputChange({ target: { value: query } } as any);
      const submitEvent = new Event('submit') as any;
      submitEvent.preventDefault = () => {};
      handleSubmit(submitEvent);
      
      setAutopilotState(prev => ({
        ...prev,
        isGenerating: false,
        currentTurn: prev.currentTurn + 1,
        lastGeneratedAt: new Date()
      }));
      
    } catch (error) {
      console.error('Autopilot error:', error);
      setAutopilotState(prev => ({
        ...prev,
        isGenerating: false,
        errorCount: prev.errorCount + 1
      }));
      
      // Disable autopilot after 3 consecutive errors
      if (autopilotState.errorCount >= 2) {
        handleAutopilotToggle(false);
      }
    }
  }, [sessionId, autopilotState.isGenerating, autopilotState.errorCount, handleSubmit, setMessages, handleAutopilotToggle]);

  React.useEffect(() => {
    console.log(' Messages changed:', messages.length)
  }, [messages.length])

  // Save user messages immediately when sent
  const handleChatSubmit = (e: React.FormEvent, files?: FileList) => {
    e.preventDefault();
    
    // Check if this is an autopilot instruction
    if (autopilotState.enabled && input.trim().toLowerCase().startsWith('/autopilot ')) {
      const instruction = input.trim().substring(11);
      
      fetch('/api/motive-force', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'savePrompt',
          data: { text: instruction, mode: 'append' }
        })
      }).then(() => {
        setMessages(prev => [...prev, {
          id: `system-${Date.now()}`,
          role: 'system' as const,
          content: '✅ Autopilot instructions updated',
          createdAt: new Date()
        }]);
        
        handleInputChange({ target: { value: '' } } as any);
      }).catch(error => {
        console.error('Failed to save autopilot instructions:', error);
      });
      
      return;
    }
    
    console.log('page.tsx: handleChatSubmit called with files:', files)
    if (files && files.length > 0) {
      console.log('page.tsx: Files count:', files.length)
      for (let i = 0; i < files.length; i++) {
        console.log(`page.tsx: File ${i + 1}:`, files[i].name, files[i].type, files[i].size)
      }
      // Use experimental_attachments as per AI SDK v3.3
      handleSubmit(e, {
        experimental_attachments: files
      })
    } else {
      handleSubmit(e)
    }
    
    // User message storage is now handled by the chat API
    // No need to store separately here
  }
  
  // Cleanup on unmount
  React.useEffect(() => {
    return () => {
      if (autopilotTimeoutId) {
        clearTimeout(autopilotTimeoutId);
      }
    };
  }, [autopilotTimeoutId]);
  return (
    <>
      <div className="flex h-screen overflow-hidden bg-gray-50">
        {/* Main chat area */}
        <div className="flex-1 flex flex-col">        {/* Header */}
        <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between shadow-sm">
          <div className="flex items-center gap-4">
            <button
              onClick={onToggleSidebar}
              className="bg-gray-800 text-white px-4 py-2.5 rounded-lg hover:bg-gray-700 transition-colors flex items-center gap-2 text-sm font-medium"
            >
              <span>☰</span>
              <span className="hidden sm:inline">History</span>
            </button>
            
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">
              MCP Chat Client
            </h1>
          </div>
          
          <div className="flex items-center gap-3">
            {/* Navigation Links */}
            <a 
              href="/conscious-memory"
              className="bg-purple-600 text-white px-4 py-2.5 rounded-lg hover:bg-purple-700 transition-colors text-sm flex items-center gap-2 font-medium"
              title="Graph Memory Dashboard"
           >
              🕸️ 
              <span className="hidden sm:inline">Graph</span>
            </a>
            
            <a 
              href="/semantic-memory"
              className="bg-indigo-600 text-white px-4 py-2.5 rounded-lg hover:bg-indigo-700 transition-colors text-sm flex items-center gap-2 font-medium"
              title="Semantic Memory Dashboard"
            >
              🧠 
              <span className="hidden sm:inline">Semantic</span>
            </a>
            
            <a 
              href="/attachments"
              className="bg-green-600 text-white px-4 py-2.5 rounded-lg hover:bg-green-700 transition-colors text-sm flex items-center gap-2 font-medium"
              title="Attachment Dashboard"
            >
              📎 
              <span className="hidden sm:inline">Files</span>
            </a>
            
            
            {/* Autopilot controls */}
            <div className="flex items-center gap-2">
              <MotiveForceToggle
                enabled={autopilotState.enabled}
                onToggle={handleAutopilotToggle}
              />
              
              {autopilotState.enabled && (
                <button
                  onClick={() => setShowAutopilotSettings(true)}
                  className="p-1.5 rounded-md bg-gray-200 hover:bg-gray-300 text-gray-700"
                  title="Autopilot Settings"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                      d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" 
                    />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                      d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" 
                    />
                  </svg>
                </button>
              )}
            </div>
            <button
              onClick={onNewChat}
              className="bg-blue-600 text-white px-4 py-2.5 rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2 text-sm font-medium"
            >
              <span>+</span>
              <span className="hidden sm:inline">New</span>
            </button>
          </div>
        </header>{/* Chat messages area */}
        <div className="flex-1 overflow-y-auto bg-white">
          <div className="max-w-6xl mx-auto px-6 py-6">
            {messages.length === 0 ? (
              <div className="text-center py-12">
                <div className="text-gray-400 text-6xl mb-4">💬</div>
                <p className="text-gray-500 text-lg">Start a conversation...</p>
                <p className="text-gray-400 text-sm mt-2">Ask me anything and I'll help you with your MCP tools!</p>
              </div>
            ) : (
              <div className="space-y-6">
                {messages.map((message) => (
                  <div key={message.id} className={`flex ${
                    message.role === 'user' ? 'justify-end' : 'justify-start'
                  }`}>                    <div className={`max-w-4xl w-full ${
                      message.role === 'user' 
                        ? 'bg-blue-500 text-white rounded-2xl rounded-br-md' 
                        : 'bg-gray-100 text-gray-800 rounded-2xl rounded-bl-md'
                    } p-4 shadow-sm`}>
                      <div className="font-medium text-xs mb-2 uppercase opacity-75">
                        {message.role === 'user' ? 'You' : 'Assistant'}
                      </div>
                      
                      {/* Display message content */}
                      <div className="whitespace-pre-wrap leading-relaxed">{message.content}</div>
                      
                      {/* Display tool calls */}
                      {message.toolInvocations && message.toolInvocations.length > 0 && (
                        <div className="mt-4 space-y-3">
                          {message.toolInvocations.map((toolCall) => (
                            <div key={toolCall.toolCallId} className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 text-sm">
                              <div className="font-medium text-yellow-800 flex items-center gap-2">
                                 🔧 Tool: {toolCall.toolName}
                              </div>
                              <details className="mt-2">
                                <summary className="cursor-pointer text-yellow-700 hover:text-yellow-800">
                                  View details
                                </summary>
                                <div className="mt-2 space-y-2">
                                  <div className="text-yellow-700">
                                    <strong>Arguments:</strong>
                                    <pre className="mt-1 text-xs bg-yellow-100 p-2 rounded overflow-x-auto">
                                      {JSON.stringify(toolCall.args, null, 2)}
                                    </pre>
                                  </div>
                                  {toolCall.state === 'result' && 'result' in toolCall && (
                                    <div className="text-green-700">
                                      <strong>Result:</strong>
                                      <pre className="mt-1 text-xs bg-green-100 p-2 rounded overflow-x-auto">
                                        {JSON.stringify(toolCall.result, null, 2)}
                                      </pre>
                                    </div>
                                  )}
                                  {toolCall.state === 'call' && (
                                    <div className="text-blue-600 flex items-center gap-2">
                                      <div className="animate-spin w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full"></div>
                                      Executing...
                                    </div>
                                  )}
                                </div>
                              </details>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
            
            {isLoading && (
              <div className="flex justify-start">
                <div className="bg-gray-100 rounded-2xl rounded-bl-md p-4 shadow-sm">
                  <div className="flex items-center gap-3 text-gray-500">
                    <div className="flex space-x-1">
                      <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
                      <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{animationDelay: '0.1s'}}></div>
                      <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{animationDelay: '0.2s'}}></div>
                    </div>
                    <span>Assistant is thinking...</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
          {/* Input area */}
        <div className="bg-white border-t border-gray-200 p-4">
          <div className="max-w-6xl mx-auto">
            <MessageInput
              input={input}
              handleInputChange={handleInputChange}
              handleSubmit={handleChatSubmit}
              isLoading={isLoading || autopilotState.isGenerating}
            />
            
            <div className="text-xs text-gray-500 mt-2 text-center">
              Connected MCP servers: filesystem, windows-cli, playwright, sequential-thinking
            </div>
          </div>
        </div>
      </div>
    </div>
    
    {/* Autopilot status indicator */}
    <MotiveForceStatus
      state={autopilotState}
      onStop={() => handleAutopilotToggle(false)}
      onReset={async () => {
        await fetch('/api/motive-force', {
          method: 'POST',
          body: JSON.stringify({ action: 'resetPrompt' })
        });
        handleAutopilotToggle(false);
      }}
    />
    
    {/* Settings modal */}
    <MotiveForceSettings
      isOpen={showAutopilotSettings}
      onClose={() => setShowAutopilotSettings(false)}
      onSave={handleSaveAutopilotConfig}
      initialConfig={autopilotConfig}
    />
  </>
  )
}
