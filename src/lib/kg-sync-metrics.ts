interface SyncMetrics {
  startTime: Date;
  endTime?: Date;
  entitiesProcessed: number;
  relationshipsProcessed: number;
  errors: Array<{ message: string; timestamp: Date }>;
  status: 'running' | 'completed' | 'failed';
}

export class SyncMetricsCollector {
  private metrics: SyncMetrics;
  
  constructor() {
    this.metrics = {
      startTime: new Date(),
      entitiesProcessed: 0,
      relationshipsProcessed: 0,
      errors: [],
      status: 'running'
    };
  }
  
  recordEntity() { 
    this.metrics.entitiesProcessed++; 
  }
  
  recordRelationship() { 
    this.metrics.relationshipsProcessed++; 
  }
  
  recordError(error: Error) {
    this.metrics.errors.push({
      message: error.message,
      timestamp: new Date()
    });
  }
  
  complete(status: 'completed' | 'failed') {
    this.metrics.status = status;
    this.metrics.endTime = new Date();
    return this.metrics;
  }
  
  getMetrics() {
    return this.metrics;
  }
}
