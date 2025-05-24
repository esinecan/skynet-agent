import React, { useState, useRef } from "react";
import { useChatStore } from "../stores/chatStore";
import { Send, Paperclip, X } from "lucide-react";

interface FileAttachment {
  name: string;
  type: string;
  data: string;
}

const InputArea: React.FC = () => {
  const { currentSession, isLoading, sendMessage } = useChatStore();
  const [message, setMessage] = useState("");
  const [attachments, setAttachments] = useState<FileAttachment[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Handle form submission
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!message.trim() && attachments.length === 0) return;
    if (!currentSession) return;
    
    sendMessage(message, attachments);
    setMessage("");
    setAttachments([]);
  };

  // Handle file upload
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    
    const files = Array.from(e.target.files);
    
    try {
      const uploadedAttachments = await Promise.all(
        files.map(file => 
          new Promise<FileAttachment>((resolve, reject) => {
            const reader = new FileReader();
            
            reader.onload = () => {
              if (typeof reader.result === "string") {
                const base64Data = reader.result.split(",")[1];
                resolve({
                  name: file.name,
                  type: file.type,
                  data: base64Data
                });
              } else {
                reject(new Error("File reading failed"));
              }
            };
            
            reader.onerror = () => reject(new Error("File reading error"));
            reader.readAsDataURL(file);
          })
        )
      );
      
      setAttachments(prev => [...prev, ...uploadedAttachments]);
    } catch (error) {
      console.error("Error uploading files:", error);
    } finally {
      // Clear file input
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  // Remove attachment
  const removeAttachment = (index: number) => {
    setAttachments(prev => prev.filter((_, i) => i !== index));
  };

  return (
    <div className="border-t border-gray-200 p-4">
      <form onSubmit={handleSubmit} className="flex flex-col">
        {/* Attachments preview */}
        {attachments.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-3">
            {attachments.map((file, index) => (
              <div key={index} className="bg-gray-100 rounded px-2 py-1 flex items-center">
                <span className="text-sm truncate max-w-xs">{file.name}</span>
                <button 
                  type="button"
                  className="ml-2 text-gray-500 hover:text-red-500"
                  onClick={() => removeAttachment(index)}
                >
                  <X size={14} />
                </button>
              </div>
            ))}
          </div>
        )}
        
        <div className="flex items-end">
          <button 
            type="button"
            className="p-2 text-gray-500 hover:text-blue-500 hover:bg-blue-50 rounded"
            onClick={() => fileInputRef.current?.click()}
          >
            <Paperclip size={20} />
          </button>
          
          <input 
            type="file"
            ref={fileInputRef}
            onChange={handleFileUpload}
            className="hidden"
            multiple
          />
          
          <div className="flex-1 mx-2">
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              className="w-full border border-gray-300 rounded-lg p-3 focus:ring focus:ring-blue-200 focus:outline-none"
              placeholder="Type your message..."
              rows={1}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSubmit(e);
                }
              }}
              disabled={isLoading}
            />
          </div>
          
          <button 
            type="submit"
            disabled={(!message.trim() && attachments.length === 0) || isLoading}
            className={`p-2 rounded-full ${
              (!message.trim() && attachments.length === 0) || isLoading 
                ? "bg-gray-200 text-gray-400" 
                : "bg-blue-500 text-white hover:bg-blue-600"
            }`}
          >
            <Send size={20} />
          </button>
        </div>
        
        <div className="text-xs text-gray-400 mt-2">
          Press Enter to send, Shift+Enter for new line
        </div>
      </form>
    </div>
  );
};

export default InputArea;
