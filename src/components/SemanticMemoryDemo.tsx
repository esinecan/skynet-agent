/**
 * Semantic Memory Demo Component
 * Interactive demo of the semantic memory (RAG) system
 */

'use client';

import { useState, useEffect } from 'react';

interface SemanticMemory {
  id: string;
  text: string;
  score: number;
  metadata: {
    sessionId: string;
    timestamp: string;
    messageType: 'user' | 'assistant';
    textLength: number;
  };
}

interface MemoryStats {
  totalMemories: number;
  healthStatus: boolean;
  testStatus?: boolean;
}

interface SearchResult {
  shouldRetrieve: boolean;
  memories: SemanticMemory[];
  context: string;
  retrievalTime: number;
}

export default function SemanticMemoryDemo() {
  const [allMemories, setAllMemories] = useState<SemanticMemory[]>([]);
  const [searchResults, setSearchResults] = useState<SemanticMemory[]>([]);
  const [stats, setStats] = useState<MemoryStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [diagnostics, setDiagnostics] = useState<any>(null);
  const [showDiagnostics, setShowDiagnostics] = useState(false);

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [memoriesPerPage] = useState(10);

  // Form state
  const [searchQuery, setSearchQuery] = useState('');
  const [conversationForm, setConversationForm] = useState({
    userMessage: '',
    assistantMessage: '',
    sessionId: ''
  });

  const fetchStats = async () => {
    try {
      const response = await fetch('/api/memory?action=stats');
      const data = await response.json();
      if (data.success) {
        setStats({
          totalMemories: data.data.totalMemories || 0,
          healthStatus: data.data.healthy || false
        });
        setError(null);
      } else {
        setError(data.error || 'Failed to fetch stats');
        console.error('Stats error:', data);
      }
    } catch (err) {
      console.error('Failed to fetch stats:', err);
      setError('Network error - is the server running?');
    }
  };

  const fetchDiagnostics = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/memory?action=diagnostics');
      const data = await response.json();
      if (data.success) {
        setDiagnostics(data.data);
        setShowDiagnostics(true);
      } else {
        setError(data.error || 'Failed to fetch diagnostics');
      }
    } catch (err) {
      setError('Failed to fetch diagnostics');
    } finally {
      setLoading(false);
    }
  };

  const performHealthCheck = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/memory?action=health');
      const data = await response.json();
      if (data.success) {
        setStats(prev => ({
          ...prev,
          healthStatus: data.data.healthy,
          totalMemories: prev?.totalMemories || 0
        }));
        setError(null);
      } else {
        setError(data.error || 'Health check failed');
        if (data.diagnostics) {
          setDiagnostics({ chromaDB: { connected: false, details: data.diagnostics } });
          setShowDiagnostics(true);
        }
      }
    } catch (err) {
      setError('Health check failed - network error');
    } finally {
      setLoading(false);
    }
  };

  const testMemorySystem = async () => {
    setLoading(true);
    setError(null);
    console.log('🧪 Testing semantic memory system...');
    
    try {
      const response = await fetch('/api/memory?action=test');
      const data = await response.json();
      console.log('🧪 Test response:', data);
      
      if (data.success) {
        setStats(prev => ({
          ...prev,
          testStatus: data.data.testPassed,
          totalMemories: prev?.totalMemories || 0,
          healthStatus: prev?.healthStatus || false
        }));
        console.log('🧪 Memory system test passed:', data.data.testPassed);
      } else {
        setError(data.error || 'Memory system test failed');
        if (data.diagnostics) {
          setDiagnostics({ chromaDB: { connected: false, details: data.diagnostics } });
          setShowDiagnostics(true);
        }
      }
    } catch (err) {
      setError('Network error during test');
    } finally {
      setLoading(false);
    }
  };

  const storeConversation = async () => {
    if (!conversationForm.userMessage.trim() || !conversationForm.assistantMessage.trim()) {
      setError('Both user and assistant messages are required');
      return;
    }

    setLoading(true);
    setError(null);
    console.log('💾 Storing conversation:', conversationForm);
    
    try {
      const response = await fetch('/api/memory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'store',
          userMessage: conversationForm.userMessage,
          assistantMessage: conversationForm.assistantMessage,
          sessionId: conversationForm.sessionId
        })
      });
      
      const data = await response.json();
      console.log('💾 Store response:', data);
      
      if (data.success) {
        console.log('💾 Conversation stored successfully');
        setConversationForm({
          userMessage: '',
          assistantMessage: '',
          sessionId: conversationForm.sessionId
        });
        await fetchStats();
        setError(null);
      } else {
        setError(data.error || 'Failed to store conversation');
        if (data.diagnostics) {
          setDiagnostics({ chromaDB: { connected: false, details: data.diagnostics } });
          setShowDiagnostics(true);
        }
      }
    } catch (err) {
      setError('Network error while storing conversation');
    } finally {
      setLoading(false);
    }
  };

  const searchMemories = async () => {
    setLoading(true);
    setError(null);
    setCurrentPage(1); // Reset to first page on new search
    console.log('🔍 Searching semantic memories for:', searchQuery || '(empty - list all)');
    
    try {
      const isListAll = !searchQuery || searchQuery.trim().length === 0;
      const response = await fetch('/api/memory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'search',
          query: searchQuery,
          sessionId: conversationForm.sessionId,
          listAll: isListAll // Tell backend to return all memories for empty queries
        })
      });
      
      const data = await response.json();
      console.log('🔍 Search response:', data);
      
      if (data.success) {
        const result: SearchResult = data.data;
        const memories = result.memories || [];
        
        if (isListAll) {
          // For list all (empty query), store all memories and set search results for pagination
          setAllMemories(memories);
          setSearchResults(memories);
        } else {
          // For regular search, just set search results
          setAllMemories([]);
          setSearchResults(memories);
        }
        
        console.log(`🔍 Found ${memories.length} memories in ${result.retrievalTime}ms`);
        console.log('🔍 Should retrieve:', result.shouldRetrieve);
        console.log('🔍 Context generated:', result.context ? 'Yes' : 'No');
        setError(null);
      } else {
        setError(data.error || 'Failed to search memories');
        setSearchResults([]);
        setAllMemories([]);
        if (data.diagnostics) {
          setDiagnostics({ chromaDB: { connected: false, details: data.diagnostics } });
          setShowDiagnostics(true);
        }
      }
    } catch (err) {
      setError('Network error while searching memories');
      setSearchResults([]);
    } finally {
      setLoading(false);
    }
  };

  const deleteMemory = async (memoryId: string) => {
    if (!confirm('Are you sure you want to delete this memory? This action cannot be undone.')) {
      return;
    }

    setLoading(true);
    setError(null);
    console.log('🗑️ Deleting memory:', memoryId);
    
    try {
      const response = await fetch('/api/memory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'delete',
          memoryId: memoryId
        })
      });
      
      const data = await response.json();
      console.log('🗑️ Delete response:', data);
      
      if (data.success) {
        console.log('🗑️ Memory deleted successfully');
        // Remove the deleted memory from both search results and all memories
        setSearchResults(prev => prev.filter(memory => memory.id !== memoryId));
        setAllMemories(prev => prev.filter(memory => memory.id !== memoryId));
        // Refresh stats to update memory count
        await fetchStats();
        setError(null);
      } else {
        setError(data.error || 'Failed to delete memory');
      }
    } catch (err) {
      setError('Network error while deleting memory');
    } finally {
      setLoading(false);
    }
  };

  const deleteAllCurrentResults = async () => {
    const memoriesToDelete = currentMemories.map(memory => memory.id);
    if (memoriesToDelete.length === 0) {
      return;
    }

    if (!confirm(`Are you sure you want to delete all ${memoriesToDelete.length} memories on this page? This action cannot be undone.`)) {
      return;
    }

    setLoading(true);
    setError(null);
    console.log('🗑️ Bulk deleting memories:', memoriesToDelete);
    
    try {
      const response = await fetch('/api/memory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'deleteBulk',
          memoryIds: memoriesToDelete
        })
      });
      
      const data = await response.json();
      console.log('🗑️ Bulk delete response:', data);
      
      if (data.success) {
        console.log(`🗑️ ${data.data.count} memories deleted successfully`);
        // Remove the deleted memories from both search results and all memories
        setSearchResults(prev => prev.filter(memory => !memoriesToDelete.includes(memory.id)));
        setAllMemories(prev => prev.filter(memory => !memoriesToDelete.includes(memory.id)));
        // Reset to first page if current page is now empty
        if (currentMemories.length === memoriesToDelete.length && currentPage > 1) {
          setCurrentPage(1);
        }
        // Refresh stats to update memory count
        await fetchStats();
        setError(null);
      } else {
        setError(data.error || 'Failed to delete memories');
      }
    } catch (err) {
      setError('Network error while deleting memories');
    } finally {
      setLoading(false);
    }
  };

  // Pagination logic
  const totalMemories = allMemories.length > 0 ? allMemories.length : searchResults.length;
  const totalPages = Math.ceil(totalMemories / memoriesPerPage);
  const startIndex = (currentPage - 1) * memoriesPerPage;
  const endIndex = startIndex + memoriesPerPage;
  
  // Get current page memories
  const currentMemories = allMemories.length > 0 
    ? allMemories.slice(startIndex, endIndex)
    : searchResults.slice(startIndex, endIndex);

  const goToPage = (page: number) => {
    setCurrentPage(page);
  };

  const nextPage = () => {
    if (currentPage < totalPages) {
      setCurrentPage(currentPage + 1);
    }
  };

  const prevPage = () => {
    if (currentPage > 1) {
      setCurrentPage(currentPage - 1);
    }
  };

  useEffect(() => {
    fetchStats();
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-50 p-8 text-gray-900">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-gray-800 mb-4">
            🧠 Semantic Memory System
          </h1>
          <p className="text-lg text-gray-600 max-w-2xl mx-auto">
            An intelligent RAG-based memory system that automatically stores conversations
            and retrieves relevant context using vector similarity search.
          </p>
        </div>

        {error && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-6">
            <div className="flex justify-between items-start">
              <div>
                <strong>Error:</strong> {error}
              </div>
              <button
                onClick={fetchDiagnostics}
                className="text-sm bg-red-600 text-white px-3 py-1 rounded hover:bg-red-700"
              >
                🔧 Run Diagnostics
              </button>
            </div>
          </div>
        )}

        {/* Diagnostics Panel */}
        {showDiagnostics && diagnostics && (
          <div className="bg-yellow-50 border border-yellow-400 rounded-lg p-6 mb-8">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold text-yellow-800">🔧 System Diagnostics</h3>
              <button
                onClick={() => setShowDiagnostics(false)}
                className="text-yellow-800 hover:text-yellow-900"
              >
                ✕
              </button>
            </div>
            
            <div className="space-y-4">
              {/* ChromaDB Status */}
              <div>
                <h4 className="font-semibold text-yellow-800 mb-2">ChromaDB Status:</h4>
                <div className="bg-white rounded p-3 space-y-2">
                  <div>
                    <span className="font-medium">Connected:</span>{' '}
                    <span className={diagnostics.chromaDB?.connected ? 'text-green-600' : 'text-red-600'}>
                      {diagnostics.chromaDB?.connected ? '✓ Yes' : '✗ No'}
                    </span>
                  </div>
                  {diagnostics.chromaDB?.error && (
                    <div>
                      <span className="font-medium">Error:</span>{' '}
                      <span className="text-red-600">{diagnostics.chromaDB.error}</span>
                    </div>
                  )}
                  {diagnostics.chromaDB?.details && (
                    <div>
                      <span className="font-medium">URL:</span>{' '}
                      {diagnostics.chromaDB.details.url}
                    </div>
                  )}
                </div>
              </div>

              {/* Environment */}
              {diagnostics.environment && (
                <div>
                  <h4 className="font-semibold text-yellow-800 mb-2">Environment:</h4>
                  <div className="bg-white rounded p-3 space-y-1 text-sm">
                    {Object.entries(diagnostics.environment).map(([key, value]) => (
                      <div key={key}>
                        <span className="font-medium">{key}:</span>{' '}
                        <span className={
                          value === 'Not set' ? 'text-red-600' : 
                          value === 'Set' ? 'text-green-600' : ''
                        }>
                          {String(value)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Instructions */}
              {diagnostics.instructions && (
                <div>
                  <h4 className="font-semibold text-yellow-800 mb-2">Fix Instructions:</h4>
                  <div className="bg-white rounded p-3 space-y-3">
                    {Object.entries(diagnostics.instructions).map(([key, steps]) => (
                      <div key={key}>
                        <h5 className="font-medium text-gray-700 mb-1">
                          {key.replace(/([A-Z])/g, ' $1').trim()}:
                        </h5>
                        <ol className="list-decimal list-inside space-y-1 text-sm text-gray-600">
                          {(steps as string[]).map((step, idx) => (
                            <li key={idx}>{step}</li>
                          ))}
                        </ol>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Stats Dashboard */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="bg-white rounded-lg shadow-md p-6">
            <h3 className="text-lg font-semibold text-gray-700 mb-2">Total Memories</h3>
            <p className="text-3xl font-bold text-blue-600">
              {stats?.totalMemories || 0}
            </p>
          </div>
          
          <div className="bg-white rounded-lg shadow-md p-6">
            <h3 className="text-lg font-semibold text-gray-700 mb-2">Health Status</h3>
            <p className={`text-3xl font-bold ${stats?.healthStatus ? 'text-green-600' : 'text-red-600'}`}>
              {stats?.healthStatus ? '✓ Healthy' : '✗ Offline'}
            </p>
          </div>
          
          <div className="bg-white rounded-lg shadow-md p-6">
            <h3 className="text-lg font-semibold text-gray-700 mb-2">Test Status</h3>
            <p className={`text-2xl font-bold ${
              stats?.testStatus === true ? 'text-green-600' :
              stats?.testStatus === false ? 'text-red-600' : 'text-gray-400'
            }`}>
              {stats?.testStatus === true ? '✓ Passed' :
               stats?.testStatus === false ? '✗ Failed' : '? Not Tested'}
            </p>
          </div>
        </div>

        {/* System Actions */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-8">
          <h2 className="text-2xl font-bold text-gray-800 mb-4">🛠️ System Management</h2>
          
          <div className="flex gap-4">
            <button
              onClick={performHealthCheck}
              disabled={loading}
              className="bg-green-600 text-white px-6 py-2 rounded-md hover:bg-green-700 disabled:opacity-50"
            >
              {loading ? 'Checking...' : '🏥 Health Check'}
            </button>
            
            <button
              onClick={testMemorySystem}
              disabled={loading}
              className="bg-yellow-600 text-white px-6 py-2 rounded-md hover:bg-yellow-700 disabled:opacity-50"
            >
              {loading ? 'Testing...' : '🧪 Test System'}
            </button>
            
            <button
              onClick={fetchDiagnostics}
              disabled={loading}
              className="bg-blue-600 text-white px-6 py-2 rounded-md hover:bg-blue-700 disabled:opacity-50"
            >
              {loading ? 'Loading...' : '🔧 Diagnostics'}
            </button>
          </div>
        </div>

        {/* Store Conversation */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-8">
          <h2 className="text-2xl font-bold text-gray-800 mb-4">💾 Store Conversation</h2>
          
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Session ID
              </label>
              <input
                type="text"
                value={conversationForm.sessionId}
                onChange={(e) => setConversationForm({ ...conversationForm, sessionId: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder=""
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                User Message
              </label>
              <textarea
                value={conversationForm.userMessage}
                onChange={(e) => setConversationForm({ ...conversationForm, userMessage: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                rows={3}
                placeholder="What the user said..."
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Assistant Message
              </label>
              <textarea
                value={conversationForm.assistantMessage}
                onChange={(e) => setConversationForm({ ...conversationForm, assistantMessage: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                rows={3}
                placeholder="How the assistant responded..."
              />
            </div>
            
            <button
              onClick={storeConversation}
              disabled={loading || !conversationForm.userMessage.trim() || !conversationForm.assistantMessage.trim()}
              className="bg-blue-600 text-white px-6 py-2 rounded-md hover:bg-blue-700 disabled:opacity-50"
            >
              {loading ? 'Storing...' : 'Store Conversation'}
            </button>
          </div>
        </div>

        {/* Search Memories */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-8">
          <h2 className="text-2xl font-bold text-gray-800 mb-4">🔍 Search Semantic Memories</h2>
          
          <div className="flex gap-4 mb-4">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Search for similar conversations..."
              onKeyPress={(e) => e.key === 'Enter' && searchMemories()}
            />
            <button
              onClick={searchMemories}
              disabled={loading}
              className="bg-indigo-600 text-white px-6 py-2 rounded-md hover:bg-indigo-700 disabled:opacity-50"
            >
              {loading ? 'Searching...' : 'Search'}
            </button>
          </div>

          {/* Search Results */}
          {(searchResults.length > 0 || allMemories.length > 0) && (
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <h3 className="text-lg font-semibold text-gray-700">
                  Found {totalMemories} relevant memories:
                </h3>
                <div className="flex items-center gap-3">
                  {currentMemories.length > 0 && (
                    <button
                      onClick={deleteAllCurrentResults}
                      disabled={loading}
                      className="text-red-600 hover:text-red-800 disabled:opacity-50 px-3 py-1 border border-red-300 rounded-md hover:bg-red-50 text-sm"
                      title={`Delete all ${currentMemories.length} memories on this page`}
                    >
                      Delete Page ({currentMemories.length})
                    </button>
                  )}
                  {totalPages > 1 && (
                    <span className="text-sm text-gray-500">
                      Showing {startIndex + 1}-{Math.min(endIndex, totalMemories)} of {totalMemories}
                    </span>
                  )}
                </div>
              </div>
              
              {/* Pagination Controls */}
              {totalPages > 1 && (
                <div className="flex justify-center items-center gap-2 pb-4">
                  <button
                    onClick={prevPage}
                    disabled={currentPage === 1}
                    className="px-3 py-1 border border-gray-300 rounded-md disabled:opacity-50 hover:bg-gray-50"
                  >
                    Previous
                  </button>
                  
                  {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                    const pageNum = currentPage <= 3 ? i + 1 : currentPage - 2 + i;
                    if (pageNum > totalPages) return null;
                    return (
                      <button
                        key={pageNum}
                        onClick={() => goToPage(pageNum)}
                        className={`px-3 py-1 border rounded-md ${
                          currentPage === pageNum
                            ? 'bg-indigo-600 text-white border-indigo-600'
                            : 'border-gray-300 hover:bg-gray-50'
                        }`}
                      >
                        {pageNum}
                      </button>
                    );
                  })}
                  
                  <button
                    onClick={nextPage}
                    disabled={currentPage === totalPages}
                    className="px-3 py-1 border border-gray-300 rounded-md disabled:opacity-50 hover:bg-gray-50"
                  >
                    Next
                  </button>
                </div>
              )}
              
              {currentMemories.map((memory, index) => (
                <div key={memory.id || index} className="border border-gray-200 rounded-lg p-4">
                  <div className="flex justify-between items-start mb-2">
                    <div className="flex items-center gap-4">
                      <span className="text-sm text-gray-500">Similarity:</span>
                      <span className="font-semibold text-indigo-600">
                        {(memory.score * 100).toFixed(1)}%
                      </span>
                      <span className="text-sm text-gray-500">Type:</span>
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                        memory.metadata.messageType === 'user' 
                          ? 'bg-blue-100 text-blue-800' 
                          : 'bg-green-100 text-green-800'
                      }`}>
                        {memory.metadata.messageType}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-500">
                        {new Date(memory.metadata.timestamp).toLocaleString()}
                      </span>
                      <button
                        onClick={() => deleteMemory(memory.id)}
                        disabled={loading}
                        className="text-red-600 hover:text-red-800 disabled:opacity-50 p-1"
                        title="Delete memory"
                      >
                        🗑️
                      </button>
                    </div>
                  </div>
                  
                  <p className="text-gray-800 mb-2">{memory.text}</p>
                  
                  <div className="text-sm text-gray-600 space-y-1">
                    <div>Session: {memory.metadata.sessionId}</div>
                    <div>Length: {memory.metadata.textLength} characters</div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {totalMemories === 0 && searchQuery && !loading && !error && (
            <div className="text-center py-8 text-gray-500">
              No memories found for "{searchQuery}"
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
