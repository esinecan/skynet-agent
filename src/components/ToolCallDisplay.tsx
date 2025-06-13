import React from 'react'
import { ToolInvocation } from 'ai'

interface ToolCallDisplayProps {
  toolInvocation: ToolInvocation
}

export default function ToolCallDisplay({ toolInvocation }: ToolCallDisplayProps) {
  // Check if the result explicitly indicates an error
  const isErrorResult = toolInvocation.state === 'result' && 
                         toolInvocation.result && 
                         typeof toolInvocation.result === 'object' && 
                         ((toolInvocation.result as any).isError === true || (toolInvocation.result as any).error === true);

  // Determine which content to display for the result
  let resultDisplayContent: React.ReactNode = <div className="text-gray-500">No data available.</div>;
  if (isErrorResult) {
    const errorMessage = (toolInvocation.result as any).message || 'Unknown tool error.';
    const errorDetails = (toolInvocation.result as any).details || (toolInvocation.result as any).errorDetails || (toolInvocation.result as any).error; // Catch various detail fields
    resultDisplayContent = (
      <div className="text-red-700">
        <strong>Error:</strong> {errorMessage}
        {errorDetails && (
          <pre className="mt-1 text-xs bg-red-100 p-2 rounded overflow-x-auto">
            {typeof errorDetails === 'string' ? errorDetails : JSON.stringify(errorDetails, null, 2)}
          </pre>
        )}
      </div>
    );
  } else if ('result' in toolInvocation && toolInvocation.result) {
    resultDisplayContent = (
      <div className="text-green-700">
        <strong>Result:</strong>
        <pre className="mt-1 text-xs bg-green-100 p-2 rounded overflow-x-auto">
          {typeof toolInvocation.result === 'string' 
            ? toolInvocation.result 
            : JSON.stringify(toolInvocation.result, null, 2)
          }
        </pre>
      </div>
    );
  } else if (toolInvocation.state === 'call') {
    resultDisplayContent = (
      <div className="text-blue-600 flex items-center gap-2">
        <div className="animate-spin w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full"></div>
        Executing...
      </div>
    );
  }

  return (
    <div className={`
      border rounded p-3 mt-2
      ${isErrorResult ? 'bg-red-50 border-red-200' : 'bg-blue-50 border-blue-200'}
    `}>
      <div className={`text-sm font-medium mb-1 ${isErrorResult ? 'text-red-800' : 'text-blue-800'}`}>
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
      
      {resultDisplayContent}
      
    </div>
  )
}
