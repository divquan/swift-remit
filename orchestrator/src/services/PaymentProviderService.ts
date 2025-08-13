import axios from 'axios';
import { PaymentProviderRequest, PaymentProviderResponse } from '@/types';
import { CONFIG } from '@/config';

export class PaymentProviderService {
  private paystackSecretKey: string;
  private paystackBaseURL: string;
  private timeout: number;

  constructor() {
    this.paystackSecretKey = CONFIG.PAYSTACK_SECRET_KEY;
    this.paystackBaseURL = 'https://api.paystack.co';
    this.timeout = CONFIG.PAYMENT_TIMEOUT_MS;
  }

  /**
   * Process payment with Paystack
   */
  async processPayment(request: PaymentProviderRequest): Promise<PaymentProviderResponse> {
    try {
      // Determine payment method based on receiver details
      const paymentMethod = this.determinePaymentMethod(request);
      
      switch (paymentMethod) {
        case 'mobile_money':
          return await this.processMobileMoneyPayment(request);
        case 'bank_transfer':
          return await this.processBankTransferPayment(request);
        case 'card':
          return await this.processCardPayment(request);
        default:
          return {
            success: false,
            status: 'FAILED',
            failureReason: 'Unsupported payment method'
          };
      }
    } catch (error) {
      console.error('Paystack payment error:', error);
      
      return {
        success: false,
        status: 'FAILED',
        failureReason: this.extractErrorMessage(error),
      };
    }
  }

  /**
   * Process Mobile Money payment via Paystack
   */
  private async processMobileMoneyPayment(request: PaymentProviderRequest): Promise<PaymentProviderResponse> {
    const { receiverDetails, amount, currency } = request;
    
    // Convert amount to kobo (Paystack uses kobo for GHS)
    const amountInKobo = Math.round(amount * 100);
    
    try {
      const response = await axios.post(
        `${this.paystackBaseURL}/charge`,
        {
          email: receiverDetails.email,
          amount: amountInKobo,
          currency: currency,
          mobile_money: {
            phone: receiverDetails.phoneNumber,
            provider: this.getMobileMoneyProvider(receiverDetails.bankCode)
          },
          reference: `${request.remittanceId}_${Date.now()}`,
          callback_url: `${CONFIG.AUDIT_LOGGER_URL}/webhooks/paystack`,
          metadata: {
            remittanceId: request.remittanceId,
            receiverName: `${receiverDetails.firstName} ${receiverDetails.lastName}`,
            custom_fields: [
              {
                display_name: "Remittance ID",
                variable_name: "remittance_id",
                value: request.remittanceId
              }
            ]
          }
        },
        {
          timeout: this.timeout,
          headers: {
            'Authorization': `Bearer ${this.paystackSecretKey}`,
            'Content-Type': 'application/json',
          },
        }
      );

      return {
        success: response.data.status === true,
        providerTxnId: response.data.data?.reference || response.data.data?.id,
        status: this.mapPaystackStatus(response.data.data?.status),
        metadata: {
          gateway_response: response.data.data?.gateway_response,
          channel: 'mobile_money',
          provider: this.getMobileMoneyProvider(receiverDetails.bankCode)
        }
      };
    } catch (error) {
      console.error('Mobile Money payment error:', error);
      return {
        success: false,
        status: 'FAILED',
        failureReason: this.extractErrorMessage(error),
      };
    }
  }

