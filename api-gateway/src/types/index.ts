export interface ApiResponse<T = any> {
  success: boolean;
  message: string;
  data?: T;
  error?: string;
  timestamp: string;
  requestId: string;
}

export interface AuthTokenPayload {
  userId: string;
  email: string;
  iat: number;
  exp: number;
}

export interface CreateUserRequest {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  phoneNumber?: string;
  countryCode?: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface CreateAccountRequest {
  accountType: 'PERSONAL' | 'BUSINESS' | 'MERCHANT';
  currency: string;
}

export interface SendRemittanceRequest {
  receiverDetails: {
    email?: string;
    phoneNumber?: string;
    firstName: string;
    lastName: string;
    accountNumber?: string;
    bankCode?: string;
    country: string;
  };
  amount: number;
  currency: string;
  convertedCurrency?: string;
  paymentProvider?: string;
  metadata?: Record<string, any>;
}

export interface RefundRequest {
  remittanceId: string;
  reason: string;
  amount?: number; // For partial refunds
}

export interface ReverseRequest {
  remittanceId: string;
  reason: string;
}

export interface WebhookPayload {
  provider: string;
  event: string;
  data: Record<string, any>;
  signature: string;
  timestamp: string;
}

export interface QueueJob {
  id: string;
  type: 'REMITTANCE' | 'REFUND' | 'REVERSE' | 'WEBHOOK_PROCESSING' | 'FX_RATE_UPDATE' | 'PROCESS_FUNDING';
  data: Record<string, any>;
  priority?: number;
  delay?: number;
  attempts?: number;
}

export interface ExchangeRateUpdate {
  fromCurrency: string;
  toCurrency: string;
  rate: number;
  provider: string;
}

export interface HealthCheckResponse {
  status: 'healthy' | 'unhealthy';
  services: {
    database: 'up' | 'down';
    kafka: 'up' | 'down';
  };
  timestamp: string;
  uptime: number;
}

export interface MetricsData {
  totalRequests: number;
  activeConnections: number;
  responseTime: {
    p50: number;
    p95: number;
    p99: number;
  };
  errorRate: number;
  remittances: {
    total: number;
    pending: number;
    completed: number;
    failed: number;
  };
}
