import Bull from 'bull';
import { OrchestratorService } from '@/services/OrchestratorService';
import { QueueService } from '@/queues/QueueService';
import { PaymentProviderResponse } from '@/types';
import { CONFIG } from '@/config';

interface PaymentCallbackData {
  remittanceId: string;
  providerTxnId: string;
  status: 'COMPLETED' | 'FAILED';
  failureReason?: string;
  metadata?: any;
}

export class CallbackWorker {
  private orchestrator: OrchestratorService;
  private queueService: QueueService;

  constructor(queueService: QueueService) {
    this.orchestrator = new OrchestratorService();
    this.queueService = queueService;
  }

  /**
   * Start processing payment callback jobs
   */
  start(): void {
    const queue = this.queueService.getCallbackQueue();

    // Process callback jobs
    queue.process('payment-callback', CONFIG.QUEUE_CONCURRENCY, async (job: Bull.Job<PaymentCallbackData>) => {
      console.log(`Processing payment callback: ${job.id}`);
      
      try {
        const callbackData = job.data;
        
        const providerResponse: PaymentProviderResponse = {
          success: callbackData.status === 'COMPLETED',
          providerTxnId: callbackData.providerTxnId,
          status: callbackData.status,
          failureReason: callbackData.failureReason || "<unknown>_",
          metadata: callbackData.metadata,
        };

        await this.orchestrator.handlePaymentResult(callbackData.remittanceId, providerResponse);
        
        console.log(`Payment callback processed: ${job.id}`);
        return { success: true };
      } catch (error) {
        console.error(`Payment callback failed: ${job.id}`, error);
        throw error;
      }
    });

    // Event handlers
    queue.on('completed', (job: Bull.Job<PaymentCallbackData>, result: any) => {
      console.log(`Payment callback ${job.id} completed with result:`, result);
    });

    queue.on('failed', (job: Bull.Job<PaymentCallbackData>, err: Error) => {
      console.error(`Payment callback ${job.id} failed:`, err.message);
    });

    queue.on('stalled', (job: Bull.Job<PaymentCallbackData>) => {
      console.warn(`Payment callback ${job.id} stalled`);
    });

    console.log('Callback worker started');
  }
}
