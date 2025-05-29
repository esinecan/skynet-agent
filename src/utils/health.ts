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
  details?: Record<string, unknown>;
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
  details?: Record<string, unknown>
): void {
  const updateTime = Date.now();
  const healthId = Math.random().toString(36).substring(7);
  
  logger.debug('Component health update started', {
    healthId,
    component,
    newStatus: status,
    previousStatus: healthState.components[component]?.status,
    message,
    hasDetails: !!details
  });

  const previousStatus = healthState.components[component]?.status;
  const healthData = {
    status,
    message,
    lastChecked: new Date(),
    details
  };

  healthState.components[component] = healthData;
  
  logger.debug('Component health data updated', {
    healthId,
    component,
    statusChanged: previousStatus !== status,
    updateTimeMs: Date.now() - updateTime
  });
  
  // Send to Sentry
  Sentry.setTag(`component.${component}.status`, status);
  Sentry.addBreadcrumb({
    message: `Component health updated: ${component}`,
    category: 'health',
    level: status === HealthStatus.HEALTHY ? 'info' : 'warning',
    data: { status, message, details, healthId }
  });

  // Log critical status changes
  if (status === HealthStatus.UNHEALTHY) {
    logger.error(`Component ${component} is unhealthy`, {
      healthId,
      component,
      message,
      details,
      previousStatus
    });
    Sentry.captureMessage(`Component ${component} is unhealthy: ${message}`, 'warning');
  }

  // Recalculate overall health
  const recalcStartTime = Date.now();
  const previousOverallStatus = healthState.overall;
  calculateOverallHealth();
  const recalcTime = Date.now() - recalcStartTime;
  
  logger.debug('Overall health recalculated', {
    healthId,
    component,
    previousOverallStatus,
    newOverallStatus: healthState.overall,
    overallStatusChanged: previousOverallStatus !== healthState.overall,
    recalcTimeMs: recalcTime
  });
  
  // Log significant health changes
  if (status === HealthStatus.DEGRADED || status === HealthStatus.UNHEALTHY) {
    logger.warn(`Component ${component} health changed to ${status}: ${message}`, {
      healthId,
      component,
      status,
      message,
      details,
      overallStatus: healthState.overall
    });
  } else {
    logger.debug('Component health status logged', {
      healthId,
      component,
      status,
      message,
      details
    });
  }
  
  const totalUpdateTime = Date.now() - updateTime;
  logger.debug('Component health update completed', {
    healthId,
    component,
    totalUpdateTimeMs: totalUpdateTime,
    finalStatus: status,
    finalOverallStatus: healthState.overall
  });
}

/**
 * Calculate the overall system health based on component statuses
 */
function calculateOverallHealth(): void {
  const startTime = Date.now();
  const components = Object.values(healthState.components);
  const componentCount = components.length;
  
  logger.debug('Overall health calculation started', {
    componentCount,
    componentStatuses: components.map(c => c.status),
    currentOverallStatus: healthState.overall
  });
  
  if (components.length === 0) {
    healthState.overall = HealthStatus.STARTING;
    logger.debug('Overall health set to STARTING - no components', {
      calculationTimeMs: Date.now() - startTime
    });
    return;
  }
  
  const statusCounts = {
    [HealthStatus.UNHEALTHY]: components.filter(c => c.status === HealthStatus.UNHEALTHY).length,
    [HealthStatus.DEGRADED]: components.filter(c => c.status === HealthStatus.DEGRADED).length,
    [HealthStatus.HEALTHY]: components.filter(c => c.status === HealthStatus.HEALTHY).length,
    [HealthStatus.BUSY]: components.filter(c => c.status === HealthStatus.BUSY).length,
    [HealthStatus.STARTING]: components.filter(c => c.status === HealthStatus.STARTING).length
  };
  
  const previousStatus = healthState.overall;
  
  if (statusCounts[HealthStatus.UNHEALTHY] > 0) {
    healthState.overall = HealthStatus.UNHEALTHY;
  } else if (statusCounts[HealthStatus.DEGRADED] > 0) {
    healthState.overall = HealthStatus.DEGRADED;
  } else if (statusCounts[HealthStatus.STARTING] > 0) {
    healthState.overall = HealthStatus.STARTING;
  } else {
    healthState.overall = HealthStatus.HEALTHY;
  }
  
  const calculationTime = Date.now() - startTime;
  
  logger.debug('Overall health calculation completed', {
    previousStatus,
    newStatus: healthState.overall,
    statusChanged: previousStatus !== healthState.overall,
    statusCounts,
    calculationTimeMs: calculationTime
  });
}

