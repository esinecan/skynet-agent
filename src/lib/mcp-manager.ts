import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { MCPServerConfig } from '../types/mcp';

export class MCPManager {
  private clients: Map<string, Client> = new Map();
  private transports: Map<string, StdioClientTransport> = new Map();
  async connectToServer(config: MCPServerConfig): Promise<void> {
    if (this.clients.has(config.name)) {
      return; // Already connected
    }

    try {      // Create stdio transport for the server with environment variables
      const transport = new StdioClientTransport({
        command: config.command!,
        args: config.args || [],
        env: {
          // Include existing environment (filter out undefined values)
          ...Object.fromEntries(
            Object.entries(process.env).filter(([_, value]) => value !== undefined)
          ) as Record<string, string>,
          // Override with config-specific env vars
          ...(config.env || {})
        }
      });

      // Create client
      const client = new Client({
        name: 'MCP Chat Client',
        version: '1.0.0'
      }, {
        capabilities: {
          tools: {},
          resources: {},
          prompts: {}
        }
      });

      // Connect
      await client.connect(transport);
      
      // Store references
      this.clients.set(config.name, client);
      this.transports.set(config.name, transport);

      console.log(`Connected to MCP server: ${config.name}`);
    } catch (error) {
      console.error(`Failed to connect to MCP server ${config.name}:`, error);
      throw error;
    }
  }

  async disconnectFromServer(serverName: string): Promise<void> {
    const client = this.clients.get(serverName);
    const transport = this.transports.get(serverName);

    if (client && transport) {
      try {
        await client.close();
        this.clients.delete(serverName);
        this.transports.delete(serverName);
        console.log(`Disconnected from MCP server: ${serverName}`);
      } catch (error) {
        console.error(`Error disconnecting from ${serverName}:`, error);
      }
    }
  }  async callTool(serverName: string, toolName: string, args: any): Promise<any> {
    console.log(` MCP Manager: Calling tool ${toolName} on server ${serverName}`);
    console.log(` MCP Manager: Tool arguments:`, JSON.stringify(args, null, 2));
    
    const client = this.clients.get(serverName);
    if (!client) {
      const error = `Not connected to server: ${serverName}`;
      console.error(` MCP Manager: ${error}`);
      throw new Error(error);
    }

    try {
      console.log(` MCP Manager: Calling client.callTool...`);
      const result = await client.callTool({
        name: toolName,
        arguments: args
      });
      console.log(` MCP Manager: Tool call succeeded:`, JSON.stringify(result, null, 2));
      
      // Ensure the result is properly serializable
      if (result && typeof result === 'object') {
        try {
          // Test serialization
          JSON.stringify(result);
          return result;
        } catch (serializationError) {
          console.warn(` MCP Manager: Result not serializable, converting:`, serializationError);
          return { message: String(result) };
        }
      }
      
      return result;
    } catch (error) {
      console.error(` MCP Manager: Error calling tool ${toolName} on ${serverName}:`, error);
      
      // Don't throw, return a structured error response
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        error: true,
        message: `MCP tool call failed: ${errorMessage}`,
        server: serverName,
        tool: toolName
      };
    }
  }

  async listTools(serverName: string): Promise<any[]> {
    const client = this.clients.get(serverName);
    if (!client) {
      throw new Error(`Not connected to server: ${serverName}`);
    }

    try {
      const result = await client.listTools();
      return result.tools || [];
    } catch (error) {
      console.error(`Error listing tools for ${serverName}:`, error);
      return [];
    }
  }

  async listResources(serverName: string): Promise<any[]> {
    const client = this.clients.get(serverName);
    if (!client) {
      throw new Error(`Not connected to server: ${serverName}`);
    }

    try {
      const result = await client.listResources();
      return result.resources || [];
    } catch (error) {
      console.error(`Error listing resources for ${serverName}:`, error);
      return [];
    }
  }

  getConnectedServers(): string[] {
    return Array.from(this.clients.keys());
  }

  isConnected(serverName: string): boolean {
    return this.clients.has(serverName);
  }

  async disconnectAll(): Promise<void> {
    const disconnectPromises = Array.from(this.clients.keys())
      .map(serverName => this.disconnectFromServer(serverName));
    
    await Promise.all(disconnectPromises);
  }
}
