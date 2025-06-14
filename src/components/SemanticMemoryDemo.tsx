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
  const [searchResults, setSearchResults] = useState<SemanticMemory[]>([]);
  const [stats, setStats] = useState<MemoryStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [searchQuery, setSearchQuery] = useState('');
  const [conversationForm, setConversationForm] = useState({
    userMessage: '',
    assistantMessage: '',
    sessionId: 'demo-session'
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
      }
    } catch (err) {
      console.error('Failed to fetch stats:', err);
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
      }
    } catch (err) {
      setError('Health check failed');
    } finally {
      setLoading(false);
    }
  };

  const testMemorySystem = async () => {
    setLoading(true);
    setError(null);
    console.log(' Testing semantic memory system...');
    
    try {
      const response = await fetch('/api/memory?action=test');
      const data = await response.json();
      console.log(' Test response:', data);
      
      if (data.success) {
        setStats(prev => ({
          ...prev,
          testStatus: data.data.testPassed,
          totalMemories: prev?.totalMemories || 0,
          healthStatus: prev?.healthStatus || false
        }));
        console.log(' Memory system test passed:', data.data.testPassed);
      } else {
        setError(data.error || 'Memory system test failed');
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
    console.log(' Storing conversation:', conversationForm);
    
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
      console.log(' Store response:', data);
      
      if (data.success) {
        console.log(' Conversation stored successfully');
        setConversationForm({
          userMessage: '',
          assistantMessage: '',
          sessionId: conversationForm.sessionId
        });
        await fetchStats();
      } else {
        setError(data.error || 'Failed to store conversation');
      }
    } catch (err) {
      setError('Network error while storing conversation');
    } finally {
      setLoading(false);
    }
  };

  const searchMemories = async () => {
    if (!searchQuery.trim()) {
      setError('Search query is required');
      return;
    }

    setLoading(true);
    setError(null);
    console.log(' Searching semantic memories for:', searchQuery);
    
    try {
      const response = await fetch('/api/memory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'search',
          query: searchQuery,
          sessionId: conversationForm.sessionId
        })
      });
      
      const data = await response.json();
      console.log(' Search response:', data);
      
      if (data.success) {
        const result: SearchResult = data.data;
        setSearchResults(result.memories || []);
        console.log(` Found ${result.memories?.length || 0} memories in ${result.retrievalTime}ms`);
        console.log(' Should retrieve:', result.shouldRetrieve);
        console.log(' Context generated:', result.context ? 'Yes' : 'No');
      } else {
        setError(data.error || 'Failed to search memories');
      }
    } catch (err) {
      setError('Network error while searching memories');
    } finally {
      setLoading(false);
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
             Semantic Memory System
          </h1>
          <p className="text-lg text-gray-600 max-w-2xl mx-auto">
            An intelligent RAG-based memory system that automatically stores conversations
            and retrieves relevant context using vector similarity search.
          </p>
        </div>

        {error && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-6">
            {error}
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
              {stats?.healthStatus ? 'Healthy' : 'Offline'}
            </p>
          </div>
          
          <div className="bg-white rounded-lg shadow-md p-6">
            <h3 className="text-lg font-semibold text-gray-700 mb-2">Test Status</h3>
            <p className={`text-2xl font-bold ${
              stats?.testStatus === true ? 'text-green-600' :
              stats?.testStatus === false ? 'text-red-600' : 'text-gray-400'
            }`}>
              {stats?.testStatus === true ? 'Passed' :
               stats?.testStatus === false ? 'Failed' : 'Not Tested'}
            </p>
          </div>
        </div>

        {/* System Actions */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-8">
          <h2 className="text-2xl font-bold text-gray-800 mb-4"> System Management</h2>
          
          <div className="flex gap-4">
            <button
              onClick={performHealthCheck}
              disabled={loading}
              className="bg-green-600 text-white px-6 py-2 rounded-md hover:bg-green-700 disabled:opacity-50"
            >
              {loading ? 'Checking...' : ' Health Check'}
            </button>
            
            <button
              onClick={testMemorySystem}
              disabled={loading}
              className="bg-yellow-600 text-white px-6 py-2 rounded-md hover:bg-yellow-700 disabled:opacity-50"
            >
              {loading ? 'Testing...' : ' Test System'}
            </button>
          </div>
        </div>

        {/* Store Conversation */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-8">
          <h2 className="text-2xl font-bold text-gray-800 mb-4"> Store Conversation</h2>
          
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
                placeholder="demo-session"
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
          <h2 className="text-2xl font-bold text-gray-800 mb-4"> Search Semantic Memories</h2>
          
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
              disabled={loading || !searchQuery.trim()}
              className="bg-indigo-600 text-white px-6 py-2 rounded-md hover:bg-indigo-700 disabled:opacity-50"
            >
              {loading ? 'Searching...' : 'Search'}
            </button>
          </div>

          {/* Search Results */}
          {searchResults.length > 0 && (
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-gray-700">
                Found {searchResults.length} relevant memories:
              </h3>
              
              {searchResults.map((memory, index) => (
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
                    <span className="text-xs text-gray-500">
                      {new Date(memory.metadata.timestamp).toLocaleString()}
                    </span>
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

          {searchResults.length === 0 && searchQuery && (
            <div className="text-center py-8 text-gray-500">
              No memories found for "{searchQuery}"
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
