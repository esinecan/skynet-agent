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
    for (const config of this.serverConfigs) {
      try {
        await this.connectToServer(config);
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        logger.error(`Failed to connect to MCP server ${config.name}:`, err);
      }
    }
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

  // Method to get all connected clients for use with @google/genai mcpToTool
  getAllClients(): McpClient[] {
    return Array.from(this.clients.values());
  }

  async callTool(serverName: string, toolName: string, args: Record<string, any>): Promise<any> {
    const client = this.getClient(serverName);
    if (!client) {
      throw new Error(`No MCP client found for server: ${serverName}`);
    }

    try {
      const result = await client.callTool({
        name: toolName,
        params: args
      });
      return result;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      logger.error(`Error calling tool ${toolName} on ${serverName}:`, err);
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
