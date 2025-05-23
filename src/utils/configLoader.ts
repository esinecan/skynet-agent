import * as fs from 'node:fs';
import * as path from 'node:path';
import { createLogger } from './logger';

const logger = createLogger('configLoader');

export interface McpServerConfig {
  name: string;
  transport: "stdio" | "http";
  command?: string;
  args?: string[];
  url?: string;
}

// Cache for configurations
let cachedConfigs: McpServerConfig[] | null = null;

/**
 * Load MCP server configurations from various sources
 * Priority: 
 * 1. Environment variables (SKYNET_MCP_SERVERS_JSON)
 * 2. Config file (config.json)
 * 3. VS Code settings (if available)
 * 4. Default configurations
 */
export function loadMcpServerConfigs(forceReload = false): McpServerConfig[] {
  // Return cached config if available and not forcing reload
  if (cachedConfigs && !forceReload) {
    return cachedConfigs;
  }
  
  try {
    // 1. Try environment variables first
    const envConfig = process.env.SKYNET_MCP_SERVERS_JSON;
    if (envConfig) {
      try {
        const configs = JSON.parse(envConfig);
        logger.info('Loaded MCP server configs from environment variable', { 
          count: Object.keys(configs).length 
        });
        cachedConfigs = convertConfigFormat(configs);
        return cachedConfigs;
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        logger.error('Failed to parse MCP server configs from environment variable', err);
      }
    }

    // 2. Try config file
    const configPath = path.resolve(process.cwd(), 'config.json');
    if (fs.existsSync(configPath)) {
      try {
        const configData = fs.readFileSync(configPath, 'utf8');
        const config = JSON.parse(configData);
        
        if (config.mcp?.servers) {
          logger.info('Loaded MCP server configs from config.json', { 
            count: Object.keys(config.mcp.servers).length 
          });
          cachedConfigs = convertConfigFormat(config.mcp.servers);
          return cachedConfigs;
        }
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        logger.error('Failed to load MCP server configs from config.json', err);
      }
    }

    // 3. Try VS Code settings in the user's home directory
    const homeDir = process.env.HOME || process.env.USERPROFILE;
    const vsCodeSettingsPath = path.join(homeDir || '', '.vscode', 'settings.json');
    
    if (homeDir && fs.existsSync(vsCodeSettingsPath)) {
      try {
        const settingsData = fs.readFileSync(vsCodeSettingsPath, 'utf8');
        const settings = JSON.parse(settingsData);
        
        if (settings.mcp?.servers) {
          logger.info('Loaded MCP server configs from VS Code settings', { 
            count: Object.keys(settings.mcp.servers).length 
          });
          cachedConfigs = convertConfigFormat(settings.mcp.servers);
          return cachedConfigs;
        }
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        logger.error('Failed to load MCP server configs from VS Code settings', err);
      }
    }

    // 4. Default configurations
    logger.info('Using default MCP server configurations');
    cachedConfigs = getDefaultConfigs();
    return cachedConfigs;
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    logger.error('Error loading MCP server configurations', err);
    cachedConfigs = getDefaultConfigs();
    return cachedConfigs;
  }
}

/**
 * Force reload of MCP server configurations
 * Useful for dynamic configuration changes without restarting
 */
export function reloadMcpServerConfigs(): McpServerConfig[] {
  logger.info('Forcibly reloading MCP server configurations');
  return loadMcpServerConfigs(true);
}

/**
 * Convert from the object format to array format
 */
function convertConfigFormat(configObj: Record<string, { command?: string; args?: string[]; url?: string }>): McpServerConfig[] {
  return Object.entries(configObj).map(([name, config]) => ({
    name,
    transport: config.url ? "http" : "stdio",
    command: config.command,
    args: config.args,
    url: config.url
  }));
}

/**
 * Get default MCP server configurations
 */
function getDefaultConfigs(): McpServerConfig[] {
  return [
    {
      name: "playwright",
      transport: "stdio",
      command: "npx",
      args: ["@playwright/mcp@latest"]
    }
  ];
}
