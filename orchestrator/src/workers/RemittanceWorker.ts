import Bull from 'bull';
import { OrchestratorService } from '@/services/OrchestratorService';
import { QueueService } from '@/queues/QueueService';
import { RemittanceJobData } from '@/types';
import { CONFIG } from '@/config';

export class RemittanceWorker {
  private orchestrator: OrchestratorService;
  private queueService: QueueService;

  constructor(queueService: QueueService) {
    this.orchestrator = new OrchestratorService();
    this.queueService = queueService;
  }

  /**
   * Start processing remittance jobs
   */
  start(): void {
    const queue = this.queueService.getRemittanceQueue();

    // Process remittance jobs with concurrency
    queue.process('process-remittance', CONFIG.QUEUE_CONCURRENCY, async (job: Bull.Job<RemittanceJobData>) => {
      console.log(`Processing remittance job: ${job.id}`);
      
      try {
        const result = await this.orchestrator.startRemittance(job.data);
        
        if (!result.success) {
          throw new Error(result.errorMessage || 'Remittance processing failed');
        }

        console.log(`Remittance job completed: ${job.id}`);
        return result;
      } catch (error) {
        console.error(`Remittance job failed: ${job.id}`, error);
        throw error;
      }
    });

    // Event handlers
    queue.on('completed', (job: Bull.Job<RemittanceJobData>, result: any) => {
      console.log(`Remittance job ${job.id} completed with result:`, result);
    });

    queue.on('failed', (job: Bull.Job<RemittanceJobData>, err: Error) => {
      console.error(`Remittance job ${job.id} failed:`, err.message);
      
      // After max retries, mark as permanently failed
      if (job.attemptsMade >= job.opts.attempts!) {
        this.handlePermanentFailure(job);
      }
    });

    queue.on('stalled', (job: Bull.Job<RemittanceJobData>) => {
      console.warn(`Remittance job ${job.id} stalled`);
    });

    console.log('Remittance worker started');
  }

  /**
   * Handle permanently failed jobs
   */
  private async handlePermanentFailure(job: Bull.Job<RemittanceJobData>): Promise<void> {
    try {
      console.error(`Permanent failure for remittance job: ${job.id}`);
      
      // Try to reverse the remittance if it was partially processed
      await this.orchestrator.reverseRemittance(
        job.data.remittanceId,
        'Maximum retries exceeded'
      );
    } catch (error) {
      console.error(`Failed to reverse permanently failed remittance ${job.data.remittanceId}:`, error);
    }
  }
}
