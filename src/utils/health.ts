/**
 * Health monitoring and metrics utility for the Skynet Agent
 * Provides system health checks, performance metrics, and status reporting
 */

import * as Sentry from "@sentry/node";
import { createLogger } from './logger';

const logger = createLogger('health');

// Health status types
export enum HealthStatus {
  STARTING = 'STARTING',
  HEALTHY = 'HEALTHY',
  DEGRADED = 'DEGRADED',
  UNHEALTHY = 'UNHEALTHY',
  BUSY = 'BUSY'  // Added BUSY state for components actively processing tasks
}

// Component health information
interface ComponentHealth {
  status: HealthStatus;
  message: string;
  lastChecked: Date;
  details?: Record<string, any>;
}

// System metrics
interface SystemMetrics {
  startTime: Date;
  uptime: number; // in seconds
  memoryUsage: NodeJS.MemoryUsage;
  requestsProcessed: number;
  llmCallsMade: number;
  toolCallsMade: number;
  memoriesStored: number;
  memoriesRetrieved: number;
  errors: Record<string, number>; // error counts by type
}

// Global health state
const healthState: {
  overall: HealthStatus;
  components: Record<string, ComponentHealth>;
  metrics: SystemMetrics;
} = {
  overall: HealthStatus.STARTING,
  components: {},
  metrics: {
    startTime: new Date(),
    uptime: 0,
    memoryUsage: process.memoryUsage(),
    requestsProcessed: 0,
    llmCallsMade: 0,
    toolCallsMade: 0,
    memoriesStored: 0,
    memoriesRetrieved: 0,
    errors: {}
  }
};

/**
 * Update the health status of a component
 * @param component Component name
 * @param status Health status
 * @param message Status message
 * @param details Additional details (optional)
 */
export function updateComponentHealth(
  component: string,
  status: HealthStatus,
  message: string,
  details?: Record<string, any>
): void {
  const healthData = {
    status,
    message,
    lastChecked: new Date(),
    details
  };

  healthState.components[component] = healthData;
  
  // Send to Sentry
  Sentry.setTag(`component.${component}.status`, status);
  Sentry.addBreadcrumb({
    message: `Component health updated: ${component}`,
    category: 'health',
    level: status === HealthStatus.HEALTHY ? 'info' : 'warning',
    data: { status, message, details }
  });

  // Log critical status changes
  if (status === HealthStatus.UNHEALTHY) {
    Sentry.captureMessage(`Component ${component} is unhealthy: ${message}`, 'warning');
  }

  // Recalculate overall health
  calculateOverallHealth();
  
  // Log significant health changes
  if (status === HealthStatus.DEGRADED || status === HealthStatus.UNHEALTHY) {
    logger.warn(`Component ${component} health changed to ${status}: ${message}`, details);
  } else {
    logger.info(`Component ${component} health: ${status}`, details);
  }
}

/**
 * Calculate the overall system health based on component statuses
 */
function calculateOverallHealth(): void {
  const components = Object.values(healthState.components);
  
  if (components.length === 0) {
    healthState.overall = HealthStatus.STARTING;
    return;
  }
  
  if (components.some(c => c.status === HealthStatus.UNHEALTHY)) {
    healthState.overall = HealthStatus.UNHEALTHY;
  } else if (components.some(c => c.status === HealthStatus.DEGRADED)) {
    healthState.overall = HealthStatus.DEGRADED;
  } else {
    healthState.overall = HealthStatus.HEALTHY;
  }
}

/**
 * Increment a metric counter
 * @param metric Metric name
 */
export function incrementMetric(metric: keyof SystemMetrics): void {
  Sentry.addBreadcrumb({
    message: `Incrementing metric: ${metric}`,
    category: 'metrics',
    level: 'debug'
  });

  healthState.metrics[metric]++;
}

/**
 * Record an error occurrence
 * @param errorType Error type or code
 */