  /**
   * Process Bank Transfer payment via Paystack
   */
  private async processBankTransferPayment(request: PaymentProviderRequest): Promise<PaymentProviderResponse> {
    const { receiverDetails, amount, currency } = request;
    
    // Convert amount to kobo
    const amountInKobo = Math.round(amount * 100);
    
    try {
      // Create a transfer recipient first
      const recipientResponse = await axios.post(
        `${this.paystackBaseURL}/transferrecipient`,
        {
          type: "nuban",
          name: `${receiverDetails.firstName} ${receiverDetails.lastName}`,
          account_number: receiverDetails.accountNumber,
          bank_code: receiverDetails.bankCode,
          currency: currency,
          metadata: {
            remittanceId: request.remittanceId
          }
        },
        {
          headers: {
            'Authorization': `Bearer ${this.paystackSecretKey}`,
            'Content-Type': 'application/json',
          },
        }
      );

      if (!recipientResponse.data.status) {
        return {
          success: false,
          status: 'FAILED',
          failureReason: recipientResponse.data.message || 'Failed to create transfer recipient'
        };
      }

      // Initiate transfer
      const transferResponse = await axios.post(
        `${this.paystackBaseURL}/transfer`,
        {
          source: "balance",
          amount: amountInKobo,
          recipient: recipientResponse.data.data.recipient_code,
          reason: `Remittance payment - ${request.remittanceId}`,
          reference: `${request.remittanceId}_${Date.now()}`,
          metadata: {
            remittanceId: request.remittanceId,
            receiverName: `${receiverDetails.firstName} ${receiverDetails.lastName}`
          }
        },
        {
          timeout: this.timeout,
          headers: {
            'Authorization': `Bearer ${this.paystackSecretKey}`,
            'Content-Type': 'application/json',
          },
        }
      );

      return {
        success: transferResponse.data.status === true,
        providerTxnId: transferResponse.data.data?.reference || transferResponse.data.data?.id,
        status: this.mapPaystackStatus(transferResponse.data.data?.status),
        metadata: {
          transfer_code: transferResponse.data.data?.transfer_code,
          recipient_code: recipientResponse.data.data.recipient_code,
          channel: 'bank_transfer'
        }
      };
    } catch (error) {
      console.error('Bank transfer payment error:', error);
      return {
        success: false,
        status: 'FAILED',
        failureReason: this.extractErrorMessage(error),
      };
    }
  }

  /**
   * Process Card payment via Paystack (for account deposits)
   */
  private async processCardPayment(request: PaymentProviderRequest): Promise<PaymentProviderResponse> {
    const { amount, currency } = request;
    
    // Convert amount to kobo
    const amountInKobo = Math.round(amount * 100);
    
    try {
      // Initialize transaction for card payment
      const response = await axios.post(
        `${this.paystackBaseURL}/transaction/initialize`,
        {
          email: request.senderDetails.email,
          amount: amountInKobo,
          currency: currency,
          reference: `${request.remittanceId}_${Date.now()}`,
          callback_url: `${CONFIG.AUDIT_LOGGER_URL}/webhooks/paystack`,
          metadata: {
            remittanceId: request.remittanceId,
            type: 'account_deposit',
            custom_fields: [
              {
                display_name: "Transaction Type",
                variable_name: "transaction_type",
                value: "account_deposit"
              }
            ]
          }
        },
        {
          timeout: this.timeout,
          headers: {
            'Authorization': `Bearer ${this.paystackSecretKey}`,
            'Content-Type': 'application/json',
          },
        }
      );

      return {
        success: response.data.status === true,
        providerTxnId: response.data.data?.reference,
        status: 'PENDING',
        metadata: {
          authorization_url: response.data.data?.authorization_url,
          access_code: response.data.data?.access_code,
          channel: 'card'
        }
      };
    } catch (error) {
      console.error('Card payment error:', error);
      return {
        success: false,
        status: 'FAILED',
        failureReason: this.extractErrorMessage(error),
      };
    }
  }

