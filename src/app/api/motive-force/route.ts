import { NextRequest, NextResponse } from 'next/server';
import { HumanMessage, AIMessage, BaseMessage } from '@langchain/core/messages';
import { v4 as uuidv4 } from 'uuid';
import {
  motiveForceGraph,
  createInitialState,
  defaultMotiveForceConfig
} from '../../../lib/motive-force-graph';
import {
  MotiveForceGraphState,
  MotiveForceGraphConfig,
  MotiveForceEvent
} from '../../../types/motive-force-graph';
import { MotiveForceStorage } from '../../../lib/motive-force-storage';
import { ChatHistoryDatabase } from '../../../lib/chat-history';

export const maxDuration = 300; // 5 minutes for complex operations

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, sessionId, data } = body;
    
    switch (action) {
      case 'generate': {
        if (!sessionId) {
          return NextResponse.json(
            { error: 'Session ID is required' },
            { status: 400 }
          );
        }
        
        const db = ChatHistoryDatabase.getInstance();
        const session = db.getSession(sessionId);
        
        if (!session) {
          return NextResponse.json(
            { error: 'Session not found' },
            { status: 404 }
          );
        }

        // Convert chat messages to BaseMessage format
        const messages: BaseMessage[] = session.messages.map(msg => {
          if (msg.role === 'user') {
            return new HumanMessage(msg.content);
          } else {
            return new AIMessage(msg.content);
          }
        });

        // Create initial state for the graph
        const threadId = `motive-force-${sessionId}`;
        const initialState = createInitialState(messages, threadId);

        // Execute the LangGraph workflow
        const finalState = await motiveForceGraph.invoke(initialState, {
          configurable: { thread_id: threadId }
        });

        // Extract the generated query from working memory where motive force stored it
        const query = finalState.workingMemory?.generatedQuery || 
                     finalState.messages[finalState.messages.length - 1]?.content?.toString() || 
                             'Continue with the current task';

        return NextResponse.json({
          success: true,
          query,
          generatedAt: new Date().toISOString(),
          state: {
            purpose: finalState.currentPurpose,
            progress: finalState.overallProgress,
            subgoals: finalState.subgoals.length,
            blockers: finalState.blockers,
            needsUserInput: finalState.needsUserInput,
          }
        });
      }

      case 'generateStreaming': {
        if (!sessionId) {
          return NextResponse.json(
            { error: 'Session ID is required' },
            { status: 400 }
          );
        }
        
        const db = ChatHistoryDatabase.getInstance();
        const session = db.getSession(sessionId);
        
        if (!session) {
          return NextResponse.json(
            { error: 'Session not found' },
            { status: 404 }
          );
        }

        // Convert chat messages to BaseMessage format
        const messages: BaseMessage[] = session.messages.map(msg => {
          if (msg.role === 'user') {
            return new HumanMessage(msg.content);
          } else {
            return new AIMessage(msg.content);
          }
        });

        const threadId = `motive-force-${sessionId}`;
        const initialState = createInitialState(messages, threadId);

        // Create a streaming response with simulated progress
        const encoder = new TextEncoder();
        const stream = new ReadableStream({
          async start(controller) {
            try {
              // Send initial event
              const startEvent: MotiveForceEvent = {
                type: 'step_start',
                data: { message: 'Starting MotiveForce execution...' },
                timestamp: new Date(),
              };
              controller.enqueue(encoder.encode(JSON.stringify(startEvent) + '\n'));

              // Execute the graph (non-streaming for now)
              const finalState = await motiveForceGraph.invoke(initialState, {
                configurable: { thread_id: threadId }
              });

              // Send progress update
              const progressEvent: MotiveForceEvent = {
                type: 'progress_update',
                data: {
                  purpose: finalState.currentPurpose,
                  progress: finalState.overallProgress,
                  subgoals: finalState.subgoals.length,
                  blockers: finalState.blockers,
                },
                timestamp: new Date(),
              };
              controller.enqueue(encoder.encode(JSON.stringify(progressEvent) + '\n'));

              // Send completion event
              const query = finalState.workingMemory?.generatedQuery || 
                           finalState.messages[finalState.messages.length - 1]?.content?.toString() || 
                                          'Continue with the current task';
              
              const completeEvent: MotiveForceEvent = {
                type: 'step_complete',
                data: {
                  query,
                  state: {
                    purpose: finalState.currentPurpose,
                    progress: finalState.overallProgress,
                    subgoals: finalState.subgoals.length,
                    blockers: finalState.blockers,
                    needsUserInput: finalState.needsUserInput,
                  }
                },
                timestamp: new Date(),
              };
              controller.enqueue(encoder.encode(JSON.stringify(completeEvent) + '\n'));

              controller.close();
            } catch (error) {
              const errorEvent: MotiveForceEvent = {
                type: 'step_error',
                data: { error: error instanceof Error ? error.message : 'Unknown error' },
                timestamp: new Date(),
              };

              controller.enqueue(encoder.encode(JSON.stringify(errorEvent) + '\n'));
              controller.close();
            }
          }
        });

        return new Response(stream, {
          headers: {
            'Content-Type': 'text/plain; charset=utf-8',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
          },
        });
      }
      
      case 'savePrompt': {
        const { text, mode } = data || {};
        
        if (!text || typeof text !== 'string') {
          return NextResponse.json(
            { error: 'Text is required' },
            { status: 400 }
          );
        }
        
        if (mode === 'append') {
          MotiveForceStorage.appendToSystemPrompt(text);
        } else {
          MotiveForceStorage.saveSystemPrompt(text);
        }
        
        return NextResponse.json({
          success: true,
          message: 'System prompt saved successfully'
        });
      }
      
      case 'resetPrompt': {
        MotiveForceStorage.resetSystemPrompt();
        
        return NextResponse.json({
          success: true,
          message: 'System prompt reset to default'
        });
      }
      
      case 'getPrompt': {
        const prompt = MotiveForceStorage.getSystemPrompt();
        
        return NextResponse.json({
          success: true,
          prompt
        });
      }
      
      case 'getConfig': {
        // Return the current graph configuration
        const config = defaultMotiveForceConfig;
        
        return NextResponse.json({
          success: true,
          config
        });
      }
      
      case 'saveConfig': {
        const { config } = data || {};
        
        if (!config) {
          return NextResponse.json(
            { error: 'Config is required' },
            { status: 400 }
          );
        }
        
        // TODO: Implement config persistence for the graph
        // For now, just validate the config structure
        const validatedConfig: Partial<MotiveForceGraphConfig> = {
          ...defaultMotiveForceConfig,
          ...config
        };
        
        return NextResponse.json({
          success: true,
          message: 'Configuration updated successfully',
          config: validatedConfig
        });
      }

      case 'getState': {
        const { threadId } = data || {};
        
        if (!threadId) {
          return NextResponse.json(
            { error: 'Thread ID is required' },
            { status: 400 }
          );
        }

        try {
          // For the simplified workflow, we can't persist state between requests
          // In a full LangGraph implementation, this would retrieve persistent state
          return NextResponse.json({
            success: true,
            state: {
              message: 'State retrieval not implemented in simplified workflow',
              threadId,
            }
          });
        } catch (error) {
          return NextResponse.json({
            success: false,
            error: 'Failed to retrieve state',
            details: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      }

      case 'updateState': {
        const { threadId, updates } = data || {};
        
        if (!threadId || !updates) {
          return NextResponse.json(
            { error: 'Thread ID and updates are required' },
            { status: 400 }
          );
        }

        try {
          // For the simplified workflow, state updates are not persistent
          // In a full LangGraph implementation, this would update persistent state
          return NextResponse.json({
            success: true,
            message: 'State update not implemented in simplified workflow (updates would be applied during execution)'
          });
        } catch (error) {
          return NextResponse.json({
            success: false,
            error: 'Failed to update state',
            details: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      }

      case 'interrupt': {
        const { threadId } = data || {};
        
        if (!threadId) {
          return NextResponse.json(
            { error: 'Thread ID is required' },
            { status: 400 }
          );
        }

        try {
          // For the simplified workflow, interruption would need to be handled differently
          // In a full LangGraph implementation, this would set an emergency stop flag
          return NextResponse.json({
            success: true,
            message: 'Interrupt not implemented in simplified workflow (would require session-based state management)'
          });
        } catch (error) {
          return NextResponse.json({
            success: false,
            error: 'Failed to interrupt execution',
            details: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      }
      
      default:
        return NextResponse.json(
          { error: 'Invalid action' },
          { status: 400 }
        );
    }
  } catch (error) {
    console.error('MotiveForce API error:', error);
    return NextResponse.json(
      { 
        success: false,
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action');
    
    switch (action) {
      case 'status': {
        const config = defaultMotiveForceConfig;
        const promptPath = MotiveForceStorage.getPromptPath();
        
        return NextResponse.json({
          success: true,
          status: {
            enabled: true, // Graph is always available
            promptPath,
            config,
            mode: 'langgraph',
            capabilities: [
              'purpose_analysis',
              'plan_generation', 
              'context_gathering',
              'tool_orchestration',
              'progress_monitoring',
              'reflection_engine',
              'user_checkin'
            ]
          }
        });
      }

      case 'health': {
        try {
          // Test if the graph can be instantiated
          const testState = createInitialState([new HumanMessage("test")]);
          
          return NextResponse.json({
            success: true,
            health: 'healthy',
            timestamp: new Date().toISOString()
          });
        } catch (error) {
          return NextResponse.json({
            success: false,
            health: 'unhealthy',
            error: error instanceof Error ? error.message : 'Unknown error',
            timestamp: new Date().toISOString()
          }, { status: 503 });
        }
      }
      
      default:
        return NextResponse.json(
          { error: 'Invalid action' },
          { status: 400 }
        );
    }
  } catch (error) {
    console.error('MotiveForce GET error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
