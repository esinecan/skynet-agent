import React from 'react';
import { useChatStore } from '../stores/chatStore';

interface ToolCallDisplayProps {
  toolCall?: {
    server: string;
    tool: string;
    args: any;
    result?: any;
    success?: boolean;
    error?: string;
    inProgress?: boolean;
  } | null;
}

const ToolCallDisplay: React.FC<ToolCallDisplayProps> = ({ toolCall }) => {
  if (!toolCall) return null;
  
  const { server, tool, args, result, success, error, inProgress } = toolCall;
  
  return (
    <div className="my-3 border rounded-md overflow-hidden">
      <div className="bg-gray-100 p-2 border-b flex justify-between items-center">
        <div className="flex items-center">
          <svg 
            xmlns="http://www.w3.org/2000/svg" 
            width="16" 
            height="16" 
            viewBox="0 0 24 24" 
            fill="none" 
            stroke="currentColor" 
            strokeWidth="2" 
            strokeLinecap="round" 
            strokeLinejoin="round" 
            className="mr-2"
          >
            <path d="m15 7-5 5 5 5" />
          </svg>
          <span className="font-semibold text-sm">Tool Call: <code>{tool}</code></span>
        </div>
        <div 
          className={`text-xs px-2 py-1 rounded-full ${
            inProgress 
              ? 'bg-yellow-200 text-yellow-800' 
              : success 
                ? 'bg-green-200 text-green-800'
                : 'bg-red-200 text-red-800'
          }`}
        >
          {inProgress ? 'Running' : success ? 'Success' : 'Failed'}
        </div>
      </div>
      
      <div className="p-3 bg-gray-50">
        <div className="mb-3">
          <h4 className="text-xs font-semibold text-gray-500 mb-1">SERVER</h4>
          <div className="bg-gray-100 p-2 rounded text-sm font-mono">{server}</div>
        </div>
        
        <div className="mb-3">
          <h4 className="text-xs font-semibold text-gray-500 mb-1">ARGUMENTS</h4>
          <pre className="bg-gray-100 p-2 rounded text-sm overflow-x-auto">
            {JSON.stringify(args, null, 2)}
          </pre>
        </div>
        
        {result !== undefined && (
          <div className="mb-3">
            <h4 className="text-xs font-semibold text-gray-500 mb-1">RESULT</h4>
            <pre className="bg-gray-100 p-2 rounded text-sm overflow-x-auto">
              {typeof result === 'object' 
                ? JSON.stringify(result, null, 2) 
                : String(result)}
            </pre>
          </div>
        )}
        
        {error && (
          <div>
            <h4 className="text-xs font-semibold text-red-500 mb-1">ERROR</h4>
            <div className="bg-red-100 text-red-800 p-2 rounded text-sm">{error}</div>
          </div>
        )}
      </div>
    </div>
  );
};

// Component that uses the chat store to display the current tool call
export const CurrentToolCallDisplay: React.FC = () => {
  const { currentToolCall } = useChatStore();
  return <ToolCallDisplay toolCall={currentToolCall} />;
};

// Export both components
export default ToolCallDisplay;
