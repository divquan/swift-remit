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
  
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379'),
    password: process.env.REDIS_PASSWORD,
  },
  
  tigerBeetle: {
    host: process.env.TIGERBEETLE_HOST || 'localhost',
    port: parseInt(process.env.TIGERBEETLE_PORT || '3001'),
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
