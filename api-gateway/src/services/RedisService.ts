import { createClient, RedisClientType } from 'redis';
import { config } from '../config';
import { QueueJob } from '../types';

export class RedisService {
  private static client: RedisClientType;
  private static isConnected = false;

  static async connect(): Promise<void> {
    if (this.isConnected) return;

    this.client = createClient({
      socket: {
        host: config.redis.host,
        port: config.redis.port,
      },
      password: config.redis.password || undefined,
    });

    this.client.on('error', (err) => {
      console.error('Redis Client Error:', err);
    });

    this.client.on('connect', () => {
      console.log('Connected to Redis');
      this.isConnected = true;
    });

    this.client.on('disconnect', () => {
      console.log('Disconnected from Redis');
      this.isConnected = false;
    });

    await this.client.connect();
  }

  static async disconnect(): Promise<void> {
    if (this.client && this.isConnected) {
      await this.client.disconnect();
      this.isConnected = false;
    }
  }

  static async enqueueJob(queueName: string, job: QueueJob): Promise<void> {
    if (!this.isConnected) {
      await this.connect();
    }

    const jobData = {
      ...job,
      timestamp: new Date().toISOString(),
      attempts: job.attempts || 0,
      maxAttempts: 3,
    };

    await this.client.lPush(queueName, JSON.stringify(jobData));
  }

  static async dequeueJob(queueName: string, timeout = 10): Promise<QueueJob | null> {
    if (!this.isConnected) {
      await this.connect();
    }

    const result = await this.client.brPop(queueName, timeout);
    if (result) {
      return JSON.parse(result.element) as QueueJob;
    }
    return null;
  }

  static async getQueueLength(queueName: string): Promise<number> {
    if (!this.isConnected) {
      await this.connect();
    }

    return await this.client.lLen(queueName);
  }

  static async setCache(key: string, value: any, ttlSeconds = 3600): Promise<void> {
    if (!this.isConnected) {
      await this.connect();
    }

    await this.client.setEx(key, ttlSeconds, JSON.stringify(value));
  }

  static async getCache(key: string): Promise<any | null> {
    if (!this.isConnected) {
      await this.connect();
    }

    const result = await this.client.get(key);
    return result ? JSON.parse(result) : null;
  }

  static async deleteCache(key: string): Promise<void> {
    if (!this.isConnected) {
      await this.connect();
    }

    await this.client.del(key);
  }

  static async publish(channel: string, message: any): Promise<void> {
    if (!this.isConnected) {
      await this.connect();
    }

    await this.client.publish(channel, JSON.stringify(message));
  }

  static async subscribe(channel: string, callback: (message: any) => void): Promise<void> {
    if (!this.isConnected) {
      await this.connect();
    }

    await this.client.subscribe(channel, (message) => {
      try {
        const parsedMessage = JSON.parse(message);
        callback(parsedMessage);
      } catch (error) {
        console.error('Error parsing Redis message:', error);
      }
    });
  }

  static getClient(): RedisClientType {
    return this.client;
  }

  static isReady(): boolean {
    return this.isConnected;
  }
}
