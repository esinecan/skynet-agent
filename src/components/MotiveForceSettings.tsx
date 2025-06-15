import React, { useState } from 'react';
import { MotiveForceConfig } from '../types/motive-force';

interface MotiveForceSettingsProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (config: MotiveForceConfig) => void;
  initialConfig: MotiveForceConfig;
}

export default function MotiveForceSettings({
  isOpen,
  onClose,
  onSave,
  initialConfig
}: MotiveForceSettingsProps) {
  const [config, setConfig] = useState(initialConfig);
  
  if (!isOpen) return null;
  
  const handleSave = () => {
    onSave(config);
    onClose();
  };
  
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl p-6 max-w-md w-full max-h-[80vh] overflow-y-auto">
        <h2 className="text-xl font-bold mb-4">Autopilot Settings</h2>
        
        <div className="space-y-4">
          {/* Mode Selection */}
          <div>
            <label className="block text-sm font-medium mb-1">Mode</label>
            <select
              value={config.mode}
              onChange={(e) => setConfig({ ...config, mode: e.target.value as any })}
              className="w-full px-3 py-2 border rounded-md"
            >
              <option value="conservative">Conservative</option>
              <option value="balanced">Balanced</option>
              <option value="aggressive">Aggressive</option>
            </select>
          </div>
          
          {/* Temperature */}
          <div>
            <label className="block text-sm font-medium mb-1">
              Temperature: {config.temperature}
            </label>
            <input
              type="range"
              min="0"
              max="1"
              step="0.1"
              value={config.temperature}
              onChange={(e) => setConfig({ ...config, temperature: parseFloat(e.target.value) })}
              className="w-full"
            />
          </div>
          
          {/* Delay Between Turns */}
          <div>
            <label className="block text-sm font-medium mb-1">
              Delay Between Turns: {config.delayBetweenTurns / 1000}s
            </label>
            <input
              type="range"
              min="1000"
              max="10000"
              step="500"
              value={config.delayBetweenTurns}
              onChange={(e) => setConfig({ ...config, delayBetweenTurns: parseInt(e.target.value) })}
              className="w-full"
            />
          </div>
          
          {/* Max Consecutive Turns */}
          <div>
            <label className="block text-sm font-medium mb-1">
              Max Consecutive Turns: {config.maxConsecutiveTurns}
            </label>
            <input
              type="number"
              min="1"
              max="50"
              value={config.maxConsecutiveTurns}
              onChange={(e) => setConfig({ ...config, maxConsecutiveTurns: parseInt(e.target.value) })}
              className="w-full px-3 py-2 border rounded-md"
            />
          </div>
          
          {/* History Depth */}
          <div>
            <label className="block text-sm font-medium mb-1">
              History Depth: {config.historyDepth} messages
            </label>
            <input
              type="range"
              min="3"
              max="20"
              value={config.historyDepth}
              onChange={(e) => setConfig({ ...config, historyDepth: parseInt(e.target.value) })}
              className="w-full"
            />
          </div>
          
          {/* Memory Options */}
          <div className="space-y-2">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={config.useRag}
                onChange={(e) => setConfig({ ...config, useRag: e.target.checked })}
                className="rounded"
              />
              <span className="text-sm">Use RAG Memory</span>
            </label>
            
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={config.useConsciousMemory}
                onChange={(e) => setConfig({ ...config, useConsciousMemory: e.target.checked })}
                className="rounded"
              />
              <span className="text-sm">Use Conscious Memory</span>
            </label>
          </div>
        </div>
        
        <div className="flex gap-2 mt-6">
          <button
            onClick={handleSave}
            className="flex-1 px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-md"
          >
            Save
          </button>
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-md"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
