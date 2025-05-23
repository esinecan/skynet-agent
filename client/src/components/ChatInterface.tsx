import React, { useEffect } from "react";
import MessageList from "./MessageList";
import InputArea from "./InputArea";
import { useChatStore } from "../stores/chatStore";

const ChatInterface: React.FC = () => {
  const { currentSession, createSession, sessions } = useChatStore();

  // Create a new session if none exists
  useEffect(() => {
    if (sessions.length === 0) {
      createSession();
    }
  }, [sessions.length]);

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden">
      <header className="p-4 border-b border-gray-200 bg-white">
        <h1 className="text-xl font-medium text-gray-800">
          {currentSession ? currentSession.title : "Skynet Agent"}
        </h1>
      </header>
      
      <MessageList />
      <InputArea />
    </div>
  );
};

export default ChatInterface;
