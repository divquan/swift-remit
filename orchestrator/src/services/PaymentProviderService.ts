import { PaymentProviderRequest, PaymentProviderResponse } from "@/types";
import { CONFIG } from "@/config";
import { v4 as uuidv4 } from 'uuid';

export class PaymentProviderService {
  private timeout: number;
  
  // Central holding accounts for different payment methods
  private readonly centralAccounts = {
    CREDIT_CARD: { accountNumber: 'CC-HOLDING-001', bankCode: 'CC001' },
    BANK_ACCOUNT: { accountNumber: 'BANK-HOLDING-001', bankCode: 'BK001' },
    MTN_MOMO: { accountNumber: 'MTN-HOLDING-001', bankCode: 'MTN' },
    TELECEL_MOMO: { accountNumber: 'TELECEL-HOLDING-001', bankCode: 'TELECEL' },
    AIRTELTIGO_MOMO: { accountNumber: 'AIRTELTIGO-HOLDING-001', bankCode: 'AIRTELTIGO' },
    BANK_TRANSFER: { accountNumber: 'TRANSFER-HOLDING-001', bankCode: 'TRANSFER' }
  };

  constructor() {
    this.timeout = CONFIG.PAYMENT_TIMEOUT_MS;
  }

  /**
   * Process payment using central holding accounts
   * - CHARGE: For funding accounts (credit card, bank account, mobile money)
   * - TRANSFER: For sending money (mobile money, bank transfer)
   */
  async processPayment(request: PaymentProviderRequest): Promise<PaymentProviderResponse> {
    try {
      console.log('🔄 Processing payment request:', {
        remittanceId: request.remittanceId,
        transactionId: request.metadata?.transactionId,
        accountId: request.metadata?.accountId,
        amount: request.amount,
        currency: request.currency,
        paymentMethod: request.paymentMethod,
        provider: request.provider,
        phoneNumber: request.phoneNumber
      });

      // Determine if this is a charge (funding) or transfer (remittance)
      const isCharge = request.metadata?.transactionId && request.metadata?.accountId;
      const isTransfer = request.remittanceId && request.receiverDetails;

      if (isCharge) {
        console.log('📥 Processing as CHARGE (account funding)');
        return await this.processCharge(request);
      } else if (isTransfer) {
        console.log('📤 Processing as TRANSFER (remittance)');
        return await this.processTransfer(request);
      } else {
        console.error('❌ Unable to determine payment type:', { isCharge, isTransfer, request });
        return {
          success: false,
          status: "FAILED",
          failureReason: "Unable to determine payment type (charge vs transfer)",
        };
      }
    } catch (error) {
      console.error("Payment processing error:", error);
      return {
        success: false,
        status: "FAILED",
        failureReason: this.extractErrorMessage(error),
      };
    }
  }

  /**
   * Process CHARGE for account funding (credit card, bank account, mobile money)
   */
  private async processCharge(request: PaymentProviderRequest): Promise<PaymentProviderResponse> {
    const { amount, currency, paymentMethod, provider, phoneNumber } = request;
    const reference = `CHG-${uuidv4()}`;

    console.log(`💳 Processing CHARGE: ${amount} ${currency} via ${paymentMethod}`);
    console.log(`📋 Transaction ID: ${request.metadata?.transactionId}`);
    console.log(`🏦 Account ID: ${request.metadata?.accountId}`);
    console.log(`📱 Phone: ${phoneNumber}, Provider: ${provider}`);

    try {
      // Determine central account based on payment method
      let centralAccount;
      const method = paymentMethod?.toUpperCase();
      const providerCode = provider?.toUpperCase();

      // Support both old and new payment methods
      if (method === 'MOBILE_MONEY' || providerCode === 'MTN' || providerCode === 'TELECEL' || providerCode === 'AIRTELTIGO') {
        // Mobile money funding
        if (providerCode === 'MTN') {
          centralAccount = this.centralAccounts.MTN_MOMO;
        } else if (providerCode === 'TELECEL') {
          centralAccount = this.centralAccounts.TELECEL_MOMO;
        } else if (providerCode === 'AIRTELTIGO') {
          centralAccount = this.centralAccounts.AIRTELTIGO_MOMO;
        } else {
          centralAccount = this.centralAccounts.MTN_MOMO; // Default to MTN
        }
      } else if (method === 'CREDIT_CARD' || method === 'CARD') {
        centralAccount = this.centralAccounts.CREDIT_CARD;
      } else if (method === 'BANK_ACCOUNT' || method === 'BANK') {
        centralAccount = this.centralAccounts.BANK_ACCOUNT;
      } else {
        // Default to mobile money for backwards compatibility
        centralAccount = this.centralAccounts.MTN_MOMO;
      }

      console.log(`🏛️ Using central account:`, centralAccount);

      // Simulate charge processing
      await this.simulateDelay();

      // For now, we'll simulate success (in real implementation, you'd integrate with actual payment processors)
      const success = Math.random() > 0.1; // 90% success rate for testing

      if (success) {
        console.log(`✅ CHARGE SUCCESS: ${reference} for ${amount} ${currency}`);
        
        // Trigger webhook callback via API Gateway
        await this.triggerWebhook('charge.success', {
          reference,
          amount: amount * 100, // Convert to smallest currency unit (pesewas for GHS)
          currency,
          status: 'success',
          metadata: {
            transactionId: request.metadata?.transactionId,
            accountId: request.metadata?.accountId,
            userId: request.metadata?.userId,
            fundingType: request.metadata?.fundingType,
            paymentMethod: paymentMethod,
            provider: provider,
            phoneNumber: phoneNumber,
            centralAccount: centralAccount
          },
          authorization: {
            channel: paymentMethod,
            bank: centralAccount.bankCode,
            account_number: centralAccount.accountNumber
          },
          customer: {
            email: request.senderDetails?.email || 'user@swiftremit.com',
            phone: phoneNumber
          }
        });

        return {
          success: true,
          providerTxnId: reference,
          status: "PENDING", // Will be updated via webhook
          metadata: {
            reference,
            centralAccount,
            channel: paymentMethod,
            provider: provider,
            phoneNumber: phoneNumber
          }
        };
      } else {
        console.log(`❌ CHARGE FAILED: ${reference} for ${amount} ${currency}`);
        
        // Trigger failure webhook
        await this.triggerWebhook('charge.failed', {
          reference,
          amount: amount * 100,
          currency,
          status: 'failed',
          gateway_response: 'Simulated charge failure',
          metadata: {
            transactionId: request.metadata?.transactionId,
            accountId: request.metadata?.accountId,
            userId: request.metadata?.userId,
            paymentMethod: paymentMethod,
            provider: provider,
            phoneNumber: phoneNumber
          }
        });

        return {
          success: false,
          status: "FAILED",
          failureReason: "Simulated charge failure"
        };
      }
    } catch (error) {
      console.error('Charge processing error:', error);
      return {
        success: false,
        status: "FAILED",
        failureReason: this.extractErrorMessage(error)
      };
    }
  }

