import Bull from 'bull';
import Redis from 'ioredis';
import { CONFIG } from '@/config';
import { RemittanceJobData, QueueJobType } from '@/types';

export class QueueService {
  private redis: Redis;
  private remittanceQueue: Bull.Queue<RemittanceJobData>;
  private callbackQueue: Bull.Queue<any>;
  private refundQueue: Bull.Queue<any>;

  constructor() {
    const redisConnectionString = `redis://${CONFIG.redis.password ? `:${CONFIG.redis.password}@` : ''}${CONFIG.redis.host}:${CONFIG.redis.port}`;

    this.redis = new Redis("redis://swiftremit_redis:6379");

    this.remittanceQueue = new Bull('remittance-processing', redisConnectionString, {
      defaultJobOptions: {
        removeOnComplete: 100,
        removeOnFail: 50,
        attempts: CONFIG.MAX_RETRIES,
        backoff: {
          type: 'exponential',
          delay: CONFIG.RETRY_DELAY_MS,
        },
      },
      settings: {
        stalledInterval: CONFIG.QUEUE_STALLED_INTERVAL,
        maxStalledCount: CONFIG.QUEUE_MAX_STALLED_COUNT,
      },
    });

    this.callbackQueue = new Bull('payment-callbacks', redisConnectionString, {
      defaultJobOptions: {
        removeOnComplete: 100,
        removeOnFail: 50,
        attempts: CONFIG.MAX_RETRIES,
        backoff: {
          type: 'exponential',
          delay: CONFIG.RETRY_DELAY_MS,
        },
      },
    });

    this.refundQueue = new Bull('refund-processing', redisConnectionString, {
      defaultJobOptions: {
        removeOnComplete: 100,
        removeOnFail: 50,
        attempts: CONFIG.MAX_RETRIES,
        backoff: {
          type: 'exponential',
          delay: CONFIG.RETRY_DELAY_MS,
        },
      },
    });

    
  }

  /**
   * Add remittance job to processing queue
   */
  async addRemittanceJob(jobData: RemittanceJobData, priority = 0): Promise<Bull.Job<RemittanceJobData>> {
    return this.remittanceQueue.add('process-remittance', jobData, {
      priority,
      jobId: jobData.idempotencyKey, // Use idempotency key as job ID to prevent duplicates
      delay: 0,
    });
  }

  /**
   * Add payment callback job to queue
   */
  async addCallbackJob(data: any, priority = 0): Promise<Bull.Job<any>> {
    return this.callbackQueue.add('payment-callback', data, {
      priority,
      delay: 0,
    });
  }

  /**
   * Add refund job to queue
   */
  async addRefundJob(data: any, priority = 0): Promise<Bull.Job<any>> {
    return this.refundQueue.add('process-refund', data, {
      priority,
      delay: 0,
    });
  }

  /**
   * Get remittance queue for worker registration
   */
  getRemittanceQueue(): Bull.Queue<RemittanceJobData> {
    return this.remittanceQueue;
  }

  /**
   * Get callback queue for worker registration
   */
  getCallbackQueue(): Bull.Queue<any> {
    return this.callbackQueue;
  }

  /**
   * Get refund queue for worker registration
   */
  getRefundQueue(): Bull.Queue<any> {
    return this.refundQueue;
  }

  /**
   * Get job statistics
   */
  async getQueueStats() {
    const [
      remittanceWaiting,
      remittanceActive,
      remittanceCompleted,
      remittanceFailed,
      callbackWaiting,
      callbackActive,
      refundWaiting,
      refundActive,
    ] = await Promise.all([
      this.remittanceQueue.getWaiting(),
      this.remittanceQueue.getActive(),
      this.remittanceQueue.getCompleted(),
      this.remittanceQueue.getFailed(),
      this.callbackQueue.getWaiting(),
      this.callbackQueue.getActive(),
      this.refundQueue.getWaiting(),
      this.refundQueue.getActive(),
    ]);

    return {
      remittance: {
        waiting: remittanceWaiting.length,
        active: remittanceActive.length,
        completed: remittanceCompleted.length,
        failed: remittanceFailed.length,
      },
      callback: {
        waiting: callbackWaiting.length,
        active: callbackActive.length,
      },
      refund: {
        waiting: refundWaiting.length,
        active: refundActive.length,
      },
    };
  }

  /**
   * Get job by ID
   */
  async getJob(queueType: QueueJobType, jobId: string): Promise<Bull.Job | null> {
    switch (queueType) {
      case 'PROCESS_REMITTANCE':
        return this.remittanceQueue.getJob(jobId);
      case 'HANDLE_PAYMENT_CALLBACK':
        return this.callbackQueue.getJob(jobId);
      case 'PROCESS_REFUND':
        return this.refundQueue.getJob(jobId);
      default:
        return null;
    }
  }

  /**
   * Retry failed job
   */
  async retryJob(queueType: QueueJobType, jobId: string): Promise<void> {
    const job = await this.getJob(queueType, jobId);
    if (job) {
      await job.retry();
    }
  }

  /**
   * Clean old jobs from queues
   */
  async cleanQueues(): Promise<void> {
    const olderThan = 24 * 60 * 60 * 1000; // 24 hours
    
    await Promise.all([
      this.remittanceQueue.clean(olderThan, 'completed'),
      this.remittanceQueue.clean(olderThan, 'failed'),
      this.callbackQueue.clean(olderThan, 'completed'),
      this.callbackQueue.clean(olderThan, 'failed'),
      this.refundQueue.clean(olderThan, 'completed'),
      this.refundQueue.clean(olderThan, 'failed'),
    ]);
  }

  /**
   * Close all queue connections
   */
  async close(): Promise<void> {
    await Promise.all([
      this.remittanceQueue.close(),
      this.callbackQueue.close(),
      this.refundQueue.close(),
      this.redis.disconnect(),
    ]);
  }

  /**
   * Health check for Redis connection
   */
  async healthCheck(): Promise<boolean> {
    try {
      await this.redis.ping();
      return true;
    } catch (error) {
      console.error('Redis health check failed:', error);
      return false;
    }
  }
}
