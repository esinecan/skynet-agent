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
  const [selectedMemories, setSelectedMemories] = useState<string[]>([]);

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
      if (data.success && Array.isArray(data.data)) {
        setTags(data.data);
      } else {
        setTags([]); // Fallback to empty array
      }
    } catch (err) {
      console.error('Failed to fetch tags:', err);
      setTags([]); // Fallback to empty array on error
    }
  };

  const saveMemory = async () => {
    if (!newMemory.content.trim()) return;
      setLoading(true);
    setError(null);
    console.log('💾 Saving memory:', newMemory.content);
    
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
      console.log('💾 Save response:', data);
      
      if (data.success) {
        console.log('💾 Memory saved successfully with ID:', data.id);
        setNewMemory({ content: '', tags: '', importance: 5, context: '' });
        await Promise.all([fetchStats(), fetchTags()]);
        if (searchQuery) {
          await searchMemories();
        }
      } else {
        console.error('💾 Save failed:', data.error);
        setError(data.error || 'Failed to save memory');
      }
    } catch (err) {
      setError('Network error while saving memory');
    } finally {
      setLoading(false);
    }
  };  const loadAllMemories = async () => {
    setLoading(true);
    setError(null);
    console.log('🔍 Loading all memories on initial page load');
    
    try {
      const response = await fetch('/api/conscious-memory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'search',
          query: '', // Empty query to get all memories
          limit: 100
        })
      });
      
      const data = await response.json();
      console.log('🔍 Load all response:', data);
      
      if (data.success) {
        setMemories(data.results || []);
        console.log('🔍 Loaded all memories:', data.results?.length || 0);
      } else {
        setError(data.error || 'Failed to load memories');
      }
    } catch (err) {
      setError('Network error while loading memories');
    } finally {
      setLoading(false);
    }
  };

  const searchMemories = async () => {
    setLoading(true);
    setError(null);
    console.log('🔍 Searching for:', searchQuery);
    
    try {
      const response = await fetch('/api/conscious-memory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'search',
          query: searchQuery, // Send the actual query (empty or not)
          limit: searchQuery.trim() ? 10 : 100 // Higher limit for "show all" vs specific search
        })
      });
      
      const data = await response.json();
      console.log('🔍 Search response:', data);
      
      if (data.success) {
        setMemories(data.results || []);
        console.log('🔍 Found memories:', data.results?.length || 0);
      } else {
        console.error('🔍 Search failed:', data.error);
        setError(data.error || 'Failed to search memories');
      }
    } catch (err) {
      setError('Network error while searching memories');
    } finally {
      setLoading(false);
    }  };

  const debugMemories = async () => {
    setLoading(true);
    console.log('🐛 Debug: Checking all memories...');
    
    try {
      const response = await fetch('/api/conscious-memory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'debug' })
      });
      
      const data = await response.json();
      console.log('🐛 Debug response:', data);
      
      if (data.success) {
        console.log(`🐛 Total memories in database: ${data.totalMemories}`);
        console.log('🐛 Sample memories:', data.memories);
      }
    } catch (err) {
      console.error('🐛 Debug failed:', err);
    } finally {
      setLoading(false);
    }  };
  const deleteMemory = async (id: string) => {
    if (!confirm('Are you sure you want to delete this memory?')) {
      return;
    }
    
    setLoading(true);
    console.log('🗑️ Deleting memory:', id);
    
    try {
      const response = await fetch('/api/conscious-memory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'delete',
          id: id
        })
      });
      
      const data = await response.json();
      console.log('🗑️ Delete response:', data);
      
      if (data.success) {
        console.log('🗑️ Memory deleted successfully');
        // Remove from current memories list immediately
        setMemories(prev => prev.filter(m => m.id !== id));
        // Refresh stats and tags
        await Promise.all([fetchStats(), fetchTags()]);
      } else {
        console.error('🗑️ Delete failed:', data.error);
        setError(data.error || 'Failed to delete memory');
      }
    } catch (err) {
      console.error('🗑️ Delete error:', err);
      setError('Network error while deleting memory');
    } finally {
      setLoading(false);
    }
  };

  const deleteSelectedMemories = async () => {
    if (selectedMemories.length === 0) return;
    
    setLoading(true);
    console.log('🗑️ Deleting selected memories:', selectedMemories);
    
    try {
      const response = await fetch('/api/conscious-memory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'deleteMultiple',
          ids: selectedMemories
        })
      });
      
      const data = await response.json();
      console.log('🗑️ Bulk delete response:', data);
      
      if (data.success) {
        console.log(`🗑️ Successfully deleted ${selectedMemories.length} memories`);
        // Clear selected memories
        setSelectedMemories([]);
        // Refresh the search results and stats
        await Promise.all([fetchStats(), fetchTags()]);
        if (searchQuery || searchQuery === '') {
          await searchMemories();
        }
      } else {
        console.error('🗑️ Bulk delete failed:', data.error);
        setError(data.error || 'Failed to delete selected memories');
      }
    } catch (err) {
      console.error('🗑️ Bulk delete error:', err);
      setError('Network error while deleting memories');
    } finally {
      setLoading(false);
    }
  };

  const getAllMemories = async () => {
    setSearchQuery('');
    setLoading(true);
    console.log('📋 Getting all memories...');
    
    try {
      const response = await fetch('/api/conscious-memory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'search',
          query: '',
          limit: 100
        })
      });
      
      const data = await response.json();
      console.log('📋 All memories response:', data);
      
      if (data.success) {
        setMemories(data.results || []);
        console.log('📋 Found all memories:', data.results?.length || 0);
      } else {
        console.error('📋 Failed to get all memories:', data.error);
        setError(data.error || 'Failed to get all memories');
      }
    } catch (err) {
      console.error('📋 Get all memories error:', err);
      setError('Network error while getting all memories');
    } finally {
      setLoading(false);
    }
  };

  const toggleMemorySelection = (id: string) => {
    setSelectedMemories(prev => 
      prev.includes(id) 
        ? prev.filter(memId => memId !== id)
        : [...prev, id]
    );
  };

  const selectAllMemories = () => {
    const allIds = memories.map(m => m.id);
    setSelectedMemories(allIds);
  };

  const clearSelection = () => {
    setSelectedMemories([]);  };

  const deleteAllSearchResults = async () => {
    if (memories.length === 0) {
      return;
    }
    
    if (!confirm(`Are you sure you want to delete all ${memories.length} memories shown in the search results?`)) {
      return;
    }
    
    setLoading(true);
    console.log('🗑️ Bulk deleting memories:', memories.length);
    
    try {
      let deletedCount = 0;
      for (const memory of memories) {
        const response = await fetch('/api/conscious-memory', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'delete',
            id: memory.id
          })
        });
        
        const data = await response.json();
        if (data.success) {
          deletedCount++;
        }
      }
      
      console.log(`🗑️ Deleted ${deletedCount} memories`);
      setMemories([]);
      await fetchStats();
    } catch (err) {
      console.error('🗑️ Bulk delete error:', err);
      setError('Error during bulk delete');
    } finally {
      setLoading(false);
    }
  };  useEffect(() => {
    fetchStats();
    fetchTags();
    // Load all memories on initial load
    loadAllMemories();
  }, []);
  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 to-blue-50 p-8 text-gray-900">
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
            <div className="text-sm text-gray-700">
              {stats?.sourceBreakdown && Object.entries(stats.sourceBreakdown).map(([source, count]) => (
                <div key={source} className="flex justify-between text-gray-700">
                  <span className="capitalize text-gray-600">{source}:</span>
                  <span className="font-semibold text-gray-800">{count}</span>
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
              </div>            </div>
            
            <div className="flex gap-4">
              <button
                onClick={saveMemory}
                disabled={loading || !newMemory.content.trim()}
                className="bg-blue-600 text-white px-6 py-2 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? 'Saving...' : 'Save Memory'}
              </button>
              
              <button
                onClick={debugMemories}
                disabled={loading}
                className="bg-yellow-600 text-white px-4 py-2 rounded-md hover:bg-yellow-700 disabled:opacity-50"
              >
                🐛 Debug DB
              </button>
            </div>
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
              placeholder="Search for memories... (leave empty to show all)"
              onKeyPress={(e) => e.key === 'Enter' && searchMemories()}
            />
            <button
              onClick={searchMemories}
              disabled={loading}
              className="bg-green-600 text-white px-6 py-2 rounded-md hover:bg-green-700 disabled:opacity-50"
            >
              {loading ? 'Searching...' : 'Search'}
            </button>
          </div>          {/* Available Tags */}
          {Array.isArray(tags) && tags.length > 0 && (
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
          )}          {/* Search Results */}
          {Array.isArray(memories) && memories.length > 0 && (
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <h3 className="text-lg font-semibold text-gray-700">
                  Found {memories.length} memories:
                </h3>
                <button
                  onClick={deleteAllSearchResults}
                  disabled={loading}
                  className="bg-red-600 text-white px-4 py-2 rounded-md hover:bg-red-700 disabled:opacity-50 text-sm"
                >
                  🗑️ Delete All ({memories.length})
                </button>
              </div>
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
                  
                  {Array.isArray(memory.tags) && memory.tags.length > 0 && (
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
                  
                  <div className="mt-3 pt-3 border-t border-gray-200 flex justify-end">
                    <button
                      onClick={() => deleteMemory(memory.id)}
                      disabled={loading}
                      className="bg-red-600 text-white px-3 py-1 rounded-md hover:bg-red-700 disabled:opacity-50 text-sm"
                    >
                      🗑️ Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
