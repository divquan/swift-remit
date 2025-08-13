import { Consumer } from 'kafkajs';
import { OrchestratorService } from '@/services/OrchestratorService';
import { KafkaService } from '@/services/KafkaService';
import { PaymentProviderResponse } from '@/types';

interface PaymentCallbackData {
  remittanceId: string;
  providerTxnId: string;
  status: 'COMPLETED' | 'FAILED';
  failureReason?: string;
  metadata?: any;
}

export class CallbackWorker {
  private orchestrator: OrchestratorService;
  private consumer: Consumer | null = null;

  constructor() {
    this.orchestrator = new OrchestratorService();
  }

  /**
   * Start processing payment callback jobs from Kafka
   */
  async start(): Promise<void> {
    try {
      // Create consumer when starting, not in constructor
      this.consumer = KafkaService.createConsumer('callback-worker-group');
      
      await this.consumer.connect();
      await this.consumer.subscribe({ topic: 'callback-topic', fromBeginning: false });

      await this.consumer.run({
        eachMessage: async ({ topic, partition, message }) => {
          try {
            const jobData = JSON.parse(message.value!.toString());
            console.log(`Processing payment callback from topic ${topic}:`, jobData);

            const callbackData = jobData.data;
            
            const providerResponse: PaymentProviderResponse = {
              success: callbackData.status === 'success',
              providerTxnId: callbackData.providerTxnId || callbackData.transactionId,
              paymentId: callbackData.paymentId,
              reference: callbackData.reference,
              status: callbackData.status === 'success' ? 'COMPLETED' : 'FAILED',
              failureReason: callbackData.failureReason,
              metadata: callbackData.metadata,
            };

            // Handle funding vs remittance callbacks
            if (callbackData.transactionId && callbackData.accountId && callbackData.userId && !callbackData.remittanceId) {
              // This is a funding callback
              await this.orchestrator.handleFundingResult(
                callbackData.transactionId, 
                callbackData.accountId,
                callbackData.userId,
                providerResponse
              );
            } else if (callbackData.remittanceId) {
              // This is a remittance callback
              await this.orchestrator.handlePaymentResult(callbackData.remittanceId, providerResponse);
            } else {
              console.warn('Callback data missing required identifiers:', callbackData);
              return;
            }
            
            console.log(`Payment callback processed successfully`);
          } catch (error) {
            console.error(`Payment callback failed:`, error);
            // In a production system, you might want to send failed jobs to a dead letter queue
          }
        },
      });

      console.log('CallbackWorker started and listening for messages');
    } catch (error) {
      console.error('Failed to start CallbackWorker:', error);
    }
  }

  /**
   * Stop the worker
   */
  async stop(): Promise<void> {
    try {
      if (this.consumer) {
        await this.consumer.disconnect();
        console.log('CallbackWorker stopped');
      }
    } catch (error) {
      console.error('Error stopping CallbackWorker:', error);
    }
  }
}
