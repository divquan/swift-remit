import { config } from 'dotenv';
import path from 'path';

// Load environment variables
config({ path: path.resolve(__dirname, '../../.env') });

export const CONFIG = {
  NODE_ENV: process.env.NODE_ENV || 'development',
  PORT: parseInt(process.env.PORT || '3002', 10),
  
  // Database
  DATABASE_URL: process.env.DATABASE_URL || 'postgresql://username:password@localhost:5432/swiftremit',
  
  // Kafka
  KAFKA_BROKERS: process.env.KAFKA_BROKERS || 'kafka:9092',
  KAFKA_CLIENT_ID: process.env.KAFKA_CLIENT_ID || 'orchestrator',
  KAFKA_GROUP_ID: process.env.KAFKA_GROUP_ID || 'orchestrator-group',
  
  // Redis
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379'),
    password: process.env.REDIS_PASSWORD,
  },
  
  
  // External Services
  PAYMENT_PROVIDER_URL: process.env.MOCK_PAYMENT_PROVIDER_URL || 'http://localhost:3003',
  AUDIT_LOGGER_URL: process.env.AUDIT_LOGGER_URL || 'http://localhost:3004',
  
  // Paystack Configuration
  PAYSTACK_SECRET_KEY: process.env.PAYSTACK_SECRET_KEY || 'sk_test_45a6b86cd8f76273dbb4f46421f274acee89171f',
  PAYSTACK_PUBLIC_KEY: process.env.PAYSTACK_PUBLIC_KEY || 'pk_test_81aec086991df0463d9f46f6df3bcbf2daa5ab3b',
  
  // Logging
  LOG_LEVEL: process.env.LOG_LEVEL || 'info',
  
  // Retry Configuration
  MAX_RETRIES: parseInt(process.env.MAX_RETRIES || '3', 10),
  RETRY_DELAY_MS: parseInt(process.env.RETRY_DELAY_MS || '1000', 10),
  RETRY_BACKOFF_FACTOR: parseInt(process.env.RETRY_BACKOFF_FACTOR || '2', 10),
  
  // Queue Configuration
  QUEUE_CONCURRENCY: parseInt(process.env.QUEUE_CONCURRENCY || '5', 10),
  QUEUE_MAX_STALLED_COUNT: parseInt(process.env.QUEUE_MAX_STALLED_COUNT || '3', 10),
  QUEUE_STALLED_INTERVAL: parseInt(process.env.QUEUE_STALLED_INTERVAL || '30000', 10),
  
  // Timeouts
  PAYMENT_TIMEOUT_MS: parseInt(process.env.PAYMENT_TIMEOUT_MS || '30000', 10),
  DB_TRANSACTION_TIMEOUT_MS: parseInt(process.env.DB_TRANSACTION_TIMEOUT_MS || '10000', 10),
} as const;

export default CONFIG;
