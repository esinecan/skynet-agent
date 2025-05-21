import { Client as McpClient } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { createLogger } from '../utils/logger';

const logger = createLogger('mcpClient');

interface McpServerConfig {
  name: string;
  transport: "stdio" | "http";
  command?: string;
  args?: string[];
  url?: string;
}

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
      
      // List available tools for debugging
      const tools = await client.listTools();
      // Fix: Handle tools as potentially unknown type
      const toolNames = Array.isArray(tools) ? 
        tools.map((t: any) => t?.name || 'unnamed').join(', ') : 
        'unknown tools';
      logger.info(`${config.name} provides tools: ${toolNames}`);
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      logger.error(`Connection to ${config.name} failed:`, err);
      throw err;
    }
  }

  getClient(serverName: string): McpClient | undefined {
    return this.clients.get(serverName);
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
        // Fix: Convert raw tools to ToolInfo array with proper type handling
        const tools: ToolInfo[] = Array.isArray(rawTools) ? 
          rawTools.map((t: any) => ({
            name: t?.name || 'unnamed',
            description: t?.description || undefined
          })) : [];
        
        allTools.push({serverName, tools});
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        logger.error(`Error listing tools for ${serverName}:`, err);
      }
    }
    
    return allTools;
  }
}
