import React, { useEffect, useRef } from "react";
import ReactMarkdown from "react-markdown";
import { useChatStore } from "../stores/chatStore";
import { CurrentToolCallDisplay } from "./ToolCallDisplay";

interface Message {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: string;
  attachments?: any[];
  toolCall?: {
    id?: string;
    server: string;
    tool: string;
    args: Record<string, any>;
    detectedAt?: string;
    inProgress?: boolean;
    result?: any;
    error?: string;
    success?: boolean;
  };
  toolResult?: any;
}

const MessageList: React.FC = () => {
  const { currentSession, isLoading, streamingMessage, currentToolCall } = useChatStore();
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Scroll to bottom whenever messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [currentSession?.messages, streamingMessage]);

  if (!currentSession) {
    return (
      <div className="flex items-center justify-center h-full text-gray-400">
        <div className="text-center">
          <h2 className="text-2xl font-bold mb-2">Welcome to Skynet Agent</h2>
          <p>Select a chat or start a new conversation.</p>
        </div>
      </div>
    );
  }
  const renderToolCall = (message: Message) => {
    if (!message.toolCall) return null;

    const { server, tool, args, inProgress, success, error, result, detectedAt } = message.toolCall;

    return (
      <div className="mt-3 border rounded-md overflow-hidden">
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
            <span className="font-semibold text-sm">Tool Call: <code>{server}.{tool}</code></span>
          </div>
          {(inProgress !== undefined || success !== undefined) && (
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
          )}
        </div>
        
        <div className="p-3 bg-gray-50">
          <div className="mb-3">
            <h4 className="text-xs font-semibold text-gray-500 mb-1">ARGUMENTS</h4>
            <pre className="bg-gray-100 p-2 rounded text-sm overflow-x-auto">
              {JSON.stringify(args, null, 2)}
            </pre>
          </div>
          
          {detectedAt && (
            <div className="mb-3">
              <h4 className="text-xs font-semibold text-gray-500 mb-1">EXECUTED AT</h4>
              <div className="text-sm text-gray-600">{new Date(detectedAt).toLocaleString()}</div>
            </div>
          )}
          
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

  const renderToolResult = (message: Message) => {
    if (!message.toolResult) return null;

    return (
      <div className="mt-2 bg-blue-50 p-2 rounded-lg">
        <div className="text-sm text-blue-600 font-semibold">Tool Result:</div>
        <div className="text-sm font-mono bg-white p-2 rounded mt-1">
          {typeof message.toolResult === 'string' 
            ? message.toolResult 
            : JSON.stringify(message.toolResult, null, 2)}
        </div>
      </div>
    );
  };

  const renderAttachments = (message: Message) => {
    if (!message.attachments || message.attachments.length === 0) return null;

    return (
      <div className="mt-2 space-y-2">
        {message.attachments.map((attachment, index) => {
          if (attachment.type.startsWith("image/")) {
            return (
              <div key={index} className="inline-block mr-2">
                <img
                  src={`data:${attachment.type};base64,${attachment.data}`}
                  alt={attachment.name}
                  className="max-h-40 rounded"
                />
                <div className="text-xs text-gray-500 mt-1">{attachment.name}</div>
              </div>
            );
          } else {
            return (
              <div key={index} className="bg-gray-100 p-2 rounded flex items-center">
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
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                </svg>
                <span>{attachment.name}</span>
              </div>
            );
          }
        })}
      </div>
    );
  };

  return (
    <div className="flex-1 p-4 overflow-y-auto">
      {currentSession.messages.map((message) => (
        <div
          key={message.id}
          className={`mb-4 ${
            message.role === "user" 
              ? "bg-blue-50 ml-10" 
              : "bg-white mr-10"
          } p-3 rounded-lg shadow-sm`}
        >
          <div className="text-xs font-medium text-gray-500 mb-1">
            {message.role === "user" ? "You" : "Skynet"}
          </div>
          
          <div className="prose prose-sm max-w-none">
            <ReactMarkdown>
              {message.content}
            </ReactMarkdown>
            {renderToolCall(message)}
            {renderToolResult(message)}
            {renderAttachments(message)}
          </div>
        </div>
      ))}
        {/* Streaming message */}
      {isLoading && streamingMessage && (
        <div className="mb-4 bg-white mr-10 p-3 rounded-lg shadow-sm">
          <div className="text-xs font-medium text-gray-500 mb-1">
            Skynet
          </div>
          <div className="prose prose-sm max-w-none">
            <ReactMarkdown>
              {streamingMessage}
            </ReactMarkdown>
          </div>
          
          {/* Show current tool call if in progress */}
          {currentToolCall && (
            <CurrentToolCallDisplay />
          )}
        </div>
      )}
        {/* Loading indicator */}
      {isLoading && !streamingMessage && (
        <div className="mb-4 bg-white mr-10 p-3 rounded-lg shadow-sm">
          <div className="text-xs font-medium text-gray-500 mb-1">
            Skynet
          </div>
          
          {/* Show current tool call if in progress */}
          {currentToolCall ? (
            <CurrentToolCallDisplay />
          ) : (
            <div className="flex justify-center items-center text-gray-400">
              <div className="inline-flex space-x-1">
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "0ms" }}></div>
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "150ms" }}></div>
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "300ms" }}></div>
              </div>
            </div>
          )}
        </div>
      )}
      
      <div ref={messagesEndRef} />
    </div>
  );
};

export default MessageList;