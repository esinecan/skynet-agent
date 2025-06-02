// ChatInterface.tsx
import React, { useState } from 'react';

const ChatInterface = () => {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');

  const handleSend = async () => {
    // Send input to LLM service and update messages
  };

  return (
    <div>
      <div className="chat-window">
        {messages.map((msg, index) => (
          <div key={index}>{msg}</div>
        ))}
      </div>
      <input
        type="text"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyPress={(e) => e.key === 'Enter' && handleSend()}
      />
    </div>
  );
};

export default ChatInterface;