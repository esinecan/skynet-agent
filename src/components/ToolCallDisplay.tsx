import React from 'react'
import { ToolInvocation } from 'ai'

interface ToolCallDisplayProps {
  toolInvocation: ToolInvocation
}

export default function ToolCallDisplay({ toolInvocation }: ToolCallDisplayProps) {
  return (
    <div className="bg-blue-50 border border-blue-200 rounded p-3 mt-2">
      <div className="text-sm font-medium text-blue-800 mb-1">
        🔧 Tool: {toolInvocation.toolName}
      </div>
      
      {toolInvocation.args && (
        <div className="text-xs text-gray-600 mb-2">
          <strong>Arguments:</strong>
          <pre className="mt-1 bg-gray-100 p-2 rounded text-xs overflow-x-auto">
            {JSON.stringify(toolInvocation.args, null, 2)}
          </pre>
        </div>
      )}
      
      {'result' in toolInvocation && toolInvocation.result && (
        <div className="text-xs text-gray-600">
          <strong>Result:</strong>
          <pre className="mt-1 bg-gray-100 p-2 rounded text-xs overflow-x-auto">
            {typeof toolInvocation.result === 'string' 
              ? toolInvocation.result 
              : JSON.stringify(toolInvocation.result, null, 2)
            }
          </pre>
        </div>
      )}
      
      {toolInvocation.state === 'call' && (
        <div className="text-xs text-blue-600 italic">
          Tool called, waiting for result...
        </div>
      )}
    </div>
  )
}