export function recordError(errorType: string): void {
  healthState.metrics.errors[errorType] = (healthState.metrics.errors[errorType] || 0) + 1;
}

/**
 * Update system metrics
 */
export function updateMetrics(): void {
  healthState.metrics.uptime = (Date.now() - healthState.metrics.startTime.getTime()) / 1000;
  healthState.metrics.memoryUsage = process.memoryUsage();
}

/**
 * Perform health check on Milvus memory system
 */
export async function checkMilvusHealth(): Promise<void> {
  try {
    // Import here to avoid circular dependencies
    const { memoryManager } = await import('../memory/index.js');
    
    const isHealthy = await memoryManager.healthCheck();
    const memoryCount = await memoryManager.getMemoryCount();
    
    if (isHealthy) {
      updateComponentHealth('milvus', HealthStatus.HEALTHY, 'Milvus connection active', {
        memoryCount,
        lastCheck: new Date().toISOString()
      });
    } else {
      updateComponentHealth('milvus', HealthStatus.UNHEALTHY, 'Milvus connection failed', {
        lastCheck: new Date().toISOString()
      });
    }
  } catch (error) {
    updateComponentHealth('milvus', HealthStatus.UNHEALTHY, 'Milvus health check error', {
      error: error instanceof Error ? error.message : String(error),
      lastCheck: new Date().toISOString()
    });
  }
}

/**
 * Get the complete health report
 * @returns Health report object
 */
export function getHealthReport(): {
  status: HealthStatus;
  components: Record<string, ComponentHealth>;
  metrics: SystemMetrics;
} {
  updateMetrics();
  return {
    status: healthState.overall,
    components: healthState.components,
    metrics: healthState.metrics
  };
}

/**
 * Get a simplified health status for quick checks
 * @returns Simple health status object
 */
export function getHealthStatus(): {
  status: HealthStatus;
  uptime: number;
  message: string;
} {
  updateMetrics();
  return {
    status: healthState.overall,
    uptime: healthState.metrics.uptime,
    message: getStatusMessage()
  };
}

/**
 * Generate a status message based on current health
 * @returns Status message
 */
function getStatusMessage(): string {
  switch (healthState.overall) {
    case HealthStatus.STARTING:
      return 'System is starting up';
    case HealthStatus.HEALTHY:
      return 'All systems operational';
    case HealthStatus.BUSY:
      return 'System is busy processing tasks';
    case HealthStatus.DEGRADED:
      const degraded = Object.entries(healthState.components)
        .filter(([_, c]) => c.status === HealthStatus.DEGRADED)
        .map(([name, _]) => name);
      return `System is degraded. Affected components: ${degraded.join(', ')}`;
    case HealthStatus.UNHEALTHY:
      const unhealthy = Object.entries(healthState.components)
        .filter(([_, c]) => c.status === HealthStatus.UNHEALTHY)
        .map(([name, _]) => name);
      return `System is unhealthy. Affected components: ${unhealthy.join(', ')}`;
    default:
      return 'Unknown system status';
  }
}

// Initialize health monitoring
export function initializeHealthMonitoring(): void {
  // Set initial component statuses
  updateComponentHealth('system', HealthStatus.STARTING, 'System is initializing');
  
  // Schedule periodic health checks
  setInterval(() => {
    updateMetrics();
    
    // Check Milvus health every minute
    checkMilvusHealth().catch(error => {
      logger.error('Milvus health check failed', error);
    });
    
    // Log periodic health status
    logger.debug('Health status update', {
      status: healthState.overall,
      uptime: healthState.metrics.uptime,
      memory: {
        rss: Math.round(healthState.metrics.memoryUsage.rss / 1024 / 1024) + 'MB',
        heapUsed: Math.round(healthState.metrics.memoryUsage.heapUsed / 1024 / 1024) + 'MB'
      },
      components: Object.keys(healthState.components).length
    });
  }, 60000); // Check every minute
  
  logger.info('Health monitoring initialized');
}
