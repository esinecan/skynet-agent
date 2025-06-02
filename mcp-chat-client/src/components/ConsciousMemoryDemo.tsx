/**
 * Conscious Memory Demo Component
 * Interactive demo of the conscious memory system
 */

'use client';

import { useState, useEffect } from 'react';

interface ConsciousMemory {
  id: string;
  text: string;
  tags: string[];
  importance: number;
  source: string;
  context?: string;
  score?: number;
}

interface MemoryStats {
  totalConsciousMemories: number;
  tagCount: number;
  averageImportance: number;
  sourceBreakdown: Record<string, number>;
}

export default function ConsciousMemoryDemo() {
  const [memories, setMemories] = useState<ConsciousMemory[]>([]);
  const [stats, setStats] = useState<MemoryStats | null>(null);
  const [tags, setTags] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [newMemory, setNewMemory] = useState({
    content: '',
    tags: '',
    importance: 5,
    context: ''
  });
  const [searchQuery, setSearchQuery] = useState('');

  const fetchStats = async () => {
    try {
      const response = await fetch('/api/conscious-memory?action=stats');
      const data = await response.json();
      if (data.success) {
        setStats(data.data);
      }
    } catch (err) {
      console.error('Failed to fetch stats:', err);
    }
  };

  const fetchTags = async () => {
    try {
      const response = await fetch('/api/conscious-memory?action=tags');
      const data = await response.json();
      if (data.success) {
        setTags(data.data);
      }
    } catch (err) {
      console.error('Failed to fetch tags:', err);
    }
  };

  const saveMemory = async () => {
    if (!newMemory.content.trim()) return;
    
    setLoading(true);
    setError(null);
    
    try {
      const response = await fetch('/api/conscious-memory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'save',
          content: newMemory.content,
          tags: newMemory.tags.split(',').map(t => t.trim()).filter(t => t),
          importance: newMemory.importance,
          source: 'explicit',
          context: newMemory.context || undefined
        })
      });
      
      const data = await response.json();
      
      if (data.success) {
        setNewMemory({ content: '', tags: '', importance: 5, context: '' });
        await Promise.all([fetchStats(), fetchTags()]);
        if (searchQuery) {
          await searchMemories();
        }
      } else {
        setError(data.error || 'Failed to save memory');
      }
    } catch (err) {
      setError('Network error while saving memory');
    } finally {
      setLoading(false);
    }
  };

  const searchMemories = async () => {
    if (!searchQuery.trim()) {
      setMemories([]);
      return;
    }
    
    setLoading(true);
    setError(null);
    
    try {
      const response = await fetch('/api/conscious-memory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'search',
          query: searchQuery,
          options: { limit: 10 }
        })
      });
      
      const data = await response.json();
      
      if (data.success) {
        setMemories(data.data);
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
    fetchTags();
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 to-blue-50 p-8">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-gray-800 mb-4">
            🧠 Conscious Memory System
          </h1>
          <p className="text-lg text-gray-600 max-w-2xl mx-auto">
            An intelligent memory system that allows the AI to save, search, and manage 
            important information with tags, importance levels, and context.
          </p>
        </div>

        {error && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-6">
            {error}
          </div>
        )}

        {/* Stats Dashboard */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <div className="bg-white rounded-lg shadow-md p-6">
            <h3 className="text-lg font-semibold text-gray-700 mb-2">Total Memories</h3>
            <p className="text-3xl font-bold text-blue-600">
              {stats?.totalConsciousMemories || 0}
            </p>
          </div>
          
          <div className="bg-white rounded-lg shadow-md p-6">
            <h3 className="text-lg font-semibold text-gray-700 mb-2">Unique Tags</h3>
            <p className="text-3xl font-bold text-green-600">
              {stats?.tagCount || 0}
            </p>
          </div>
          
          <div className="bg-white rounded-lg shadow-md p-6">
            <h3 className="text-lg font-semibold text-gray-700 mb-2">Avg. Importance</h3>
            <p className="text-3xl font-bold text-purple-600">
              {stats?.averageImportance?.toFixed(1) || '0.0'}
            </p>
          </div>
          
          <div className="bg-white rounded-lg shadow-md p-6">
            <h3 className="text-lg font-semibold text-gray-700 mb-2">Source Types</h3>
            <div className="text-sm">
              {stats?.sourceBreakdown && Object.entries(stats.sourceBreakdown).map(([source, count]) => (
                <div key={source} className="flex justify-between">
                  <span className="capitalize">{source}:</span>
                  <span className="font-semibold">{count}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Add Memory Form */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-8">
          <h2 className="text-2xl font-bold text-gray-800 mb-4">💾 Save New Memory</h2>
          
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Memory Content
              </label>
              <textarea
                value={newMemory.content}
                onChange={(e) => setNewMemory({ ...newMemory, content: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                rows={3}
                placeholder="What would you like to remember?"
              />
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Tags (comma-separated)
                </label>
                <input
                  type="text"
                  value={newMemory.tags}
                  onChange={(e) => setNewMemory({ ...newMemory, tags: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="ai, important, project"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Importance (1-10)
                </label>
                <input
                  type="number"
                  min="1"
                  max="10"
                  value={newMemory.importance}
                  onChange={(e) => setNewMemory({ ...newMemory, importance: parseInt(e.target.value) })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Context (optional)
                </label>
                <input
                  type="text"
                  value={newMemory.context}
                  onChange={(e) => setNewMemory({ ...newMemory, context: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Why is this important?"
                />
              </div>
            </div>
            
            <button
              onClick={saveMemory}
              disabled={loading || !newMemory.content.trim()}
              className="bg-blue-600 text-white px-6 py-2 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Saving...' : 'Save Memory'}
            </button>
          </div>
        </div>

        {/* Search Memories */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-8">
          <h2 className="text-2xl font-bold text-gray-800 mb-4">🔍 Search Memories</h2>
          
          <div className="flex gap-4 mb-4">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Search for memories..."
              onKeyPress={(e) => e.key === 'Enter' && searchMemories()}
            />
            <button
              onClick={searchMemories}
              disabled={loading}
              className="bg-green-600 text-white px-6 py-2 rounded-md hover:bg-green-700 disabled:opacity-50"
            >
              {loading ? 'Searching...' : 'Search'}
            </button>
          </div>

          {/* Available Tags */}
          {tags.length > 0 && (
            <div className="mb-4">
              <p className="text-sm text-gray-600 mb-2">Available tags:</p>
              <div className="flex flex-wrap gap-2">
                {tags.map(tag => (
                  <button
                    key={tag}
                    onClick={() => setSearchQuery(tag)}
                    className="bg-gray-200 text-gray-700 px-3 py-1 rounded-full text-sm hover:bg-gray-300"
                  >
                    {tag}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Search Results */}
          {memories.length > 0 && (
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-gray-700">
                Found {memories.length} memories:
              </h3>
              {memories.map((memory, index) => (
                <div key={memory.id || index} className="border border-gray-200 rounded-lg p-4">
                  <div className="flex justify-between items-start mb-2">
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-gray-500">Importance:</span>
                      <span className="font-semibold text-purple-600">{memory.importance}</span>
                      {memory.score && (
                        <>
                          <span className="text-sm text-gray-500">Score:</span>
                          <span className="font-semibold text-green-600">
                            {(memory.score * 100).toFixed(1)}%
                          </span>
                        </>
                      )}
                    </div>
                    <span className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded">
                      {memory.source}
                    </span>
                  </div>
                  
                  <p className="text-gray-800 mb-2">{memory.text}</p>
                  
                  {memory.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1 mb-2">
                      {memory.tags.map(tag => (
                        <span
                          key={tag}
                          className="bg-blue-100 text-blue-800 px-2 py-1 rounded-full text-xs"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                  
                  {memory.context && (
                    <p className="text-sm text-gray-600 italic">
                      Context: {memory.context}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
