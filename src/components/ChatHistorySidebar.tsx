'use client'

import React from 'react'
import { ChatSession } from '../lib/chat-history'

interface ChatHistorySidebarProps {
  isOpen: boolean
  onToggle: () => void
  onSelectSession: (session: ChatSession) => void
  onNewChat: () => void
  currentSessionId?: string
}

export default function ChatHistorySidebar({ 
  isOpen, 
  onToggle, 
  onSelectSession, 
  onNewChat,
  currentSessionId 
}: ChatHistorySidebarProps) {  const [sessions, setSessions] = React.useState<ChatSession[]>([])
  const [loading, setLoading] = React.useState(true)
  const [searchQuery, setSearchQuery] = React.useState('')
  const [searchResults, setSearchResults] = React.useState<ChatSession[]>([])
  const [isSearching, setIsSearching] = React.useState(false)
  const [searchTimeout, setSearchTimeout] = React.useState<NodeJS.Timeout | null>(null)

  const loadSessions = async () => {
    try {
      setLoading(true)
      const response = await fetch('/api/chat-history')
      const data = await response.json()
      
      if (response.ok) {
        setSessions(data.sessions || [])
      } else {
        console.error('Failed to load sessions:', data.error)
      }
    } catch (error) {
      console.error('Error loading sessions:', error)
    } finally {
      setLoading(false)
    }
  }

  const performSearch = async (query: string) => {
    if (query.length < 5) {
      setSearchResults([])
      setIsSearching(false)
      return
    }

    try {
      setIsSearching(true)
      const response = await fetch(`/api/chat-history/search?q=${encodeURIComponent(query)}`)
      const data = await response.json()
      
      if (response.ok) {
        setSearchResults(data.sessions || [])
      } else {
        console.error('Search failed:', data.error)
        setSearchResults([])
      }
    } catch (error) {
      console.error('Error searching:', error)
      setSearchResults([])
    } finally {
      setIsSearching(false)
    }
  }

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const query = e.target.value
    setSearchQuery(query)

    // Clear existing timeout
    if (searchTimeout) {
      clearTimeout(searchTimeout)
    }

    // Set new timeout for debounced search
    const newTimeout = setTimeout(() => {
      performSearch(query)
    }, 300) // 300ms debounce

    setSearchTimeout(newTimeout)
  }

  const clearSearch = () => {
    setSearchQuery('')
    setSearchResults([])
    setIsSearching(false)
    if (searchTimeout) {
      clearTimeout(searchTimeout)
    }
  }
  React.useEffect(() => {
    if (isOpen) {
      loadSessions()
    }
    
    // Cleanup timeout on unmount
    return () => {
      if (searchTimeout) {
        clearTimeout(searchTimeout)
      }
    }
  }, [isOpen])

  // Determine which sessions to display
  const displaySessions = searchQuery.length >= 5 ? searchResults : sessions
  const isShowingSearchResults = searchQuery.length >= 5

  const deleteSession = async (sessionId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    if (confirm('Are you sure you want to delete this chat?')) {
      try {
        const response = await fetch(`/api/chat-history?sessionId=${sessionId}`, {
          method: 'DELETE',
        })
        
        if (response.ok) {
          await loadSessions() // Reload the list
        } else {
          const data = await response.json()
          console.error('Failed to delete session:', data.error)
        }
      } catch (error) {
        console.error('Error deleting session:', error)
      }
    }
  }

  const clearAllSessions = async () => {
    if (confirm('Are you sure you want to delete ALL chat history? This cannot be undone.')) {
      try {
        const response = await fetch('/api/chat-history?sessionId=all', {
          method: 'DELETE',
        })
        
        if (response.ok) {
          setSessions([])
        } else {
          const data = await response.json()
          console.error('Failed to clear all sessions:', data.error)
        }
      } catch (error) {
        console.error('Error clearing all sessions:', error)
      }
    }
  }
  const handleSessionSelect = (session: ChatSession) => {
    // Let the main page handle fetching fresh session data
    onSelectSession(session)
  }

  const formatDate = (date: Date | string) => {
    const dateObj = typeof date === 'string' ? new Date(date) : date
    const now = new Date()
    const diff = now.getTime() - dateObj.getTime()
    const days = Math.floor(diff / (1000 * 60 * 60 * 24))
    
    if (days === 0) {
      return dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    } else if (days === 1) {
      return 'Yesterday'
    } else if (days < 7) {
      return `${days} days ago`
    } else {
      return dateObj.toLocaleDateString()
    }
  }
  return (
    <>
      {/* Overlay for mobile */}
      {isOpen && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 z-40 lg:hidden"
          onClick={onToggle}
        />
      )}
      
      {/* Sidebar */}
      <div className={`
        fixed top-0 left-0 h-full bg-white border-r border-gray-200 z-50 transform transition-transform duration-300 ease-in-out shadow-xl
        ${isOpen ? 'translate-x-0' : '-translate-x-full'}
        w-80 flex flex-col
      `}>
        {/* Header */}
        <div className="p-4 border-b border-gray-200 flex items-center justify-between bg-gray-50">
          <h2 className="text-lg font-semibold text-gray-900">Chat History</h2>
          <button 
            onClick={onToggle}
            className="text-gray-400 hover:text-gray-600 p-2 rounded-lg hover:bg-gray-100 transition-colors"
          >
            <svg className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          </button>
        </div>

        {/* New Chat Button */}
        <div className="p-4 border-b border-gray-200">
          <button
            onClick={onNewChat}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white py-3 px-4 rounded-xl transition-colors flex items-center justify-center gap-2 font-medium shadow-sm"
          >
            <svg className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
            </svg>
            New Chat
          </button>
        </div>

        {/* Search Input */}
        <div className="p-4 border-b border-gray-200">
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <svg className="h-4 w-4 text-gray-400" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clipRule="evenodd" />
              </svg>
            </div>
            <input
              type="text"
              placeholder="Search chats (min 5 chars)..."
              value={searchQuery}
              onChange={handleSearchChange}
              className="w-full pl-10 pr-10 py-2.5 bg-gray-50 text-gray-900 placeholder-gray-500 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors"
            />
            {searchQuery && (
              <button
                onClick={clearSearch}
                className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600"
                title="Clear search"
              >
                <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
              </button>
            )}
          </div>
          {isShowingSearchResults && (
            <div className="mt-3 text-xs text-gray-500 flex items-center gap-2">
              {isSearching ? (
                <>
                  <div className="w-3 h-3 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                  <span>Searching...</span>
                </>
              ) : (
                <>
                  <svg className="w-3 h-3 text-blue-500" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clipRule="evenodd" />
                  </svg>
                  <span>{searchResults.length} result{searchResults.length !== 1 ? 's' : ''} found</span>
                </>
              )}
            </div>
          )}
          {searchQuery.length > 0 && searchQuery.length < 5 && (
            <div className="mt-3 text-xs text-amber-600 flex items-center gap-2">
              <svg className="w-3 h-3" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
              <span>Need at least 5 characters to search</span>
            </div>
          )}
        </div>

        {/* Chat List */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="p-6 text-gray-500 text-center">
              <div className="flex items-center justify-center gap-3">
                <div className="w-5 h-5 border-2 border-gray-300 border-t-blue-500 rounded-full animate-spin"></div>
                <span>Loading chat history...</span>
              </div>
            </div>
          ) : isShowingSearchResults && searchResults.length === 0 ? (
            <div className="p-6 text-gray-500 text-center">
              <div className="text-4xl mb-3">🔍</div>
              <div className="text-gray-600 mb-2">No chats found</div>
              <div className="text-sm text-gray-500 mb-3">for "{searchQuery}"</div>
              <button 
                onClick={clearSearch}
                className="text-blue-500 hover:text-blue-600 text-sm font-medium underline"
              >
                Clear search
              </button>
            </div>
          ) : !isShowingSearchResults && sessions.length === 0 ? (
            <div className="p-6 text-gray-500 text-center">
              <div className="text-4xl mb-3">💬</div>
              <div className="text-gray-600">No chat history yet</div>
              <div className="text-sm text-gray-500 mt-1">Start a new conversation!</div>
            </div>
          ) : (
            <div className="p-3 space-y-1">
              {displaySessions.map((session) => (
                <div
                  key={session.id}
                  className={`
                    group p-3 rounded-xl cursor-pointer transition-all duration-200
                    ${currentSessionId === session.id 
                      ? 'bg-blue-50 border-2 border-blue-200 shadow-sm' 
                      : 'hover:bg-gray-50 border-2 border-transparent'
                    }
                  `}
                  onClick={() => handleSessionSelect(session)}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-gray-900 truncate leading-5">
                        {isShowingSearchResults ? (
                          <span dangerouslySetInnerHTML={{
                            __html: session.title.replace(
                              new RegExp(`(${searchQuery})`, 'gi'),
                              '<mark class="bg-yellow-200 text-gray-900 px-1 rounded">$1</mark>'
                            )
                          }} />
                        ) : (
                          session.title
                        )}
                      </div>
                      <div className="text-xs text-gray-500 mt-1 flex items-center gap-2">
                        <span>{formatDate(session.updatedAt)}</span>
                        <span>•</span>
                        <span>{session.messageCount ?? session.messages?.length ?? 0} messages</span>
                        {isShowingSearchResults && (
                          <>
                            <span>•</span>
                            <span className="text-blue-500 font-medium">🔍</span>
                          </>
                        )}
                      </div>
                    </div>
                    <button
                      onClick={(e) => deleteSession(session.id, e)}
                      className="ml-3 text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all duration-200 p-1.5 rounded-lg hover:bg-red-50"
                      title="Delete chat"
                    >
                      <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                      </svg>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        {sessions.length > 0 && (
          <div className="p-4 border-t border-gray-200 bg-gray-50">
            <button
              onClick={clearAllSessions}
              className="w-full text-red-500 hover:text-red-600 hover:bg-red-50 text-sm py-2 px-3 rounded-lg transition-colors font-medium"
            >
              Clear All History
            </button>
          </div>
        )}
      </div>
    </>
  )
}
