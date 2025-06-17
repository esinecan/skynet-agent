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
    // Check if the server exists
    const client = this.clients.get(serverName);
    if (!client) {
      console.warn(` MCP Manager: Server not found: ${serverName}`);
      return {
        error: true,
        isError: true,
        message: `Tool call failed: Server "${serverName}" not found.`,
        details: `Available servers: ${this.getConnectedServers().join(', ')}`,
        server: serverName,
        tool: toolName
      };
    }

    try {
      // Check if the tool exists before calling it
      const availableTools = await this.listTools(serverName);
      const toolExists = availableTools.some(tool => tool.name === toolName);
      
      if (!toolExists) {
        console.warn(` MCP Manager: Tool "${toolName}" not found in server "${serverName}"`);
        const allTools = await this.getAllAvailableTools();
        
        return {
          error: true,
          isError: true,
          message: `Tool "${toolName}" does not exist on server "${serverName}".`,
          details: `Available tools on server "${serverName}": ${availableTools.map(t => t.name).join(', ')}`,
          suggestedAlternatives: this.findSimilarTools(toolName, allTools),
          server: serverName,
          tool: toolName
        };
      }
      
      // If tool exists, proceed with the call
      const result = await client.callTool({
        name: toolName,
        arguments: args
      });
      
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
        isError: true,
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

  // Helper method to get all available tools across all servers
  async getAllAvailableTools(): Promise<{serverName: string, toolName: string}[]> {
    const allTools: {serverName: string, toolName: string}[] = [];
    
    for (const serverName of this.getConnectedServers()) {
      try {
        const tools = await this.listTools(serverName);
        tools.forEach(tool => {
          allTools.push({
            serverName,
            toolName: tool.name
          });
        });
      } catch (error) {
        console.error(`Error getting tools for ${serverName}:`, error);
      }
    }
    
    return allTools;
  }

  // Find similar tool names to suggest alternatives
  findSimilarTools(toolName: string, allTools: {serverName: string, toolName: string}[]): string[] {
    // Basic similarity - tools that contain part of the requested name
    const nameParts = toolName.toLowerCase().split('_');
    
    return allTools
      .filter(tool => {
        const lowerToolName = tool.toolName.toLowerCase();
        return nameParts.some(part => 
          part.length > 3 && lowerToolName.includes(part)
        );
      })
      .map(tool => `${tool.serverName}_${tool.toolName}`)
      .slice(0, 5); // Limit to 5 suggestions
  }
}
