import { RetryConfig } from '@/types';
import { CONFIG } from '@/config';

export class RetryUtil {
  /**
   * Execute function with exponential backoff retry
   */
  static async withRetry<T>(
    fn: () => Promise<T>,
    config: RetryConfig = {
      maxRetries: CONFIG.MAX_RETRIES,
      delay: CONFIG.RETRY_DELAY_MS,
      backoffFactor: CONFIG.RETRY_BACKOFF_FACTOR,
    }
  ): Promise<T> {
    let lastError: Error;
    
    for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error instanceof Error ? error : new Error('Unknown error');
        
        if (attempt === config.maxRetries) {
          throw lastError;
        }
        
        const delay = config.delay * Math.pow(config.backoffFactor, attempt);
        console.log(`Attempt ${attempt + 1} failed, retrying in ${delay}ms:`, lastError.message);
        
        await this.sleep(delay);
      }
    }
    
    throw lastError!;
  }

  /**
   * Sleep for specified milliseconds
   */
  private static sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export class ValidationUtil {
  /**
   * Validate remittance job data
   */
  static validateRemittanceJobData(data: any): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];
    
    if (!data.remittanceId || typeof data.remittanceId !== 'string') {
      errors.push('remittanceId is required and must be a string');
    }
    
    if (!data.userId || typeof data.userId !== 'string') {
      errors.push('userId is required and must be a string');
    }
    
    if (!data.senderAccountId || typeof data.senderAccountId !== 'string') {
      errors.push('senderAccountId is required and must be a string');
    }
    
    if (!data.amount || typeof data.amount !== 'number' || data.amount <= 0) {
      errors.push('amount is required and must be a positive number');
    }
    
    if (!data.currency || typeof data.currency !== 'string') {
      errors.push('currency is required and must be a string');
    }
    
    if (data.fee === undefined || typeof data.fee !== 'number' || data.fee < 0) {
      errors.push('fee is required and must be a non-negative number');
    }
    
    if (!data.idempotencyKey || typeof data.idempotencyKey !== 'string') {
      errors.push('idempotencyKey is required and must be a string');
    }
    
    if (!data.receiverDetails || typeof data.receiverDetails !== 'object') {
      errors.push('receiverDetails is required and must be an object');
    }
    
    return {
      isValid: errors.length === 0,
      errors,
    };
  }

  /**
   * Validate payment callback data
   */
  static validatePaymentCallbackData(data: any): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];
    
    if (!data.remittanceId || typeof data.remittanceId !== 'string') {
      errors.push('remittanceId is required and must be a string');
    }
    
    if (!data.providerTxnId || typeof data.providerTxnId !== 'string') {
      errors.push('providerTxnId is required and must be a string');
    }
    
    if (!data.status || !['COMPLETED', 'FAILED'].includes(data.status)) {
      errors.push('status is required and must be either COMPLETED or FAILED');
    }
    
    return {
      isValid: errors.length === 0,
      errors,
    };
  }
}

export class ErrorUtil {
  /**
   * Create standardized error response
   */
  static createErrorResponse(message: string, code?: string, details?: any) {
    return {
      success: false,
      error: {
        message,
        code: code || 'UNKNOWN_ERROR',
        details,
        timestamp: new Date().toISOString(),
      },
    };
  }

  /**
   * Extract meaningful error message from any error
   */
  static extractErrorMessage(error: any): string {
    if (error instanceof Error) {
      return error.message;
    }
    
    if (typeof error === 'string') {
      return error;
    }
    
    if (error && typeof error === 'object' && error.message) {
      return error.message;
    }
    
    return 'Unknown error occurred';
  }

  /**
   * Check if error is retryable
   */
  static isRetryableError(error: any): boolean {
    const message = this.extractErrorMessage(error).toLowerCase();
    
    // Network/connection errors are retryable
    const retryablePatterns = [
      'timeout',
      'connection',
      'network',
      'econnreset',
      'enotfound',
      'service unavailable',
      'internal server error',
      'bad gateway',
      'gateway timeout',
    ];
    
    return retryablePatterns.some(pattern => message.includes(pattern));
  }
}

export class MetricsUtil {
  /**
   * Calculate processing time
   */
  static calculateProcessingTime(startTime: Date): number {
    return Date.now() - startTime.getTime();
  }

  /**
   * Format currency amount
   */
  static formatCurrency(amount: number, currency: string): string {
    return `${amount.toFixed(2)} ${currency}`;
  }

  /**
   * Generate unique reference
   */
  static generateReference(prefix: string): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8);
    return `${prefix}-${timestamp}-${random}`.toUpperCase();
  }
}