  /**
   * Check payment status with Paystack
   */
  async checkPaymentStatus(providerTxnId: string): Promise<PaymentProviderResponse> {
    try {
      const response = await axios.get(
        `${this.paystackBaseURL}/transaction/verify/${providerTxnId}`,
        {
          timeout: this.timeout,
          headers: {
            'Authorization': `Bearer ${this.paystackSecretKey}`,
            'Content-Type': 'application/json',
          },
        }
      );

      return {
        success: response.data.status === true && response.data.data?.status === 'success',
        providerTxnId: response.data.data?.reference,
        status: this.mapPaystackStatus(response.data.data?.status),
        metadata: {
          gateway_response: response.data.data?.gateway_response,
          channel: response.data.data?.channel,
          amount: response.data.data?.amount,
          fees: response.data.data?.fees
        }
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
   * Cancel/reverse a payment with Paystack
   */
  async cancelPayment(providerTxnId: string, reason?: string): Promise<PaymentProviderResponse> {
    try {
      // For transfers, we might need to reverse via different endpoint
      const response = await axios.post(
        `${this.paystackBaseURL}/refund`,
        {
          transaction: providerTxnId,
          amount: null, // Full refund
          currency: 'GHS',
          customer_note: reason || 'Cancelled by system',
          merchant_note: `Remittance cancellation: ${reason || 'System cancellation'}`
        },
        {
          timeout: this.timeout,
          headers: {
            'Authorization': `Bearer ${this.paystackSecretKey}`,
            'Content-Type': 'application/json',
          },
        }
      );

      return {
        success: response.data.status === true,
        providerTxnId: response.data.data?.transaction?.reference,
        status: response.data.status === true ? 'COMPLETED' : 'FAILED',
        metadata: {
          refund_id: response.data.data?.id,
          original_transaction: providerTxnId
        }
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
   * Determine payment method based on receiver details
   */
  private determinePaymentMethod(request: PaymentProviderRequest): string {
    const { receiverDetails } = request;
    
    // Check if it's mobile money based on bank code
    if (this.isMobileMoneyProvider(receiverDetails.bankCode)) {
      return 'mobile_money';
    }
    
    // Check if account number is provided for bank transfer
    if (receiverDetails.accountNumber) {
      return 'bank_transfer';
    }
    
    // Default to card payment (for account deposits)
    return 'card';
  }

  /**
   * Check if provider is mobile money
   */
  private isMobileMoneyProvider(bankCode: string): boolean {
    const mobileMoneyProviders = ['MTN', 'VODAFONE', 'AIRTELTIGO'];
    return mobileMoneyProviders.includes(bankCode?.toUpperCase());
  }

  /**
   * Get mobile money provider from bank code
   */
  private getMobileMoneyProvider(bankCode: string): string {
    switch (bankCode?.toUpperCase()) {
      case 'MTN':
        return 'mtn';
      case 'VODAFONE':
        return 'vod';
      case 'AIRTELTIGO':
        return 'tgo';
      default:
        return 'mtn'; // Default to MTN
    }
  }

  /**
   * Map Paystack status to our internal status
   */
  private mapPaystackStatus(paystackStatus: string): 'PENDING' | 'COMPLETED' | 'FAILED' {
    switch (paystackStatus?.toLowerCase()) {
      case 'success':
      case 'successful':
      case 'completed':
        return 'COMPLETED';
      case 'pending':
      case 'ongoing':
      case 'processing':
        return 'PENDING';
      case 'failed':
      case 'cancelled':
      case 'abandoned':
      default:
        return 'FAILED';
    }
  }

  /**
   * Extract error message from axios error
   */
  private extractErrorMessage(error: any): string {
    if (axios.isAxiosError(error)) {
      if (error.response?.data?.message) {
        return error.response.data.message;
      } else if (error.response?.data?.error) {
        return error.response.data.error;
      } else if (error.response) {
        return error.response.statusText || 'Paystack API error';
      } else if (error.request) {
        return 'Paystack API unreachable';
      }
    }
    
    return error.message || 'Unknown Paystack error';
  }

  /**
   * Health check for Paystack
   */
  async healthCheck(): Promise<boolean> {
    try {
      // Test with a simple banks list call (no payment data needed)
      const response = await axios.get(`${this.paystackBaseURL}/bank`, {
        timeout: 5000,
        headers: {
          'Authorization': `Bearer ${this.paystackSecretKey}`,
        },
      });
      
      return response.status === 200 && response.data.status === true;
    } catch (error) {
      console.error('Paystack health check failed:', error);
      return false;
    }
  }
}
