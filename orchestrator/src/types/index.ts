export interface RemittanceJobData {
  remittanceId: string;
  userId: string;
  senderAccountId: string;
  receiverAccountId?: string;
  receiverDetails: any;
  amount: number;
  currency: string;
  fee: number;
  idempotencyKey: string;
  metadata?: any;
}

export interface PaymentProviderRequest {
  remittanceId?: string;
  amount: number;
  currency: string;
  paymentMethod: string;
  provider?: string;
  phoneNumber?: string;
  reference: string;
  senderDetails?: {
    accountId: string;
    name: string;
    email?: string;
  };
  receiverDetails?: any;
  metadata?: any;
}

export interface PaymentProviderResponse {
  success: boolean;
  providerTxnId?: string;
  paymentId?: string;
  reference?: string;
  status: 'PENDING' | 'COMPLETED' | 'FAILED';
  failureReason?: string;
  errorMessage?: string;
  requiresConfirmation?: boolean;
  metadata?: any;
}

export interface TransactionData {
  debitAccountId?: string;
  creditAccountId?: string;
  amount: number;
  currency: string;
  type: 'TRANSFER' | 'DEPOSIT' | 'WITHDRAWAL' | 'FEE' | 'REFUND';
  description?: string;
  reference?: string;
  remittanceId?: string;
  metadata?: any;
}

export interface BalanceUpdateRequest {
  accountId: string;
  amount: number;
  operation: 'DEBIT' | 'CREDIT';
  reference: string;
}

export interface RetryConfig {
  maxRetries: number;
  delay: number;
  backoffFactor: number;
}

export interface AuditLogData {
  userId?: string;
  remittanceId?: string;
  action: string;
  resource: string;
  details: any;
  ipAddress?: string;
  userAgent?: string;
}

export interface RemittanceProcessingResult {
  success: boolean;
  remittanceId?: string;
  transactionId?: string;
  paymentId?: string;
  reference?: string;
  status?: 'PROCESSING' | 'COMPLETED' | 'FAILED';
  transactionIds?: string[];
  requiresConfirmation?: boolean;
  message?: string;
  errorMessage?: string;
}

export interface FundingJobData {
  type: 'PROCESS_FUNDING';
  transactionId: string;
  accountId: string;
  userId: string;
  amount: number;
  currency: string;
  paymentMethod: string;
  provider?: string;
  phoneNumber?: string;
  reference: string;
}

export interface AccountBalance {
  accountId: string;
  balance: number;
  currency: string;
  lockedBalance?: number;
}

export type QueueJobType = 'PROCESS_REMITTANCE' | 'HANDLE_PAYMENT_CALLBACK' | 'PROCESS_REFUND';
