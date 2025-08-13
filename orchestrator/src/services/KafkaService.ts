import { Kafka, Producer, Consumer, EachMessagePayload } from 'kafkajs';
import { CONFIG } from '../config';

export class KafkaService {
  private static kafka: Kafka;
  private static producer: Producer;
  private static consumer: Consumer;
  private static isConnected = false;

  static async connect(): Promise<void> {
    if (this.isConnected) return;

    this.kafka = new Kafka({
      clientId: CONFIG.KAFKA_CLIENT_ID,
      brokers: CONFIG.KAFKA_BROKERS.split(','),
    });

    this.producer = this.kafka.producer();
    this.consumer = this.kafka.consumer({ 
      groupId: CONFIG.KAFKA_GROUP_ID,
      sessionTimeout: 30000,
      heartbeatInterval: 3000,
    });

    await Promise.all([
      this.producer.connect(),
      this.consumer.connect(),
    ]);

    this.isConnected = true;
    console.log('Connected to Kafka');
  }

  static async disconnect(): Promise<void> {
    if (this.isConnected) {
      await Promise.all([
        this.producer?.disconnect(),
        this.consumer?.disconnect(),
      ]);
      this.isConnected = false;
      console.log('Disconnected from Kafka');
    }
  }

  static async publishJob(topic: string, job: any): Promise<void> {
    if (!this.isConnected) {
      await this.connect();
    }

    const jobData = {
      ...job,
      timestamp: new Date().toISOString(),
    };

    console.log(`Publishing job to topic: ${topic}`, jobData);

    await this.producer.send({
      topic,
      messages: [
        {
          key: job.id || Date.now().toString(),
          value: JSON.stringify(jobData),
          headers: {
            type: job.type || 'unknown',
            timestamp: new Date().toISOString(),
          },
        },
      ],
    });

    console.log(`Job published successfully to topic: ${topic}`);
  }

  static async subscribe(
    topics: string[],
    messageHandler: (payload: EachMessagePayload) => Promise<void>
  ): Promise<void> {
    if (!this.isConnected) {
      await this.connect();
    }

    await this.consumer.subscribe({ 
      topics,
      fromBeginning: false,
    });

    await this.consumer.run({
      eachMessage: messageHandler,
    });

    console.log(`Subscribed to topics: ${topics.join(', ')}`);
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

  static async healthCheck(): Promise<boolean> {
    try {
      if (!this.isConnected) {
        await this.connect();
      }
      return true;
    } catch (error) {
      console.error('Kafka health check failed:', error);
      return false;
    }
  }

  static createConsumer(groupId: string): Consumer {
    if (!this.kafka) {
      // Initialize Kafka client if not already done
      this.kafka = new Kafka({
        clientId: CONFIG.KAFKA_CLIENT_ID,
        brokers: CONFIG.KAFKA_BROKERS.split(','),
      });
    }
    return this.kafka.consumer({ groupId });
  }
}
