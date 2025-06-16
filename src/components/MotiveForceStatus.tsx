import React from 'react';
import { MotiveForceState } from '../types/motive-force';

interface MotiveForceStatusProps {
  state: MotiveForceState;
  onStop?: () => void;
  onReset?: () => void;
}

export default function MotiveForceStatus({
  state,
  onStop,
  onReset
}: MotiveForceStatusProps) {
  if (!state.enabled && !state.isGenerating) return null;
  
  return (
    <div className={`
      fixed bottom-20 right-4 p-4 rounded-lg shadow-lg z-40
      ${state.enabled ? 'bg-amber-50 border border-amber-200' : 'bg-gray-50 border border-gray-200'}
      max-w-sm
    `}>
      <div className="flex items-start gap-3">
        <div className={`
          mt-1 w-3 h-3 rounded-full flex-shrink-0
          ${state.isGenerating 
            ? 'bg-amber-500 animate-pulse' 
            : state.enabled 
              ? 'bg-green-500' 
              : 'bg-gray-400'
          }
        `} />
        
        <div className="flex-1">
          <div className="font-medium text-sm text-gray-900">
            {state.isGenerating 
              ? 'Generating next query...' 
              : state.enabled 
                ? `Autopilot active (Turn ${state.currentTurn})` 
                : 'Autopilot ready'
            }
          </div>
          
          {state.enabled && (
            <div className="mt-1 text-xs text-gray-600">
              {state.isGenerating 
                ? 'Analyzing conversation context'
                : state.errorCount > 0
                  ? `${state.errorCount} errors encountered`
                  : 'Waiting for response completion'
              }
            </div>
          )}
        </div>
        
        <div className="flex gap-1 flex-shrink-0">
          {state.enabled && onStop && (
            <button
              onClick={onStop}
              className="text-xs px-2 py-1 rounded bg-gray-200 hover:bg-gray-300 text-gray-700"
            >
              Stop
            </button>
          )}
          
          {onReset && (
            <button
              onClick={onReset}
              className="text-xs px-2 py-1 rounded bg-gray-200 hover:bg-gray-300 text-gray-700"
            >
              Reset
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
