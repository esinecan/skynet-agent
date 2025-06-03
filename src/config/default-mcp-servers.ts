import { MCPServerConfig } from '../types/mcp';

export interface MCPConfig {
  mcp: {
    servers: {
      [serverName: string]: {
        command: string;
        args: string[];
      };
    };
  };
}

// Load configuration from environment or use defaults
export const mcpConfig: MCPConfig = {
  mcp: {
    servers: {
      filesystem: {
        command: 'npx',
        args: [
          '-y',
          '@modelcontextprotocol/server-filesystem',
          process.env.FILESYSTEM_PATH || 'C:/Users/yepis/agent-personal-space'
        ]
      },
      'windows-cli': {
        command: 'npx',
        args: [
          '-y',
          '@simonb97/server-win-cli'
        ]
      },
      playwright: {
        command: 'npx',
        args: ['@playwright/mcp@latest']
      },
      'sequential-thinking': {
        command: 'npx',
        args: [
          '-y',
          '@modelcontextprotocol/server-sequential-thinking'
        ]
      },
      'conscious-memory': {
        command: 'npx',
        args: [
          'tsx',
          './src/lib/mcp-servers/conscious-memory-server.ts'
        ]
      }
    }
  }
};

export function getMCPServerConfig(serverName: string): MCPServerConfig | undefined {
  const serverConfig = mcpConfig.mcp.servers[serverName];
  if (!serverConfig) return undefined;
  
  return {
    name: serverName,
    type: 'stdio',
    command: serverConfig.command,
    args: serverConfig.args
  };
}

export function getAllMCPServers(): MCPServerConfig[] {
  return Object.keys(mcpConfig.mcp.servers).map(serverName => ({
    name: serverName,
    type: 'stdio',
    command: mcpConfig.mcp.servers[serverName].command,
    args: mcpConfig.mcp.servers[serverName].args
  }));
}