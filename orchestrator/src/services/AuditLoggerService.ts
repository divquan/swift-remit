import axios from 'axios';
import { AuditLogData } from '@/types';
import { CONFIG } from '@/config';

export class AuditLoggerService {
  private baseURL: string;
  private timeout: number;

  constructor() {
    this.baseURL = CONFIG.AUDIT_LOGGER_URL;
    this.timeout = 5000; // 5 second timeout for audit logs
  }

  /**
   * Send audit log to audit logger service
   */
  async log(data: AuditLogData): Promise<void> {
    try {
      await axios.post(
        `${this.baseURL}/api/audit/log`,
        {
          ...data,
          timestamp: new Date().toISOString(),
          service: 'orchestrator',
        },
        {
          timeout: this.timeout,
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );
    } catch (error) {
      // Don't throw on audit log failure - log locally instead
      console.error('Failed to send audit log:', error);
      this.logLocally(data);
    }
  }

  /**
   * Log multiple audit events in batch
   */
  async logBatch(logs: AuditLogData[]): Promise<void> {
    try {
      await axios.post(
        `${this.baseURL}/api/audit/batch`,
        {
          logs: logs.map(log => ({
            ...log,
            timestamp: new Date().toISOString(),
            service: 'orchestrator',
          })),
        },
        {
          timeout: this.timeout,
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );
    } catch (error) {
      // Don't throw on audit log failure - log locally instead
      console.error('Failed to send batch audit logs:', error);
      logs.forEach(log => this.logLocally(log));
    }
  }

  /**
   * Fallback: log to console/local storage when audit service is unavailable
   */
  private logLocally(data: AuditLogData): void {
    const logEntry = {
      ...data,
      timestamp: new Date().toISOString(),
      service: 'orchestrator',
      level: 'AUDIT',
    };

    console.log('AUDIT_LOG:', JSON.stringify(logEntry));
    
    // TODO: Could also write to local file or database for persistence
  }

  /**
   * Health check for audit logger service
   */
  async healthCheck(): Promise<boolean> {
    try {
      const response = await axios.get(`${this.baseURL}/health`, {
        timeout: 3000,
      });
      
      return response.status === 200;
    } catch (error) {
      console.error('Audit logger health check failed:', error);
      return false;
    }
  }
}
