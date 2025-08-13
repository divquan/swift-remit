import { Consumer } from 'kafkajs';
import { OrchestratorService } from '@/services/OrchestratorService';
import { KafkaService } from '@/services/KafkaService';
import { RemittanceJobData } from '@/types';
import { CONFIG } from '@/config';

export class RemittanceWorker {
  private orchestrator: OrchestratorService;
  private consumer: Consumer | null = null;

  constructor() {
    this.orchestrator = new OrchestratorService();
  }

  /**
   * Start processing remittance jobs from Kafka
   */
  async start(): Promise<void> {
    try {
      // Create consumer when starting, not in constructor
      this.consumer = KafkaService.createConsumer('remittance-worker-group');
      
      await this.consumer.connect();
      await this.consumer.subscribe({ topic: 'remittance-topic', fromBeginning: false });

      await this.consumer.run({
        eachMessage: async ({ topic, partition, message }) => {
          try {
            const jobData = JSON.parse(message.value!.toString());
            console.log(`Processing job from topic ${topic}:`, jobData);

            let result;

            // Handle different job types
            if (jobData.type === 'PROCESS_FUNDING') {
              result = await this.orchestrator.processFunding(jobData.data);
            } else {
              // Default to remittance processing for backward compatibility
              result = await this.orchestrator.startRemittance(jobData.data || jobData);
            }
            
            if (!result.success) {
              throw new Error(result.errorMessage || 'Job processing failed');
            }

            console.log(`Job completed successfully:`, result);
          } catch (error) {
            console.error(`Job failed:`, error);
            // In a production system, you might want to send failed jobs to a dead letter queue
          }
        },
      });

      console.log('RemittanceWorker started and listening for messages');
    } catch (error) {
      console.error('Failed to start RemittanceWorker:', error);
    }
  }

  /**
   * Stop the worker
   */
  async stop(): Promise<void> {
    try {
      if (this.consumer) {
        await this.consumer.disconnect();
        console.log('RemittanceWorker stopped');
      }
    } catch (error) {
      console.error('Error stopping RemittanceWorker:', error);
    }
  }
}
