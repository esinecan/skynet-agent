import { Client as McpClient } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

type McpServerConfig = {
  name: string;
  transport: "stdio" | "http";
  command?: string;
  args?: string[];
  url?: string;
};

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
        console.error(`Failed to connect to MCP server ${config.name}:`, error);
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
      transport = new StreamableHTTPClientTransport({
        baseUrl: new URL(config.url)
      });
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
      console.log(`Connected to MCP server: ${config.name}`);
      
      // List available tools for debugging
      const tools = await client.listTools();
      console.log(`${config.name} provides tools:`, tools.map(t => t.name));
    } catch (error) {
      console.error(`Connection to ${config.name} failed:`, error);
      throw error;
    }
  }

  getClient(serverName: string): McpClient | undefined {
    return this.clients.get(serverName);
  }

  async callTool(serverName: string, toolName: string, args: any): Promise<any> {
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
      console.error(`Error calling tool ${toolName} on ${serverName}:`, error);
      throw error;
    }
  }

  // Method to list all available tools across all connected servers
  async listAllTools(): Promise<{serverName: string, tools: any[]}[]> {
    const allTools = [];
    
    for (const [serverName, client] of this.clients.entries()) {
      try {
        const tools = await client.listTools();
        allTools.push({serverName, tools});
      } catch (error) {
        console.error(`Error listing tools for ${serverName}:`, error);
      }
    }
    
    return allTools;
  }
}