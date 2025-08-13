import dotenv from 'dotenv';

dotenv.config();

export const config = {
  server: {
    port: parseInt(process.env.PORT || '3000'),
    env: process.env.NODE_ENV || 'development',
  },
  
  database: {
    url: process.env.DATABASE_URL!,
  },
  
  jwt: {
    secret: process.env.JWT_SECRET!,
    expiresIn: process.env.JWT_EXPIRES_IN || '24h',
  },
  
  kafka: {
    brokers: process.env.KAFKA_BROKERS || 'kafka:9092',
    clientId: process.env.KAFKA_CLIENT_ID || 'api-gateway',
    groupId: process.env.KAFKA_GROUP_ID || 'api-gateway-group',
  },
  
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379'),
    password: process.env.REDIS_PASSWORD,
  },
  
  services: {
    orchestrator: process.env.ORCHESTRATOR_URL || 'http://localhost:3002',
    paymentGateway: process.env.PAYMENT_GATEWAY_URL || 'http://localhost:3003',
    auditLogger: process.env.AUDIT_LOGGER_URL || 'http://localhost:3004',
  },
  
  security: {
    webhookSecret: process.env.WEBHOOK_SECRET!,
    bcryptRounds: 12,
  },
  
  // Paystack Configuration
  paystack: {
    secretKey: process.env.PAYSTACK_SECRET_KEY || 'sk_test_your_secret_key_here',
    publicKey: process.env.PAYSTACK_PUBLIC_KEY || 'pk_test_your_public_key_here',
    webhookSecret: process.env.PAYSTACK_WEBHOOK_SECRET || process.env.WEBHOOK_SECRET!,
  },
  
  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000'), // 15 minutes
    maxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100'),
  },
  
  monitoring: {
    prometheusPort: parseInt(process.env.PROMETHEUS_PORT || '9090'),
  },
} as const;

// Validate required environment variables
const requiredEnvVars = [
  'DATABASE_URL',
  'JWT_SECRET',
  'WEBHOOK_SECRET',
];

for (const envVar of requiredEnvVars) {
  if (!process.env[envVar]) {
    throw new Error(`Missing required environment variable: ${envVar}`);
  }
}