  /**
   * Process TRANSFER for remittances (mobile money: MTN, TELECEL, AIRTELTIGO; bank transfer)
   */
  private async processTransfer(request: PaymentProviderRequest): Promise<PaymentProviderResponse> {
    const { amount, currency, receiverDetails } = request;
    const reference = `TRF-${uuidv4()}`;

    console.log(`🚀 Processing TRANSFER: ${amount} ${currency} to ${receiverDetails?.firstName} ${receiverDetails?.lastName}`);
    console.log(`📋 Remittance ID: ${request.remittanceId}`);
    console.log(`🏦 Receiver Account: ${receiverDetails?.accountNumber} (${receiverDetails?.bankCode})`);

    try {
      // Determine transfer method based on bankCode
      const transferMethod = this.determineTransferMethod(receiverDetails?.bankCode);
      
      if (!transferMethod) {
        return {
          success: false,
          status: "FAILED",
          failureReason: `Unsupported bank/mobile money code: ${receiverDetails?.bankCode}`,
        };
      }

      console.log(`📡 Transfer method: ${transferMethod}`);

      // Simulate transfer processing
      await this.simulateDelay();

      // For now, we'll simulate success (in real implementation, you'd integrate with actual transfer systems)
      const success = Math.random() > 0.15; // 85% success rate for testing

      if (success) {
        console.log(`✅ TRANSFER SUCCESS: ${reference} for ${amount} ${currency}`);
        
        // Trigger webhook callback via API Gateway
        await this.triggerWebhook('transfer.success', {
          reference,
          amount: amount * 100, // Convert to smallest currency unit
          currency,
          status: 'success',
          transfer_code: `TC_${reference}`,
          remittanceId: request.remittanceId, // Add remittanceId at top level
          recipient: {
            name: `${receiverDetails?.firstName} ${receiverDetails?.lastName}`,
            account_number: receiverDetails?.accountNumber,
            bank_code: receiverDetails?.bankCode
          },
          metadata: {
            remittanceId: request.remittanceId,
            transferMethod: transferMethod,
            receiverName: `${receiverDetails?.firstName} ${receiverDetails?.lastName}`
          }
        });

        return {
          success: true,
          providerTxnId: reference,
          status: "PENDING", // Will be updated via webhook
          metadata: {
            reference,
            transfer_code: `TC_${reference}`,
            transferMethod,
            recipient: {
              name: `${receiverDetails?.firstName} ${receiverDetails?.lastName}`,
              account_number: receiverDetails?.accountNumber,
              bank_code: receiverDetails?.bankCode
            }
          }
        };
      } else {
        console.log(`❌ TRANSFER FAILED: ${reference} for ${amount} ${currency}`);
        
        // Trigger failure webhook
        await this.triggerWebhook('transfer.failed', {
          reference,
          amount: amount * 100,
          currency,
          status: 'failed',
          failure_reason: 'Simulated transfer failure',
          transfer_code: `TC_${reference}`,
          remittanceId: request.remittanceId, // Add remittanceId at top level
          recipient: {
            name: `${receiverDetails?.firstName} ${receiverDetails?.lastName}`,
            account_number: receiverDetails?.accountNumber,
            bank_code: receiverDetails?.bankCode
          },
          metadata: {
            remittanceId: request.remittanceId,
            transferMethod: transferMethod
          }
        });

        return {
          success: false,
          status: "FAILED",
          failureReason: "Simulated transfer failure"
        };
      }
    } catch (error) {
      console.error('Transfer processing error:', error);
      return {
        success: false,
        status: "FAILED",
        failureReason: this.extractErrorMessage(error)
      };
    }
  }

