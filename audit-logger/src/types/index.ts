export interface AuditLogData {
  userId?: string;
  remittanceId?: string;
  action: string;
  resource: string;
  details: Record<string, any>;
  ipAddress?: string;
  userAgent?: string;
  service?: string;
  level?: string;
}

export interface AuditLogBatch {
  logs: AuditLogData[];
}

export interface AuditLogFilter {
  userId?: string;
  remittanceId?: string;
  action?: string;
  resource?: string;
  service?: string;
  level?: string;
  startDate?: Date;
  endDate?: Date;
  limit?: number;
  offset?: number;
}

export interface AuditLogResponse {
  success: boolean;
  data?: any;
  error?: string;
  total?: number;
}
