import ChatInterface from "./components/ChatInterface";
import SessionList from "./components/SessionList";

export default function App() {
  return (
    <div className="flex h-screen bg-gray-100">
      <SessionList />
      <ChatInterface />
    </div>
  );
}
