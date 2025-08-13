import { db } from '@/config/database';
import { AuditLogData, AuditLogFilter } from '@/types';
import { CONFIG } from '@/config';

export class AuditLogService {
  private batchQueue: AuditLogData[] = [];
  private batchTimer: NodeJS.Timeout | null = null;

  /**
   * Log a single audit event
   */
  async logEvent(data: AuditLogData): Promise<void> {
    try {
      await db.audit_logs.create({
        data: {
          userId: data.userId || null,
          remittanceId: data.remittanceId || null,
          action: data.action,
          resource: data.resource,
          details: data.details,
          ipAddress: data.ipAddress || null,
          userAgent: data.userAgent || null,
          service: data.service || null,
          level: data.level || 'INFO',
          timestamp: new Date(),
        },
      });
    } catch (error) {
      console.error('Failed to log audit event:', error);
      throw error;
    }
  }

  /**
   * Log multiple audit events in batch
   */
  async logBatch(logs: AuditLogData[]): Promise<void> {
    try {
      const auditData = logs.map(log => ({
        userId: log.userId || null,
        remittanceId: log.remittanceId || null,
        action: log.action,
        resource: log.resource,
        details: log.details,
        ipAddress: log.ipAddress || null,
        userAgent: log.userAgent || null,
        service: log.service || null,
        level: log.level || 'INFO',
        timestamp: new Date(),
      }));

      await db.audit_logs.createMany({
        data: auditData,
      });
    } catch (error) {
      console.error('Failed to log batch audit events:', error);
      throw error;
    }
  }

  /**
   * Add event to batch queue for efficient processing
   */
  queueEvent(data: AuditLogData): void {
    this.batchQueue.push(data);

    // Process batch if it reaches the configured size
    if (this.batchQueue.length >= CONFIG.BATCH_SIZE) {
      this.processBatch();
    }

    // Set timer to process batch after timeout if not already set
    if (!this.batchTimer) {
      this.batchTimer = setTimeout(() => {
        this.processBatch();
      }, CONFIG.BATCH_TIMEOUT_MS);
    }
  }

  /**
   * Process queued events in batch
   */
  private async processBatch(): Promise<void> {
    if (this.batchQueue.length === 0) return;

    const batch = [...this.batchQueue];
    this.batchQueue = [];

    if (this.batchTimer) {
      clearTimeout(this.batchTimer);
      this.batchTimer = null;
    }

    try {
      await this.logBatch(batch);
      console.log(`Processed batch of ${batch.length} audit logs`);
    } catch (error) {
      console.error('Failed to process audit log batch:', error);
      // Re-queue failed logs (with a limit to prevent infinite loops)
      if (batch.length < CONFIG.BATCH_SIZE * 2) {
        this.batchQueue.unshift(...batch);
      }
    }
  }

  /**
   * Search and filter audit logs
   */
  async searchLogs(filter: AuditLogFilter) {
    const where: any = {};

    if (filter.userId) where.userId = filter.userId;
    if (filter.remittanceId) where.remittanceId = filter.remittanceId;
    if (filter.action) where.action = { contains: filter.action, mode: 'insensitive' };
    if (filter.resource) where.resource = filter.resource;
    if (filter.service) where.service = filter.service;
    if (filter.level) where.level = filter.level;

    if (filter.startDate || filter.endDate) {
      where.timestamp = {};
      if (filter.startDate) where.timestamp.gte = filter.startDate;
      if (filter.endDate) where.timestamp.lte = filter.endDate;
    }

    const [logs, total] = await Promise.all([
      db.audit_logs.findMany({
        where,
        orderBy: { timestamp: 'desc' },
        skip: filter.offset || 0,
        take: filter.limit || 100,
      }),
      db.audit_logs.count({ where }),
    ]);

    return { logs, total };
  }

  /**
   * Get audit logs for a specific remittance
   */
  async getRemittanceLogs(remittanceId: string) {
    return db.audit_logs.findMany({
      where: { remittanceId },
      orderBy: { timestamp: 'asc' },
    });
  }

  /**
   * Get audit logs for a specific user
   */
  async getUserLogs(userId: string, limit = 100, offset = 0) {
    const [logs, total] = await Promise.all([
      db.audit_logs.findMany({
        where: { userId },
        orderBy: { timestamp: 'desc' },
        skip: offset,
        take: limit,
      }),
      db.audit_logs.count({ where: { userId } }),
    ]);

    return { logs, total };
  }

  /**
   * Clean up old audit logs based on retention policy
   */
  async cleanupOldLogs(): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - CONFIG.LOG_RETENTION_DAYS);

    const result = await db.audit_logs.deleteMany({
      where: {
        createdAt: {
          lt: cutoffDate,
        },
      },
    });

    console.log(`Cleaned up ${result.count} old audit logs`);
    return result.count;
  }

  /**
   * Get audit log statistics
   */
  async getStats(startDate?: Date, endDate?: Date) {
    const where: any = {};
    
    if (startDate || endDate) {
      where.timestamp = {};
      if (startDate) where.timestamp.gte = startDate;
      if (endDate) where.timestamp.lte = endDate;
    }

    const [
      total,
      byAction,
      byResource,
      byService,
      byLevel,
    ] = await Promise.all([
      db.audit_logs.count({ where }),
      db.audit_logs.groupBy({
        by: ['action'],
        where,
        _count: { action: true },
      }),
      db.audit_logs.groupBy({
        by: ['resource'],
        where,
        _count: { resource: true },
      }),
      db.audit_logs.groupBy({
        by: ['service'],
        where,
        _count: { service: true },
      }),
      db.audit_logs.groupBy({
        by: ['level'],
        where,
        _count: { level: true },
      }),
    ]);

    return {
      total,
      byAction,
      byResource,
      byService,
      byLevel,
    };
  }

  /**
   * Graceful shutdown - process remaining queued events
   */
  async shutdown(): Promise<void> {
    if (this.batchTimer) {
      clearTimeout(this.batchTimer);
      this.batchTimer = null;
    }

    if (this.batchQueue.length > 0) {
      console.log(`Processing final batch of ${this.batchQueue.length} audit logs`);
      await this.processBatch();
    }
  }
}
