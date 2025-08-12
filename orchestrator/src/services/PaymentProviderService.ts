import axios from 'axios';
import { PaymentProviderRequest, PaymentProviderResponse } from '@/types';
import { CONFIG } from '@/config';

export class PaymentProviderService {
  private baseURL: string;
  private timeout: number;

  constructor() {
    this.baseURL = CONFIG.PAYMENT_PROVIDER_URL;
    this.timeout = CONFIG.PAYMENT_TIMEOUT_MS;
  }

  /**
   * Process payment with external provider
   */
  async processPayment(request: PaymentProviderRequest): Promise<PaymentProviderResponse> {
    try {
      const response = await axios.post(
        `${this.baseURL}/api/payments/process`,
        {
          ...request,
          timestamp: new Date().toISOString(),
        },
        {
          timeout: this.timeout,
          headers: {
            'Content-Type': 'application/json',
            'X-Request-ID': request.remittanceId,
          },
        }
      );

      return {
        success: response.data.success,
        providerTxnId: response.data.transactionId,
        status: response.data.status,
        metadata: response.data.metadata,
      };
    } catch (error) {
      console.error('Payment provider error:', error);
      
      // Return failure response
      return {
        success: false,
        status: 'FAILED',
        failureReason: this.extractErrorMessage(error),
      };
    }
  }

  /**
   * Check payment status with provider
   */
  async checkPaymentStatus(providerTxnId: string): Promise<PaymentProviderResponse> {
    try {
      const response = await axios.get(
        `${this.baseURL}/api/payments/${providerTxnId}/status`,
        {
          timeout: this.timeout,
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );

      return {
        success: response.data.status === 'COMPLETED',
        providerTxnId: response.data.transactionId,
        status: response.data.status,
        metadata: response.data.metadata,
      };
    } catch (error) {
      console.error('Payment status check error:', error);
      
      return {
        success: false,
        status: 'FAILED',
        failureReason: this.extractErrorMessage(error),
      };
    }
  }

  /**
   * Cancel/reverse a payment with provider
   */
  async cancelPayment(providerTxnId: string, reason?: string): Promise<PaymentProviderResponse> {
    try {
      const response = await axios.post(
        `${this.baseURL}/api/payments/${providerTxnId}/cancel`,
        {
          reason: reason || 'Cancelled by system',
          timestamp: new Date().toISOString(),
        },
        {
          timeout: this.timeout,
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );

      return {
        success: response.data.success,
        providerTxnId: response.data.transactionId,
        status: response.data.status,
        metadata: response.data.metadata,
      };
    } catch (error) {
      console.error('Payment cancellation error:', error);
      
      return {
        success: false,
        status: 'FAILED',
        failureReason: this.extractErrorMessage(error),
      };
    }
  }

  /**
   * Extract error message from axios error
   */
  private extractErrorMessage(error: any): string {
    if (axios.isAxiosError(error)) {
      if (error.response) {
        return error.response.data?.message || error.response.statusText || 'Payment provider error';
      } else if (error.request) {
        return 'Payment provider unreachable';
      }
    }
    
    return error.message || 'Unknown payment provider error';
  }

  /**
   * Health check for payment provider
   */
  async healthCheck(): Promise<boolean> {
    try {
      const response = await axios.get(`${this.baseURL}/health`, {
        timeout: 5000,
      });
      
      return response.status === 200;
    } catch (error) {
      console.error('Payment provider health check failed:', error);
      return false;
    }
  }
}
