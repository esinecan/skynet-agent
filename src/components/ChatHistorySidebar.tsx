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

  const loadSessionDetails = async (session: ChatSession) => {
    try {
      const response = await fetch(`/api/chat-history/${session.id}`)
      const data = await response.json()
      
      if (response.ok) {
        onSelectSession(data.session)
      } else {
        console.error('Failed to load session details:', data.error)
        // Fallback to basic session data
        onSelectSession(session)
      }
    } catch (error) {
      console.error('Error loading session details:', error)
      // Fallback to basic session data
      onSelectSession(session)
    }
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
        fixed top-0 left-0 h-full bg-gray-900 text-white z-50 transform transition-transform duration-300 ease-in-out
        ${isOpen ? 'translate-x-0' : '-translate-x-full'}
        w-80
      `}>
        {/* Header */}
        <div className="p-4 border-b border-gray-700 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Chat History</h2>
          <button 
            onClick={onToggle}
            className="text-gray-400 hover:text-white p-1"
          >
            ✕
          </button>
        </div>        {/* New Chat Button */}
        <div className="p-4 border-b border-gray-700">
          <button
            onClick={onNewChat}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white py-2 px-4 rounded-lg transition-colors flex items-center justify-center gap-2"
          >
            <span>+</span>
            New Chat
          </button>
        </div>

        {/* Search Input */}
        <div className="p-4 border-b border-gray-700">
          <div className="relative">
            <input
              type="text"
              placeholder="Search chats (min 5 chars)..."
              value={searchQuery}
              onChange={handleSearchChange}
              className="w-full bg-gray-800 text-white placeholder-gray-400 border border-gray-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            {searchQuery && (
              <button
                onClick={clearSearch}
                className="absolute right-2 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-white p-1"
                title="Clear search"
              >
                ✕
              </button>
            )}
          </div>
          {isShowingSearchResults && (
            <div className="mt-2 text-xs text-gray-400">
              {isSearching ? (
                <span>🔍 Searching...</span>
              ) : (
                <span>📍 {searchResults.length} result{searchResults.length !== 1 ? 's' : ''} found</span>
              )}
            </div>
          )}
          {searchQuery.length > 0 && searchQuery.length < 5 && (
            <div className="mt-2 text-xs text-yellow-400">
              ⚠️ Need at least 5 characters to search
            </div>
          )}
        </div>        {/* Chat List */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="p-4 text-gray-400 text-center">
              <div className="animate-pulse">Loading chat history...</div>
            </div>
          ) : isShowingSearchResults && searchResults.length === 0 ? (
            <div className="p-4 text-gray-400 text-center">
              <div className="text-center">
                <div className="text-2xl mb-2">🔍</div>
                <div>No chats found for "{searchQuery}"</div>
                <button 
                  onClick={clearSearch}
                  className="mt-2 text-blue-400 hover:text-blue-300 text-sm underline"
                >
                  Clear search
                </button>
              </div>
            </div>
          ) : !isShowingSearchResults && sessions.length === 0 ? (
            <div className="p-4 text-gray-400 text-center">
              No chat history yet
            </div>
          ) : (
            <div className="p-2">
              {displaySessions.map((session) => (
                <div
                  key={session.id}
                  className={`
                    group p-3 mb-2 rounded-lg cursor-pointer transition-colors
                    ${currentSessionId === session.id 
                      ? 'bg-blue-600' 
                      : 'hover:bg-gray-800'
                    }
                  `}
                  onClick={() => loadSessionDetails(session)}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">
                        {isShowingSearchResults ? (
                          <span dangerouslySetInnerHTML={{
                            __html: session.title.replace(
                              new RegExp(`(${searchQuery})`, 'gi'),
                              '<mark class="bg-yellow-300 text-black px-1 rounded">$1</mark>'
                            )
                          }} />
                        ) : (
                          session.title
                        )}
                      </div>
                      <div className="text-xs text-gray-400 mt-1">
                        {formatDate(session.updatedAt)} • {session.messageCount ?? session.messages?.length ?? 0} messages
                        {isShowingSearchResults && (
                          <span className="ml-2 text-yellow-400">🔍</span>
                        )}
                      </div>
                    </div>
                    <button
                      onClick={(e) => deleteSession(session.id, e)}
                      className="ml-2 text-gray-400 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity p-1"
                      title="Delete chat"
                    >
                      🗑️
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        {sessions.length > 0 && (
          <div className="p-4 border-t border-gray-700">
            <button
              onClick={clearAllSessions}
              className="w-full text-red-400 hover:text-red-300 text-sm py-2 transition-colors"
            >
              Clear All History
            </button>
          </div>
        )}
      </div>
    </>
  )
}
