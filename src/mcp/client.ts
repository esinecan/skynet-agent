import { Client as McpClient } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { createLogger } from '../utils/logger';
import { McpServerConfig } from '../utils/configLoader';

const logger = createLogger('mcpClient');

export interface ToolInfo {
  name: string;
  description?: string;
}

export class McpClientManager {
  private clients: Map<string, McpClient> = new Map();
  private serverConfigs: McpServerConfig[];

  constructor(serverConfigs: McpServerConfig[] = []) {
    this.serverConfigs = serverConfigs;
  }
  async initialize(): Promise<void> {
    logger.debug('Starting MCP client manager initialization', {
      serverCount: this.serverConfigs.length,
      servers: this.serverConfigs.map(s => ({ name: s.name, transport: s.transport }))
    });
    
    const connectionResults = [];
    for (const config of this.serverConfigs) {
      const startTime = Date.now();
      try {
        logger.debug(`Attempting to connect to MCP server: ${config.name}`, {
          transport: config.transport,
          command: config.command,
          url: config.url,
          args: config.args
        });
        
        await this.connectToServer(config);
        const connectionTime = Date.now() - startTime;
        connectionResults.push({ name: config.name, success: true, timeMs: connectionTime });
        
        logger.debug(`Successfully connected to ${config.name}`, {
          connectionTimeMs: connectionTime
        });
      } catch (error) {
        const connectionTime = Date.now() - startTime;
        const err = error instanceof Error ? error : new Error(String(error));
        connectionResults.push({ name: config.name, success: false, timeMs: connectionTime, error: err.message });
        
        logger.error(`Failed to connect to MCP server ${config.name}:`, {
          error: err,
          connectionTimeMs: connectionTime,
          transport: config.transport,
          errorType: err.constructor.name
        });
      }
    }
    
    const successfulConnections = connectionResults.filter(r => r.success).length;
    logger.debug('MCP client manager initialization completed', {
      totalServers: this.serverConfigs.length,
      successfulConnections,
      failedConnections: this.serverConfigs.length - successfulConnections,
      connectionResults,
      totalConnectionTime: connectionResults.reduce((sum, r) => sum + r.timeMs, 0)
    });
  }

  private async connectToServer(config: McpServerConfig): Promise<void> {
    let transport;
    
    // Create appropriate transport based on configuration
    if (config.transport === "stdio" && config.command) {
      transport = new StdioClientTransport({
        command: config.command,
        args: config.args || []
      });
    } else if (config.transport === "http" && config.url) {
      // Create URL object from string
      const urlObj = new URL(config.url);
      transport = new StreamableHTTPClientTransport(urlObj);
    } else {
      throw new Error(`Invalid MCP server configuration for ${config.name}`);
    }

    // Create and connect the client
    const client = new McpClient({
      name: `SkynetAgent-${config.name}-Client`,
      version: "1.0.0"
    });

    try {
      await client.connect(transport);
      this.clients.set(config.name, client);
      logger.info(`Connected to MCP server: ${config.name}`);
      
      // Debug the actual response from listTools
      try {
        const rawTools = await client.listTools();
        logger.debug(`Raw tools response for ${config.name}:`, { 
          type: typeof rawTools,
          isArray: Array.isArray(rawTools),
          value: rawTools 
        });
        
        // Better handling of tool array
        let toolNames = 'unknown tools';
        if (Array.isArray(rawTools) && rawTools.length > 0) {
          toolNames = rawTools.map(tool => {
            if (typeof tool === 'object' && tool !== null) {
              return tool.name || tool.function || 'unnamed';
            }
            return String(tool);
          }).join(', ');
        } else if (typeof rawTools === 'object' && rawTools !== null) {
          // Handle case where it might be an object with properties
          toolNames = Object.keys(rawTools).join(', ');
        }
        
        logger.info(`${config.name} provides tools: ${toolNames}`);
      } catch (toolError) {
        const err = toolError instanceof Error ? toolError : new Error(String(toolError));
        logger.warn(`Error listing tools for ${config.name}, but continuing:`, err);
      }
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      logger.error(`Connection to ${config.name} failed:`, err);
      throw err;
    }
  }
  getClient(serverName: string): McpClient | undefined {
    return this.clients.get(serverName);
  }

  // Check if a client exists for the given server name
  hasClient(serverName: string): boolean {
    return this.clients.has(serverName);
  }