/**
 * Increment a metric counter
 * @param metric Metric name
 */
export function incrementMetric(metric: keyof SystemMetrics): void {
  const metricId = Math.random().toString(36).substring(7);
  
  logger.debug('Metric increment started', {
    metricId,
    metric,
    currentValue: typeof healthState.metrics[metric] === 'number' ? healthState.metrics[metric] : 'N/A'
  });

  Sentry.addBreadcrumb({
    message: `Incrementing metric: ${metric}`,
    category: 'metrics',
    level: 'debug',
    data: { metricId, metric }
  });

  if (typeof healthState.metrics[metric] === 'number') {
    (healthState.metrics[metric] as number)++;
    
    logger.debug('Metric incremented successfully', {
      metricId,
      metric,
      newValue: healthState.metrics[metric]
    });
  } else {
    logger.warn('Attempted to increment non-numeric metric', {
      metricId,
      metric,
      currentType: typeof healthState.metrics[metric],
      currentValue: healthState.metrics[metric]
    });
  }
}

/**
 * Record an error occurrence
 * @param errorType Error type or code
 */
export function recordError(errorType: string): void {
  const errorId = Math.random().toString(36).substring(7);
  const previousCount = healthState.metrics.errors[errorType] || 0;
  
  logger.debug('Error recording started', {
    errorId,
    errorType,
    previousCount
  });

  healthState.metrics.errors[errorType] = previousCount + 1;
  
  logger.debug('Error recorded', {
    errorId,
    errorType,
    newCount: healthState.metrics.errors[errorType],
    totalErrorTypes: Object.keys(healthState.metrics.errors).length
  });
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
      return 'System is busy processing tasks';    case HealthStatus.DEGRADED: {
      const degraded = Object.entries(healthState.components)
        .filter(([_, c]) => c.status === HealthStatus.DEGRADED)
        .map(([name, _]) => name);
      return `System is degraded. Affected components: ${degraded.join(', ')}`;
    }
    case HealthStatus.UNHEALTHY: {
      const unhealthy = Object.entries(healthState.components)
        .filter(([_, c]) => c.status === HealthStatus.UNHEALTHY)
        .map(([name, _]) => name);
      return `System is unhealthy. Affected components: ${unhealthy.join(', ')}`;
    }
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
    /*checkMilvusHealth().catch(error => {
      logger.error('Milvus health check failed', error);
    });*/
    
    // Log periodic health status
    logger.debug('Health status update', {
      status: healthState.overall,
      uptime: healthState.metrics.uptime,      memory: {
        rss: `${Math.round(healthState.metrics.memoryUsage.rss / 1024 / 1024)}MB`,
        heapUsed: `${Math.round(healthState.metrics.memoryUsage.heapUsed / 1024 / 1024)}MB`
      },
      components: Object.keys(healthState.components).length
    });
  }, 60000); // Check every minute
  
  logger.info('Health monitoring initialized');
}


/**
 * Perform health check on memory system
 */
export async function checkMemoryHealth(): Promise<void> {
  try {
    // Import here to avoid circular dependencies
    const { memoryManager } = await import('../memory/index.js');
    
    const isHealthy = await memoryManager.healthCheck();
    const memoryCount = await memoryManager.getMemoryCount();
    
    if (isHealthy) {
      updateComponentHealth('memory', HealthStatus.HEALTHY, 'Memory system active', {
        memoryCount,
        lastCheck: new Date().toISOString()
      });
    } else {
      updateComponentHealth('memory', HealthStatus.UNHEALTHY, 'Memory system connection failed', {
        lastCheck: new Date().toISOString()
      });
    }
  } catch (error) {
    updateComponentHealth('memory', HealthStatus.UNHEALTHY, 'Memory health check error', {
      error: error instanceof Error ? error.message : String(error),
      lastCheck: new Date().toISOString()
    });
  }
}