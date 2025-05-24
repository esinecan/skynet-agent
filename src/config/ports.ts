/**
 * Centralized port configuration for Skynet Agent
 * Prevents port conflicts and ensures consistency across all services
 */

export const PORTS = {
  // Main application
  API_SERVER: 3000,
  MCP_SERVER: 8081,
  
  // Docker services
  MILVUS: 19530,
  MILVUS_WEB: 9091,
  MINIO_API: 9000,
  MINIO_CONSOLE: 9001,
  ETCD: 2379,
  
  // Development
  CLIENT_DEV: 9001, // Vite dev server
} as const;

export const API_PREFIX = '/api' as const;

export default PORTS;
