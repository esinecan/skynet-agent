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
  const startTime = Date.now();
  const loadId = Math.random().toString(36).substring(7);
  
  logger.debug('MCP configuration loading started', {
    loadId,
    forceReload,
    hasCachedConfig: !!cachedConfigs
  });

  // Return cached config if available and not forcing reload
  if (cachedConfigs && !forceReload) {
    logger.debug('Returning cached MCP configuration', {
      loadId,
      configCount: cachedConfigs.length,
      loadTimeMs: Date.now() - startTime
    });
    return cachedConfigs;
  }
  
  try {
    // 1. Try environment variables first
    const envConfig = process.env.SKYNET_MCP_SERVERS_JSON;
    if (envConfig) {
      logger.debug('Found MCP config in environment variable', {
        loadId,
        configLength: envConfig.length
      });
      
      try {
        const configs = JSON.parse(envConfig);
        const configCount = Object.keys(configs).length;
        const loadTime = Date.now() - startTime;
        
        logger.info('Loaded MCP server configs from environment variable', { 
          count: configCount,
          loadTimeMs: loadTime
        });
        logger.debug('Environment config parsing completed', {
          loadId,
          configCount,
          configKeys: Object.keys(configs),
          parseTimeMs: loadTime
        });
        
        cachedConfigs = convertConfigFormat(configs);
        return cachedConfigs;
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        logger.error('Failed to parse MCP server configs from environment variable', {
          loadId,
          error: err.message,
          configLength: envConfig.length
        });
      }
    } else {
      logger.debug('No MCP config found in environment variables', { loadId });
    }

    // 2. Try config file
    const configPath = path.resolve(process.cwd(), 'config.json');
    logger.debug('Checking for config file', {
      loadId,
      configPath,
      exists: fs.existsSync(configPath)
    });    if (fs.existsSync(configPath)) {
      logger.debug('Config file found, reading contents', {
        loadId,
        configPath
      });
      
      try {
        const fileReadStart = Date.now();
        const configData = fs.readFileSync(configPath, 'utf8');
        const fileReadTime = Date.now() - fileReadStart;
        
        logger.debug('Config file read completed', {
          loadId,
          fileSize: configData.length,
          readTimeMs: fileReadTime
        });
        
        const parseStart = Date.now();
        const config = JSON.parse(configData);
        const parseTime = Date.now() - parseStart;
        
        logger.debug('Config file parsed successfully', {
          loadId,
          parseTimeMs: parseTime,
          hasMcpSection: !!config.mcp,
          hasServers: !!(config.mcp?.servers)
        });
        
        if (config.mcp?.servers) {
          // Check if servers is an array or object
          if (Array.isArray(config.mcp.servers)) {
            logger.debug('Found array-format MCP servers config', {
              loadId,
              serverCount: config.mcp.servers.length
            });
            
            // Add explicit type for server parameter to fix the implicit 'any' error
            cachedConfigs = config.mcp.servers.map((server: {
              name?: string;
              config?: {
                command?: string;
                args?: string[];
                url?: string;
              };
            }) => ({
              name: server.name || 'unnamed',
              transport: server.config?.url ? "http" : "stdio",
              command: server.config?.command,
              args: server.config?.args,
              url: server.config?.url
            }));
            
            const loadTime = Date.now() - startTime;
            logger.debug('Array-format config conversion completed', {
              loadId,
              configCount: cachedConfigs?.length || 0,
              totalLoadTimeMs: loadTime
            });
            
            // Initialize to empty array if null to fix null assignment error
            return cachedConfigs || [];
          }
          
          // Object format - convert keys to names
          logger.debug('Found object-format MCP servers config', {
            loadId,
            serverCount: Object.keys(config.mcp.servers).length,
            serverNames: Object.keys(config.mcp.servers)
          });
          
          cachedConfigs = convertConfigFormat(config.mcp.servers);
          const loadTime = Date.now() - startTime;
          
          logger.debug('Object-format config conversion completed', {
            loadId,
            configCount: cachedConfigs.length,
            totalLoadTimeMs: loadTime
          });
          
          return cachedConfigs;
        }
        
        logger.debug('No MCP servers section found in config file', { loadId });
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        logger.error('Failed to load MCP server configs from config.json', {
          loadId,
          error: err.message,
          configPath
        });
      }
    } else {
      logger.debug('Config file does not exist', {
        loadId,
        configPath
      });
    }    // 3. Try VS Code settings in the user's home directory
    const homeDir = process.env.HOME || process.env.USERPROFILE;
    const vsCodeSettingsPath = path.join(homeDir || '', '.vscode', 'settings.json');
    
    logger.debug('Checking VS Code settings', {
      loadId,
      homeDir,
      vsCodeSettingsPath,
      exists: homeDir && fs.existsSync(vsCodeSettingsPath)
    });
    
    if (homeDir && fs.existsSync(vsCodeSettingsPath)) {
      try {
        const settingsReadStart = Date.now();
        const settingsData = fs.readFileSync(vsCodeSettingsPath, 'utf8');
        const settingsReadTime = Date.now() - settingsReadStart;
        
        logger.debug('VS Code settings file read', {
          loadId,
          fileSize: settingsData.length,
          readTimeMs: settingsReadTime
        });
        
        const settings = JSON.parse(settingsData);
        
        if (settings.mcp?.servers) {
          const serverCount = Object.keys(settings.mcp.servers).length;
          const loadTime = Date.now() - startTime;
          
          logger.info('Loaded MCP server configs from VS Code settings', { 
            count: serverCount,
            loadTimeMs: loadTime
          });
          logger.debug('VS Code settings config processing', {
            loadId,
            serverCount,
            serverNames: Object.keys(settings.mcp.servers),
            totalLoadTimeMs: loadTime
          });
          
          cachedConfigs = convertConfigFormat(settings.mcp.servers);
          return cachedConfigs;
        }
        
        logger.debug('No MCP servers found in VS Code settings', { loadId });
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        logger.error('Failed to load MCP server configs from VS Code settings', {
          loadId,
          error: err.message,
          vsCodeSettingsPath
        });
      }
    } else {
      logger.debug('VS Code settings not available', {
        loadId,
        homeDir: !!homeDir,
        settingsPath: vsCodeSettingsPath
      });
    }

    // 4. Default configurations
    const loadTime = Date.now() - startTime;
    logger.info('Using default MCP server configurations');
    logger.debug('Falling back to default configuration', {
      loadId,
      fallbackTimeMs: loadTime,
      reason: 'No configurations found in environment, config file, or VS Code settings'
    });
    
    cachedConfigs = getDefaultConfigs();
    
    logger.debug('Default configuration loaded', {
      loadId,
      defaultConfigCount: cachedConfigs.length,
      totalLoadTimeMs: Date.now() - startTime
    });
    
    return cachedConfigs;
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    const loadTime = Date.now() - startTime;
    
    logger.error('Error loading MCP server configurations', {
      loadId,
      error: err.message,
      loadTimeMs: loadTime,
      stack: err.stack
    });
    
    cachedConfigs = getDefaultConfigs();
    
    logger.debug('Error fallback to default configuration', {
      loadId,
      defaultConfigCount: cachedConfigs.length,
      errorFallbackTimeMs: Date.now() - startTime
    });
    
    return cachedConfigs;
  }
}

/**
 * Force reload of MCP server configurations
 * Useful for dynamic configuration changes without restarting
 */
export function reloadMcpServerConfigs(): McpServerConfig[] {
  const reloadId = Math.random().toString(36).substring(7);
  const startTime = Date.now();
  
  logger.info('Forcibly reloading MCP server configurations');
  logger.debug('Configuration reload initiated', {
    reloadId,
    previousConfigCount: cachedConfigs?.length || 0
  });
  
  const result = loadMcpServerConfigs(true);
  const reloadTime = Date.now() - startTime;
  
  logger.debug('Configuration reload completed', {
    reloadId,
    newConfigCount: result.length,
    reloadTimeMs: reloadTime,
    configChanged: result.length !== (cachedConfigs?.length || 0)
  });
  
  return result;
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
