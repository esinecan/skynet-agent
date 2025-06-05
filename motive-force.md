# Autopilot Feature Implementation Plan

## 1. Create Motive Force Prompt File

First, let's create the file that will store MotiveForce's system prompt:

```bash
# Create the file in project root
touch motive-force-prompt.md
```

Add some initial content:

```markdown
# MotiveForce (Autopilot) System Prompt
You are an AI assistant operating in "autopilot mode" - your job is to analyze the conversation
and suggest the next best action or query to continue the investigation. Generate a single,
clear follow-up command or question that would help advance the current conversation topic.
```

## 2. Add Autopilot Toggle to UI

Let's modify the main page to add an Autopilot toggle button:

````typescript
'use client'

export default function Home() {
  const [currentSessionId, setCurrentSessionId] = React.useState<string>('')
  const [sidebarOpen, setSidebarOpen] = React.useState(false)
  // Add autopilot state
  const [autopilotEnabled, setAutopilotEnabled] = React.useState(false)
  const [isWaitingForAutopilot, setIsWaitingForAutopilot] = React.useState(false)
  
  const { messages, input, handleInputChange, handleSubmit, isLoading, setMessages } = useChat({
    id: currentSessionId,
    onFinish: async (message) => {
      // Save message to database after completion
      if (currentSessionId) {
        try {
          await fetch(`/api/chat-history/${currentSessionId}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
              message: {
                id: message.id,
                role: message.role,
                content: message.content,
                toolInvocations: message.toolInvocations,
              }
            })
          })
          
          // Trigger MotiveForce if autopilot is enabled
          if (autopilotEnabled && !isWaitingForAutopilot) {
            setIsWaitingForAutopilot(true)
            try {
              const resp = await fetch('/api/motiveForce', { 
                method: 'POST', 
                headers: {'Content-Type':'application/json'}, 
                body: JSON.stringify({ sessionId: currentSessionId }) 
              });
              
              if (resp.ok) {
                const { command } = await resp.json();
                // Append MotiveForce command as user message
                const syntheticMessage = {
                  id: `autopilot-${Date.now()}`,
                  role: 'user',
                  content: `[Autopilot] ${command}`,
                  createdAt: new Date()
                };
                
                setMessages(prev => [...prev, syntheticMessage]);
                
                // Save autopilot message to chat history
                await fetch(`/api/chat-history/${currentSessionId}`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ 
                    message: {
                      id: syntheticMessage.id,
                      role: 'user',
                      content: syntheticMessage.content,
                    }
                  })
                });
                
                // Process the command through MachineSpirit
                const syntheticEvent = new Event('submit') as unknown as React.FormEvent;
                handleSubmit(syntheticEvent);
              }
            } catch (error) {
              console.error('Error in autopilot:', error);
            } finally {
              setIsWaitingForAutopilot(false);
            }
          }
        } catch (error) {
          console.error('Failed to save message:', error)
        }
      }
    }
  })
  // Save user messages immediately when sent
  const handleChatSubmit = async (e: React.FormEvent, attachments?: FileAttachment[]) => {
    // Check if autopilot is capturing this message
    if (autopilotEnabled && !isWaitingForAutopilot && input.trim()) {
      e.preventDefault(); // Prevent regular submission
      
      try {
        // Send to motive-force-prompt instead of machineSpirit
        await fetch('/api/motive-force-prompt', { 
          method: 'POST', 
          headers: { 'Content-Type': 'application/json' }, 
          body: JSON.stringify({ text: input.trim() }) 
        });
        
        // Show feedback to user that prompt was captured
        setMessages(prev => [...prev, {
          id: `system-${Date.now()}`,
          role: 'system',
          content: `📝 Your autopilot instructions have been captured. Agent will now operate autonomously.`,
          createdAt: new Date()
        }]);
        
        // Clear input field
        const emptyEvent = { target: { value: '' } } as React.ChangeEvent<HTMLInputElement>;
        handleInputChange(emptyEvent);
        
        return; // Skip normal submission
      } catch (error) {
        console.error('Failed to save autopilot prompt:', error);
      }
    }
    
    // Continue with normal message handling
    handleSubmit(e)
    
    // Save user message to database
    if (currentSessionId && input.trim()) {
      try {
        await fetch(`/api/chat-history/${currentSessionId}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            message: {
              id: `user-${Date.now()}`,
              role: 'user',
              content: input.trim(),
              attachments: attachments || []
            }
          })
        })
      } catch (error) {
        console.error('Failed to save user message:', error)
      }
    }
  }

  // Rest of the component remains the same...

  return (
    <>
      <ChatHistorySidebar
        isOpen={sidebarOpen}
        onToggle={() => setSidebarOpen(!sidebarOpen)}
        onSelectSession={loadSession}
        onNewChat={startNewChat}
        currentSessionId={currentSessionId}
      />
      
      <main className="flex min-h-screen flex-col items-center justify-between p-24">
        <div className="z-10 max-w-5xl w-full items-center justify-between font-mono text-sm">          
          {/* Header with sidebar toggle */}
          <div className="flex items-center justify-between mb-8">
            <button
              onClick={() => setSidebarOpen(true)}
              className="bg-gray-800 text-white px-4 py-2 rounded-lg hover:bg-gray-700 transition-colors flex items-center gap-2"
            >
              <span>☰</span>
              History
            </button>
            
            <div className="flex-1 flex justify-center">
              <h1 className="text-4xl font-bold">
                MCP Chat Client
              </h1>
            </div>
            
            <div className="flex items-center gap-2">
              <a 
                href="/conscious-memory"
                className="bg-purple-600 text-white px-3 py-2 rounded-lg hover:bg-purple-700 transition-colors text-sm flex items-center gap-1"
                title="Memory Dashboard"
              >
                🧠 Memory
              </a>
              
              <a 
                href="/attachments"
                className="bg-green-600 text-white px-3 py-2 rounded-lg hover:bg-green-700 transition-colors text-sm flex items-center gap-1"
                title="Attachment Dashboard"
              >
                📎 Files
              </a>
              
              {/* Add autopilot toggle */}
              <button
                onClick={() => setAutopilotEnabled(!autopilotEnabled)}
                className={`px-3 py-2 rounded-lg text-sm flex items-center gap-1 transition-colors ${
                  autopilotEnabled 
                    ? 'bg-amber-500 hover:bg-amber-600 text-white' 
                    : 'bg-gray-200 hover:bg-gray-300 text-gray-700'
                }`}
                title={autopilotEnabled ? "Disable autopilot" : "Enable autopilot"}
              >
                <span>🤖</span> Autopilot {autopilotEnabled ? 'ON' : 'OFF'}
              </button>
              
              <button
                onClick={startNewChat}
                className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2"
              >
                <span>+</span>
                New
              </button>
            </div>
          </div>
        
        {/* Rest of the UI remains the same */}
````

## 3. Create Motive Force Prompt API Route

Create a new API route to handle saving to the `motive-force-prompt.md` file:

````typescript
import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import { join } from 'path';

export async function POST(request: NextRequest) {
  try {
    const { text } = await request.json();
    
    if (!text || typeof text !== 'string') {
      return NextResponse.json(
        { error: 'Text is required and must be a string' },
        { status: 400 }
      );
    }
    
    const filePath = join(process.cwd(), 'motive-force-prompt.md');
    
    // Check if file exists, if not create it with a header
    if (!fs.existsSync(filePath)) {
      fs.writeFileSync(filePath, 
        "# MotiveForce (Autopilot) System Prompt\n" +
        "You are an AI assistant operating in \"autopilot mode\" - your job is to analyze the conversation\n" +
        "and suggest the next best action or query to continue the investigation.\n\n"
      );
    }
    
    // Append the new text
    fs.appendFileSync(filePath, `\n## User Instructions\n${text}\n`);
    
    console.log('✅ Saved new autopilot instructions to motive-force-prompt.md');
    
    return NextResponse.json({ 
      success: true,
      message: 'Autopilot instructions saved successfully'
    });
  } catch (error) {
    console.error('❌ Error saving autopilot instructions:', error);
    return NextResponse.json(
      { 
        success: false,
        error: 'Failed to save autopilot instructions',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

export async function DELETE() {
  try {
    const filePath = join(process.cwd(), 'motive-force-prompt.md');
    
    if (fs.existsSync(filePath)) {
      // Reset to default content
      fs.writeFileSync(filePath, 
        "# MotiveForce (Autopilot) System Prompt\n" +
        "You are an AI assistant operating in \"autopilot mode\" - your job is to analyze the conversation\n" +
        "and suggest the next best action or query to continue the investigation.\n\n"
      );
    }
    
    return NextResponse.json({ 
      success: true,
      message: 'Autopilot instructions reset successfully'
    });
  } catch (error) {
    console.error('❌ Error resetting autopilot instructions:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to reset autopilot instructions' },
      { status: 500 }
    );
  }
}
````

## 4. Create Helper for LangGraph Stub

Let's create a simple module for the MotiveForce graph logic:

````typescript
import { LLMService } from '../llm-service';

/**
 * Simple LangGraph stub for MotiveForce (Autopilot)
 * This is a minimal implementation that will be replaced with a full LangGraph implementation later
 */
export async function runMotiveForceGraph(
  context: string,
  systemPrompt: string,
  options: { provider?: string, model?: string } = {}
): Promise<string> {
  try {
    // Initialize LLM service
    const llmService = new LLMService(options);
    await llmService.initialize();
    
    // Create a combined prompt
    const combinedPrompt = `
${systemPrompt}

## Current Conversation:
${context}

## Task:
Based on the system prompt and the conversation above, generate a single follow-up question or command 
that would help advance this conversation. Make your response clear, concise, and directly usable.

Your response should be a single command or question, no explanations or additional text.
`;
    
    // Generate response with higher temperature for more exploration
    const command = await llmService.generateResponse(combinedPrompt, {
      temperature: 0.8,
    });
    
    // Clean up the response
    return command.trim()
      .replace(/^("|'|`)|("|'|`)$/g, '') // Remove quotes if present
      .replace(/^(Question|Command|Follow-up|Response):\s*/i, ''); // Remove prefixes
  } catch (error) {
    console.error('❌ MotiveForce Graph Error:', error);
    return "What else should we explore about this topic?"; // Fallback
  }
}
````

## 5. Create MotiveForce API Route

Now let's implement the API route for MotiveForce:

````typescript
import { NextRequest, NextResponse } from 'next/server';
import { readFileSync } from 'fs';
import { join } from 'path';
import { ChatHistoryDatabase } from '../../../lib/chat-history';
import { runMotiveForceGraph } from '../../../lib/langgraph/motiveForceGraph';

/**
 * MotiveForce API Route - Handles autopilot functionality
 */
export async function POST(request: NextRequest) {
  try {
    const { sessionId } = await request.json();
    
    if (!sessionId) {
      return NextResponse.json(
        { error: 'Session ID is required' },
        { status: 400 }
      );
    }
    
    console.log('🤖 MotiveForce API: Processing request for session:', sessionId);
    
    // Step 1: Load conversation context from database
    const db = ChatHistoryDatabase.getInstance();
    const session = db.getSession(sessionId);
    
    if (!session) {
      return NextResponse.json(
        { error: 'Session not found' },
        { status: 404 }
      );
    }
    
    // Format the last few messages (up to 5) as context
    const recentMessages = session.messages
      .slice(-5) // Get last 5 messages
      .map(msg => `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.content}`)
      .join('\n\n');
    
    console.log('🤖 MotiveForce API: Loaded context from session with', session.messages.length, 'messages');
    
    // Step 2: Read motive-force-prompt.md
    try {
      const systemPromptPath = join(process.cwd(), 'motive-force-prompt.md');
      const systemPrompt = readFileSync(systemPromptPath, 'utf-8').trim();
      
      console.log('🤖 MotiveForce API: Loaded system prompt from motive-force-prompt.md');
      
      // Step 3: Run the LangGraph (stub)
      const command = await runMotiveForceGraph(recentMessages, systemPrompt);
      
      console.log('🤖 MotiveForce API: Generated command:', command);
      
      // Step 4: Return the command
      return NextResponse.json({
        success: true,
        command,
        message: 'Autopilot command generated successfully'
      });
      
    } catch (error) {
      if ((error as any).code === 'ENOENT') {
        console.log('🤖 MotiveForce API: motive-force-prompt.md not found, using default prompt');
        const defaultPrompt = "You are an autopilot agent. Generate a relevant follow-up question.";
        const command = await runMotiveForceGraph(recentMessages, defaultPrompt);
        
        return NextResponse.json({
          success: true,
          command,
          message: 'Autopilot command generated with default prompt'
        });
      } else {
        throw error;
      }
    }
  } catch (error) {
    console.error('❌ MotiveForce API Error:', error);
    return NextResponse.json(
      { 
        success: false,
        error: 'Failed to generate autopilot command',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
````

## 6. Add UI Indicator During Autopilot Execution

Let's enhance the UI to show when Autopilot is processing:

````typescript
// Add to existing MessageInput component

// Add this to the props interface
isWaitingForAutopilot?: boolean;
autopilotEnabled?: boolean;

// Then update the button section in the component
<div className="flex items-center justify-between">
  <div className="flex items-center gap-2">
    {/* Existing buttons */}
  </div>
  
  <button
    type="submit"
    disabled={isLoading || (!input.trim() && attachments.length === 0) || isWaitingForAutopilot}
    className={`px-6 py-2 rounded-lg transition-colors ${
      isLoading || isWaitingForAutopilot
        ? 'bg-gray-400 text-white cursor-not-allowed'
        : autopilotEnabled
          ? 'bg-amber-500 text-white hover:bg-amber-600'
          : 'bg-blue-500 text-white hover:bg-blue-600'
    } disabled:opacity-50 disabled:cursor-not-allowed`}
  >
    {isLoading ? (
      'Sending...'
    ) : isWaitingForAutopilot ? (
      '🤖 Autopilot...'
    ) : autopilotEnabled ? (
      '🤖 Set Autopilot'
    ) : (
      'Send'
    )}
  </button>
</div>
````

And pass these props from the page:

````typescript
// In page.tsx
<MessageInput
  input={input}
  handleInputChange={handleInputChange}
  handleSubmit={handleChatSubmit}
  isLoading={isLoading}
  isWaitingForAutopilot={isWaitingForAutopilot}
  autopilotEnabled={autopilotEnabled}
/>
````

## 7. Create Informative Autopilot Display Component

Let's create a component to show when autopilot is active:

````typescript
import React from 'react'

interface AutopilotStatusProps {
  enabled: boolean
  isWaiting: boolean
  onToggle: () => void
  onReset?: () => void
}

export default function AutopilotStatus({ 
  enabled, 
  isWaiting,
  onToggle,
  onReset
}: AutopilotStatusProps) {
  if (!enabled && !isWaiting) return null;
  
  return (
    <div className={`
      fixed bottom-4 right-4 p-4 rounded-lg shadow-lg z-50
      ${enabled ? 'bg-amber-100 border border-amber-300' : 'bg-gray-100 border border-gray-300'}
    `}>
      <div className="flex items-center gap-3">
        <div className={`
          w-3 h-3 rounded-full
          ${isWaiting ? 'bg-amber-500 animate-pulse' : enabled ? 'bg-green-500' : 'bg-gray-400'}
        `}></div>
        
        <div className="text-sm font-medium">
          {isWaiting ? (
            'Autopilot processing...'
          ) : enabled ? (
            'Autopilot enabled'
          ) : (
            'Autopilot ready'
          )}
        </div>
        
        <div className="flex gap-2">
          <button
            onClick={onToggle}
            className={`
              text-xs px-2 py-1 rounded
              ${enabled 
                ? 'bg-amber-500 text-white hover:bg-amber-600' 
                : 'bg-gray-200 text-gray-700 hover:bg-gray-300'}
            `}
          >
            {enabled ? 'Disable' : 'Enable'}
          </button>
          
          {onReset && enabled && (
            <button
              onClick={onReset}
              className="text-xs px-2 py-1 rounded bg-gray-200 text-gray-700 hover:bg-gray-300"
            >
              Reset
            </button>
          )}
        </div>
      </div>
      
      {enabled && (
        <div className="mt-2 text-xs text-gray-600">
          {isWaiting 
            ? 'Autopilot is analyzing the conversation and generating the next action...'
            : 'Enter your instructions for the autopilot'}
        </div>
      )}
    </div>
  )
}
````

Add it to the page:

````typescript
// Near the end of the JSX, add:

{/* Autopilot status indicator */}
<AutopilotStatus
  enabled={autopilotEnabled}
  isWaiting={isWaitingForAutopilot}
  onToggle={() => setAutopilotEnabled(!autopilotEnabled)}
  onReset={async () => {
    try {
      await fetch('/api/motive-force-prompt', { method: 'DELETE' });
      setAutopilotEnabled(false);
    } catch (error) {
      console.error('Failed to reset autopilot:', error);
    }
  }}
/>
````

## 8. Add Reset Function to Reset System Prompt

Let's add a function to reset the autopilot instructions when needed:

````typescript
// Add this function in the component

const resetAutopilot = async () => {
  try {
    await fetch('/api/motive-force-prompt', { method: 'DELETE' });
    setAutopilotEnabled(false);
    setIsWaitingForAutopilot(false);
    
    // Show feedback to user
    setMessages(prev => [...prev, {
      id: `system-${Date.now()}`,
      role: 'system',
      content: `🔄 Autopilot has been reset.`,
      createdAt: new Date()
    }]);
  } catch (error) {
    console.error('Failed to reset autopilot:', error);
  }
}
````

## 9. Modify Package.json to Ensure Required Dependencies

Make sure you have any necessary dependencies:

```json
// Add these to our package.json dependencies if needed
{
  "dependencies": {
    // Existing dependencies
    "@langchain/core": "^0.2.0",
    "langgraph": "^0.0.15"
  }
}
```

## Testing Workflow

1. I start our application and ensure the new Autopilot toggle appears in the header
2. Click the toggle to enable Autopilot
3. Enter a message like "I want you to help me research quantum computing concepts. Focus on explaining superposition and entanglement in simple terms. After that, suggest some practical applications."
4. This message should be saved to `motive-force-prompt.md` instead of being sent to the chat
5. I should see a system message indicating the instructions were captured
6. Send a regular message like "What is quantum computing?"
7. After MachineSpirit answers, MotiveForce should automatically generate a follow-up question
8. The follow-up question should appear as a user message and MachineSpirit should respond
9. The process should continue as long as Autopilot is enabled

## Troubleshooting

If we encounter issues:

1. Check the browser console for errors
2. Verify that `motive-force-prompt.md` is being created and updated correctly
3. Check the server logs for any API errors
4. Ensure the autopilot toggle state is being properly managed

This implementation should give us a good foundation for the Autopilot feature. We can extend it further by:

1. Adding more sophisticated LangGraph processing in `motiveForceGraph.ts`
2. Improving the UI with more detailed status indicators
3. Adding configuration options for Autopilot behavior
4. Implementing meticulous memory grooming workflows

---

# Improved Autopilot Feature Implementation Plan

After reviewing the existing plan in motive-force.md, I've identified several areas for improvement to make the autopilot feature more robust, configurable, and better integrated with the existing architecture.

## 1. Architecture Enhancements

### Create a Dedicated MotiveForce Service

Rather than just implementing API routes directly, we should create a proper service layer:

```typescript
// src/lib/motive-force.ts
import { LLMService } from './llm-service';
import { getRAGService } from './rag';
import { getConsciousMemoryService } from './conscious-memory';

export interface MotiveForceOptions {
  enableConsciousMemory?: boolean;
  enableRAG?: boolean;
  temperature?: number;
  provider?: string;
  model?: string;
  delayBetweenTurns?: number;
}

export class MotiveForceService {
  private llmService: LLMService;
  private ragService = getRAGService();
  private memoryService = getConsciousMemoryService();
  
  constructor(private options: MotiveForceOptions = {}) {
    this.llmService = new LLMService({
      provider: options.provider,
      model: options.model
    });
  }
  
  async initialize(): Promise<void> {
    await this.llmService.initialize();
    // Initialize other services as needed
  }
  
  async generateNextQuery(
    conversationHistory: string,
    sessionId: string
  ): Promise<string> {
    // Implementation details for generating the next query
  }
}

// Singleton getter
export function getMotiveForceService(options?: MotiveForceOptions): MotiveForceService {
  // Implementation
}
```

## 2. Enhanced System Prompt

The system prompt should be more detailed to guide the autopilot behavior:

```markdown
# MotiveForce (Autopilot) System Prompt

You are an AI assistant operating in "autopilot mode" - your job is to analyze the conversation
and suggest the next best action or query to continue the investigation.

## Your Role
- Analyze the conversation context to determine the most valuable follow-up
- Generate a single, clear question or command that advances the topic
- Focus on helping the user achieve their apparent goals

## Approach Guidelines
- For exploratory topics: Ask questions that broaden understanding
- For problem-solving: Suggest actions that drive toward solutions
- For creative tasks: Propose ideas that build upon established concepts
- For learning topics: Ask questions that test comprehension

## Response Format
- Return ONLY the next question/command without explanations
- Keep responses concise and directly actionable
- DO NOT include prefixes like "Next query:" or "Follow up:"
```

## 3. Configuration Management

Add proper configuration management with defaults and persistence:

```typescript
// src/types/motive-force.ts
export interface MotiveForceConfig {
  enabled: boolean;
  delayBetweenTurns: number;
  maxConsecutiveTurns: number;
  temperature: number;
  historyDepth: number;
  useRag: boolean;
  useConsciousMemory: boolean;
  mode: 'aggressive' | 'balanced' | 'conservative';
}

export interface MotiveForceState {
  enabled: boolean;
  isGenerating: boolean;
  currentTurn: number;
  lastGeneratedAt?: Date;
  errorCount: number;
}
```

## 4. Improved API Routes

Enhance the API routes with better action handling and error management:

```typescript
// src/app/api/motive-force/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getMotiveForceService } from '../../../lib/motive-force';
import { ChatHistoryDatabase } from '../../../lib/chat-history';

export async function POST(request: NextRequest) {
  try {
    const { action, sessionId, options } = await request.json();
    
    switch (action) {
      case 'generate': {
        // Get chat history and generate next query
        
        return NextResponse.json({
          success: true,
          query: nextQuery
        });
      }
      
      case 'savePrompt': {
        // Save system prompt
      }
      
      case 'getConfig': {
        // Return configuration
      }
      
      case 'saveConfig': {
        // Save configuration
      }
      
      default:
        return NextResponse.json(
          { error: 'Invalid action' },
          { status: 400 }
        );
    }
  } catch (error) {
    // Error handling
  }
}
```

## 5. Enhanced UI Components

### Create Better UI Indicators and Controls

```tsx
// src/components/MotiveForceToggle.tsx
export default function MotiveForceToggle({
  enabled,
  onToggle,
  size = 'md'
}: MotiveForceToggleProps) {
  return (
    <button
      onClick={() => onToggle(!enabled)}
      className={`flex items-center gap-1 px-3 py-1 rounded-md transition-colors ${
        enabled 
          ? 'bg-blue-500 text-white' 
          : 'bg-gray-200 text-gray-700'
      }`}
      title={enabled ? 'Disable Autopilot' : 'Enable Autopilot'}
    >
      <span className={size === 'sm' ? 'text-xs' : 'text-sm'}>
        {enabled ? '🤖 Autopilot ON' : '🤖 Autopilot OFF'}
      </span>
    </button>
  );
}
```

### Add Settings Modal for Configuration

```tsx
// src/components/MotiveForceSettings.tsx
export default function MotiveForceSettings({
  isOpen,
  onClose,
  onSave,
  initialConfig
}: MotiveForceSettingsProps) {
  const [config, setConfig] = useState(initialConfig);
  
  // Implementation with sliders, toggles, and mode selection
}
```

## 6. Chat Interface Integration

Update the chat interface to properly manage autopilot state:

```tsx
// In ChatInterface.tsx
export default function ChatInterface({ /* props */ }) {
  // Add state for autopilot
  const [autopilotEnabled, setAutopilotEnabled] = useState(false);
  const [autopilotState, setAutopilotState] = useState<MotiveForceState>({
    enabled: false,
    isGenerating: false,
    currentTurn: 0,
    errorCount: 0
  });
  
  // Handle autopilot toggle
  const handleAutopilotToggle = (enabled: boolean) => {
    setAutopilotEnabled(enabled);
    // Additional logic for enabling/disabling
  };
  
  // Function to trigger autopilot
  const triggerAutopilotTurn = async () => {
    if (!sessionId || !autopilotEnabled || autopilotState.isGenerating) {
      return;
    }
    
    try {
      setAutopilotState(prev => ({ ...prev, isGenerating: true }));
      
      // Call the API to generate the next query
      
      // Use the generated query as user input
      
      // Schedule next turn if needed
    } catch (error) {
      // Error handling
    }
  };
}
```

## 7. Comprehensive Testing

Add thorough testing for the autopilot feature:

```typescript
// src/tests/motive-force-test.ts
async function testMotiveForce() {
  console.log('🧪 Testing MotiveForce Service...');
  
  try {
    // Initialize service
    const motiveForce = getMotiveForceService();
    await motiveForce.initialize();
    
    // Test with different types of conversations
    // - Informational queries
    // - Technical discussions
    // - Creative brainstorming
    
    return true;
  } catch (error) {
    console.error('❌ MotiveForce test failed:', error);
    return false;
  }
}
```

## 8. Error Handling and Recovery

Implement robust error handling:

1. Add retry logic for failed autopilot attempts
2. Track error counts and disable autopilot after consecutive failures
3. Provide clear error messages in the UI
4. Implement logging for diagnostics

## 9. Performance Optimization

1. Add configurable delays between turns to prevent overwhelming the user
2. Implement rate limiting to avoid excessive API calls
3. Allow setting maximum consecutive autopilot turns
4. Enable selective memory usage (RAG vs. conscious memory)

## 10. Documentation

Create comprehensive user documentation:

```markdown
# MotiveForce (Autopilot) User Guide

## What is MotiveForce?
MotiveForce is an "autopilot" feature that helps drive conversations forward by automatically generating follow-up questions based on the context of your discussion.

## Key Features
- Automatically generates relevant follow-up questions
- Configurable behavior (conservative to aggressive)
- Integrates with memory systems for context awareness
- Customizable via system prompt

## Using MotiveForce
1. Enable the autopilot toggle
2. Start a conversation normally
3. After each assistant response, MotiveForce will suggest the next question
4. You can interrupt at any time by typing your own message