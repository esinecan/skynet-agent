import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

export interface MCPServerConfig {
  name: string;
  url?: string;
  type: 'http' | 'stdio';
  command?: string;
  args?: string[];
  env?: { [key: string]: string };
}

export class MCPClient {
  private client: Client | null = null;
  private isConnected = false;

  constructor(private name: string, private serverUrl?: string) {}

  async connect(url?: string) {
    // Use environment variable as fallback if url is not provided
    const serverUrl = url || this.serverUrl || `http://localhost:${process.env.MCP_SERVER_PORT || 8081}`;
    const transport = new StreamableHTTPClientTransport(new URL(serverUrl));
    this.client = new Client({ name: this.name || 'LocalChatClient', version: '1.0.0' });
    await this.client.connect(transport);
    this.isConnected = true;
  }

  async callTool(name: string, args: any) {
    if (!this.client || !this.isConnected) {
      throw new Error('Client not connected');
    }
    return await this.client.callTool({ name, arguments: args });
  }

  async disconnect() {
    if (this.client && this.isConnected) {
      await this.client.close();
      this.isConnected = false;
    }
  }

  get connected(): boolean {
    return this.isConnected;
  }
}