  /**
   * Determine transfer method based on bank code
   */
  private determineTransferMethod(bankCode?: string): string | null {
    if (!bankCode) return null;

    const code = bankCode.toUpperCase();
    
    // Mobile Money providers
    if (code.includes('MTN') || code === 'MTN') return 'MTN_MOMO';
    if (code.includes('TELECEL') || code === 'TELECEL') return 'TELECEL_MOMO';
    if (code.includes('AIRTELTIGO') || code === 'AIRTELTIGO') return 'AIRTELTIGO_MOMO';
    
    // Traditional banks (you can expand this list)
    const banks = ['GCB', 'ECOBANK', 'ZENITH', 'UBA', 'STANBIC', 'ACCESS', 'FIDELITY'];
    if (banks.some(bank => code.includes(bank))) return 'BANK_TRANSFER';
    
    // Default to bank transfer if not mobile money
    return 'BANK_TRANSFER';
  }

  /**
   * Trigger webhook to API Gateway (simulating payment provider webhook)
   */
  private async triggerWebhook(event: string, data: any): Promise<void> {
    try {
      console.log(`🔔 Triggering webhook: ${event}`);
      
      // Simulate webhook delay (real payment providers have delays)
      setTimeout(async () => {
        try {
          const webhookPayload = {
            event,
            data
          };

          console.log(`📤 Sending webhook to API Gateway:`, webhookPayload);
          
          // In a real implementation, you'd send this to your actual webhook URL
          // For now, we'll just log it and manually trigger the callback
          
          // Simulate webhook received by triggering callback directly
          await this.simulateWebhookCallback(event, data);
          
        } catch (error) {
          console.error('Webhook trigger error:', error);
        }
      }, 2000); // 2 second delay to simulate real payment provider
      
    } catch (error) {
      console.error('Webhook setup error:', error);
    }
  }

  /**
   * Simulate webhook callback (in real implementation, this would be handled by webhook endpoint)
   */
  private async simulateWebhookCallback(event: string, data: any): Promise<void> {
    try {
      // Import KafkaService dynamically to avoid circular dependencies
      const { KafkaService } = await import('@/services/KafkaService');
      
      const job = {
        id: uuidv4(),
        type: 'WEBHOOK_PROCESSING',
        data: {
          provider: 'central-accounts',
          event,
          ...data,
          timestamp: new Date().toISOString()
        }
      };

      console.log(`📨 Publishing callback job to Kafka:`, job);
      await KafkaService.publishJob('callback-topic', job);
      
    } catch (error) {
      console.error('Webhook callback simulation error:', error);
    }
  }

  /**
   * Simulate processing delay
   */
  private async simulateDelay(): Promise<void> {
    const delay = Math.random() * 2000 + 1000; // 1-3 seconds
    return new Promise(resolve => setTimeout(resolve, delay));
  }

  /**
   * Extract error message from various error types
   */
  private extractErrorMessage(error: any): string {
    if (error?.response?.data?.message) {
      return error.response.data.message;
    }
    if (error?.message) {
      return error.message;
    }
    if (typeof error === 'string') {
      return error;
    }
    return 'Unknown payment processing error';
  }

  /**
   * Verify payment status (for testing purposes)
   */
  async verifyPayment(providerTxnId: string): Promise<PaymentProviderResponse> {
    console.log(`Verifying payment: ${providerTxnId}`);
    
    // Simulate verification
    return {
      success: true,
      providerTxnId,
      status: "COMPLETED",
      metadata: {
        verified: true,
        verifiedAt: new Date().toISOString()
      }
    };
  }

  /**
   * Get list of supported banks (for testing purposes)
   */
  async getSupportedBanks(): Promise<any[]> {
    return [
      // Mobile Money
      { name: 'MTN Mobile Money', code: 'MTN', type: 'mobile_money' },
      { name: 'Telecel Cash', code: 'TELECEL', type: 'mobile_money' },
      { name: 'AirtelTigo Money', code: 'AIRTELTIGO', type: 'mobile_money' },
      
      // Traditional Banks
      { name: 'Ghana Commercial Bank', code: 'GCB', type: 'bank' },
      { name: 'Ecobank Ghana', code: 'ECOBANK', type: 'bank' },
      { name: 'Zenith Bank', code: 'ZENITH', type: 'bank' },
      { name: 'United Bank for Africa', code: 'UBA', type: 'bank' },
      { name: 'Stanbic Bank', code: 'STANBIC', type: 'bank' },
      { name: 'Access Bank', code: 'ACCESS', type: 'bank' },
      { name: 'Fidelity Bank', code: 'FIDELITY', type: 'bank' }
    ];
  }
}
