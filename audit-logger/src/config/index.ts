import { config } from 'dotenv';
import path from 'path';

// Load environment variables
config({ path: path.resolve(__dirname, '../../.env') });

export const CONFIG = {
  NODE_ENV: process.env.NODE_ENV || 'development',
  PORT: parseInt(process.env.PORT || '3004', 10),
  
  // Database
  DATABASE_URL: process.env.DATABASE_URL || 'postgresql://username:password@localhost:5432/swiftremit',
  
  // Kafka
  KAFKA_BROKERS: process.env.KAFKA_BROKERS || 'kafka:9092',
  KAFKA_CLIENT_ID: process.env.KAFKA_CLIENT_ID || 'audit-logger',
  KAFKA_GROUP_ID: process.env.KAFKA_GROUP_ID || 'audit-logger-group',
  
  // Retention and batching
  LOG_RETENTION_DAYS: parseInt(process.env.LOG_RETENTION_DAYS || '365', 10),
  BATCH_SIZE: parseInt(process.env.BATCH_SIZE || '100', 10),
  BATCH_TIMEOUT_MS: parseInt(process.env.BATCH_TIMEOUT_MS || '5000', 10),
  
  // Rate limiting
  RATE_LIMIT_WINDOW_MS: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000', 10),
  RATE_LIMIT_MAX_REQUESTS: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '1000', 10),
} as const;

export default CONFIG;
