import { Kafka, Producer, Consumer, EachMessagePayload } from 'kafkajs';
import { config } from '../config';
import { QueueJob } from '../types';

export class KafkaService {
  private static kafka: Kafka;
  private static producer: Producer;
  private static isConnected = false;

  static async connect(): Promise<void> {
    if (this.isConnected) return;

    this.kafka = new Kafka({
      clientId: config.kafka.clientId,
      brokers: config.kafka.brokers.split(','),
    });

    this.producer = this.kafka.producer();

    await this.producer.connect();
    this.isConnected = true;
    console.log('Connected to Kafka');
  }

  static async disconnect(): Promise<void> {
    if (this.producer && this.isConnected) {
      await this.producer.disconnect();
      this.isConnected = false;
      console.log('Disconnected from Kafka');
    }
  }

  static async publishJob(topic: string, job: QueueJob): Promise<void> {
    if (!this.isConnected) {
      await this.connect();
    }

    const jobData = {
      ...job,
      timestamp: new Date().toISOString(),
      attempts: job.attempts || 0,
      maxAttempts: 3,
    };

    console.log(`Publishing job to topic: ${topic}`, jobData);

    await this.producer.send({
      topic,
      messages: [
        {
          key: job.id,
          value: JSON.stringify(jobData),
          headers: {
            type: job.type,
            timestamp: new Date().toISOString(),
          },
        },
      ],
    });

    console.log(`Job published successfully to topic: ${topic}`);
  }

  static async createTopics(topics: string[]): Promise<void> {
    if (!this.isConnected) {
      await this.connect();
    }

    const admin = this.kafka.admin();
    await admin.connect();

    try {
      await admin.createTopics({
        topics: topics.map(topic => ({
          topic,
          numPartitions: 3,
          replicationFactor: 1,
        })),
      });
      console.log(`Topics created: ${topics.join(', ')}`);
    } catch (error) {
      console.log('Topics might already exist:', error);
    } finally {
      await admin.disconnect();
    }
  }

  static createConsumer(groupId: string): Consumer {
    return this.kafka.consumer({ groupId });
  }
}
