import { MCPServerConfig } from '../types/mcp';
import { readFileSync } from 'fs';
import { join } from 'path';

export interface MCPConfig {
  mcp: {
    servers: {
      [serverName: string]: {
        command: string;
        args: string[];
        env?: { [key: string]: string };
      };
    };
  };
}

// Load configuration from config.json
function loadMCPConfig(): MCPConfig {
  try {
    const configPath = join(process.cwd(), 'config.json');
    const configFile = readFileSync(configPath, 'utf8');
    const config = JSON.parse(configFile);
    return config as MCPConfig;
  } catch (error) {
    console.error('Failed to load config.json, using fallback configuration:', error);
    // Fallback configuration if config.json is not available
    return {
      mcp: {
        servers: {
          'sequential-thinking': {
            command: "npx",
            args: ["-y", "@modelcontextprotocol/server-sequential-thinking"]
          },
          'conscious-memory': {
            command: 'npx',
            args: ['tsx', './src/lib/mcp-servers/conscious-memory-server.ts']
          }
        }
      }
    };
  }
}

export const mcpConfig: MCPConfig = loadMCPConfig();

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
    args: mcpConfig.mcp.servers[serverName].args,
    env: mcpConfig.mcp.servers[serverName].env || {}
  }));
}