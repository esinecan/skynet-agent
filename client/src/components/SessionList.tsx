import React, { useEffect } from "react";
import { useChatStore } from "../stores/chatStore";
import { PlusCircle, Trash2 } from "lucide-react";

const SessionList: React.FC = () => {
  const { 
    sessions, 
    currentSession, 
    loadSessions, 
    createSession, 
    selectSession,
    deleteSession
  } = useChatStore();

  // Load sessions on component mount
  useEffect(() => {
    loadSessions();
    // If no sessions, create one
    if (sessions.length === 0) {
      createSession();
    }
  }, []);

  return (
    <div className="w-64 bg-gray-50 border-r border-gray-200 flex flex-col h-full">
      <div className="p-4 border-b border-gray-200">
        <button 
          className="w-full bg-blue-500 hover:bg-blue-600 text-white py-2 px-4 rounded flex items-center justify-center gap-2"
          onClick={() => createSession()}
        >
          <PlusCircle size={18} />
          <span>New Chat</span>
        </button>
      </div>
      
      <div className="overflow-y-auto flex-1">
        {sessions.length === 0 ? (
          <div className="p-4 text-gray-500 text-center">
            No sessions yet
          </div>
        ) : (
          <ul>
            {sessions.map(session => (
              <li 
                key={session.id}
                className={`
                  p-3 border-b border-gray-200 cursor-pointer flex justify-between items-center
                  ${currentSession?.id === session.id ? "bg-blue-50 font-medium" : "hover:bg-gray-100"}
                `}
                onClick={() => selectSession(session.id)}
              >
                <div className="truncate flex-1">{session.title}</div>
                <button 
                  className="text-gray-400 hover:text-red-500 p-1 rounded-full hover:bg-gray-200"
                  onClick={(e) => {
                    e.stopPropagation();
                    deleteSession(session.id);
                  }}
                >
                  <Trash2 size={16} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};

export default SessionList;