  // Method to get all connected clients for use with @google/genai mcpToTool
  getAllClients(): McpClient[] {
    return Array.from(this.clients.values());
  }
  async callTool(serverName: string, toolName: string, args: Record<string, any>): Promise<any> {
    const startTime = Date.now();
    const client = this.clients.get(serverName);
    
    if (!client) {
      logger.error('No MCP client found for server', {
        requestedServer: serverName,
        availableServers: Array.from(this.clients.keys())
      });
      throw new Error(`No MCP client found for server: ${serverName}`);
    }

    try {
      // Log detailed argument info before calling tool
      logger.info('Calling tool on MCP client', {
        serverName,
        toolName
      });
      
      logger.debug('Tool call arguments details', {
        serverName,
        toolName,
        argsJson: JSON.stringify(args),
        argsKeys: Object.keys(args),
        rawArgs: args
      });
      
      // Additional validation for known tools
      if (serverName === 'windows-cli' && toolName === 'execute_command') {
        if (!args.command) {
          logger.warn('execute_command missing required command parameter');
        }
        if (!args.shell) {
          logger.warn('execute_command missing recommended shell parameter');
        }
      }
      
      // Log the exact tool parameters being sent
      const toolParams = {
        name: toolName,
        params: args
      };
      
      logger.debug('Sending tool parameters to MCP server', {
        serverName,
        toolName,
        fullToolParams: JSON.stringify(toolParams)
      });
      
      const result = await client.callTool(toolParams);
      
      const callTime = Date.now() - startTime;
      let resultSize = 0;
      let resultPreview = 'null';
      let resultType = typeof result;
      
      try {
        if (result && typeof result === 'string') {
          resultSize = (result as string).length;
          resultPreview = (result as string).substring(0, 200) + ((result as string).length > 200 ? "..." : "");
        } else if (result !== null && result !== undefined) {
          const jsonStr = JSON.stringify(result);
          resultSize = jsonStr.length;
          resultPreview = jsonStr.substring(0, 200) + (jsonStr.length > 200 ? "..." : "");
        }
      } catch (e) {
        resultPreview = '[Error serializing result]';
      }
      
      logger.info('Tool call completed successfully', {
        serverName,
        toolName,
        callTimeMs: callTime
      });
      
      logger.debug('Tool call result details', {
        serverName,
        toolName,
        callTimeMs: callTime,
        resultSize,
        resultType,
        resultPreview,
        fullResult: result
      });
      
      return result;
    } catch (error) {
      const callTime = Date.now() - startTime;
      const err = error instanceof Error ? error : new Error(String(error));
      
      // Log the full error information
      logger.error(`Error calling tool ${toolName} on ${serverName}:`, {
        error: err,
        callTimeMs: callTime,
        serverName,
        toolName,
        argsProvided: Object.keys(args).length,
        errorType: err.constructor.name,
        errorMessage: err.message,
        errorStack: err.stack,
        rawArgs: args
      });
      
      // Check for known error patterns
      if (err.message.includes('Invalid arguments')) {
        logger.error('Invalid arguments error details', {
          serverName,
          toolName,
          providedArgs: args,
          argsKeys: Object.keys(args)
        });
      }
      
      throw err;
    }
  }

  // Method to list all available tools across all connected servers
  async listAllTools(): Promise<{serverName: string, tools: ToolInfo[]}[]> {
    const allTools: {serverName: string, tools: ToolInfo[]}[] = [];
    
    for (const [serverName, client] of this.clients.entries()) {
      try {
        const rawTools = await client.listTools();
        logger.debug(`Raw tools from ${serverName}:`, { type: typeof rawTools, rawTools });
        
        let tools: ToolInfo[] = [];
        
        // Handle different potential response formats
        if (Array.isArray(rawTools)) {
          tools = rawTools.map((t: any) => {
            // Extract name and description with better fallbacks
            const name = t?.name || t?.function || t?.id || 'unnamed';
            const description = t?.description || t?.help || t?.doc || undefined;
            return { name, description };
          });
        } else if (rawTools && typeof rawTools === 'object' && 'tools' in rawTools && Array.isArray((rawTools as any).tools)) {
          // Handle object with tools property
          tools = (rawTools as any).tools.map((t: any) => {
            const name = t?.name || t?.function || t?.id || 'unnamed';
            const description = t?.description || t?.help || t?.doc || undefined;
            return { name, description };
          });
        } else if (typeof rawTools === 'object' && rawTools !== null) {
          // Handle case where it might be an object with tool definitions as properties
          tools = Object.entries(rawTools).map(([key, value]: [string, any]) => {
            const name = value?.name || key;
            const description = value?.description || value?.help || value?.doc || undefined;
            return { name, description };
          });
        }
        
        // Improved logging: Include actual tool names
        const toolNames = tools.map(t => t.name).join(", ");
        logger.info(`Found ${tools.length} tools from server ${serverName}: ${toolNames || "none"}`);
        
        allTools.push({serverName, tools});
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        logger.error(`Error listing tools for ${serverName}:`, err);
        allTools.push({serverName, tools: []});
      }
    }
    
    return allTools;
  }
}
