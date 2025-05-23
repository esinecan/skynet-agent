import { create } from "zustand";

interface Session {
  id: string;
  title: string;
  messages: Message[];
  createdAt: string;
  updatedAt: string;
}

interface Message {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: string;
  attachments?: any[];
}

interface ChatStore {
  sessions: Session[];
  currentSession: Session | null;
  isLoading: boolean;
  streamingMessage: string;
  
  // Actions
  loadSessions: () => Promise<void>;
  createSession: (title?: string) => Promise<void>;
  selectSession: (id: string) => Promise<void>;
  deleteSession: (id: string) => Promise<void>;
  sendMessage: (content: string, attachments?: any[]) => Promise<void>;
}

export const useChatStore = create<ChatStore>((set, get) => ({
  sessions: [],
  currentSession: null,
  isLoading: false,
  streamingMessage: "",

  loadSessions: async () => {
    try {
      const response = await fetch("/api/sessions");
      if (!response.ok) throw new Error("Failed to load sessions");
      const sessions = await response.json();
      set({ sessions });
    } catch (error) {
      console.error("Error loading sessions:", error);
    }
  },

  createSession: async (title = "New Chat") => {
    try {
      const response = await fetch("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title })
      });
      
      if (!response.ok) throw new Error("Failed to create session");
      const session = await response.json();
      
      set(state => ({ 
        sessions: [session, ...state.sessions],
        currentSession: session
      }));
    } catch (error) {
      console.error("Error creating new session:", error);
    }
  },

  selectSession: async (id: string) => {
    try {
      const response = await fetch(`/api/sessions/${id}`);
      if (!response.ok) throw new Error(`Failed to load session ${id}`);
      const session = await response.json();
      set({ currentSession: session });
    } catch (error) {
      console.error("Error loading session:", error);
    }
  },

  deleteSession: async (id: string) => {
    try {
      const response = await fetch(`/api/sessions/${id}`, {
        method: "DELETE"
      });
      
      if (!response.ok) throw new Error(`Failed to delete session ${id}`);
      
      set(state => ({ 
        sessions: state.sessions.filter(s => s.id !== id),
        currentSession: state.currentSession?.id === id ? null : state.currentSession
      }));
      
      // If we deleted the current session, create a new one
      if (get().currentSession === null && get().sessions.length > 0) {
        await get().selectSession(get().sessions[0].id);
      } else if (get().sessions.length === 0) {
        await get().createSession();
      }
    } catch (error) {
      console.error("Error deleting session:", error);
    }
  },

  sendMessage: async (content: string, attachments = []) => {
    const { currentSession } = get();
    if (!currentSession) return;

    // Create optimistic user message update
    const userMessage = {
      id: `temp_${Date.now()}`,
      role: "user" as const,
      content,
      timestamp: new Date().toISOString(),
      attachments
    };
    
    // Update UI optimistically
    set(state => ({
      currentSession: state.currentSession ? {
        ...state.currentSession,
        messages: [...state.currentSession.messages, userMessage]
      } : state.currentSession,
      isLoading: true,
      streamingMessage: ""
    }));

    try {
      // Call streaming endpoint
      const response = await fetch("/api/chat/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: currentSession.id,
          message: content,
          attachments: attachments.map(att => ({
            name: att.name,
            type: att.type,
            data: att.data
          }))
        })
      });

      if (!response.ok) throw new Error("Failed to send message");
      if (!response.body) throw new Error("Response has no body");

      // Handle SSE streaming
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        
        const chunk = decoder.decode(value);
        const lines = chunk.split("\n\n");
        
        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try {
              const data = JSON.parse(line.substring(6));
              
              if (data.type === "chunk") {
                set(state => ({ 
                  streamingMessage: state.streamingMessage + data.content 
                }));
              } else if (data.type === "end") {
                // Refresh the entire session to ensure consistency with server
                await get().selectSession(currentSession.id);
                set({ isLoading: false });
              } else if (data.type === "error") {
                console.error("Stream error:", data.error);
                set({ 
                  streamingMessage: `Error: ${data.error}`,
                  isLoading: false 
                });
              }
            } catch (e) {
              console.error("Error parsing SSE data:", e);
            }
          }
        }
      }
    } catch (error) {
      console.error("Error sending message:", error);
      set({ isLoading: false });
    }
  }
}));
