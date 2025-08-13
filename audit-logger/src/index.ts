import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import { CONFIG } from '@/config';
import { db } from '@/config/database';
import auditController from '@/controllers/AuditController';

const app = express();

// Security middleware
app.use(helmet());
app.use(cors());

// Rate limiting
const limiter = rateLimit({
  windowMs: CONFIG.RATE_LIMIT_WINDOW_MS,
  max: CONFIG.RATE_LIMIT_MAX_REQUESTS,
  message: {
    success: false,
    error: 'Too many requests, please try again later',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

app.use(limiter);

// Body parsing and compression
app.use(compression());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Logging
if (CONFIG.NODE_ENV !== 'test') {
  app.use(morgan('combined'));
}

// Trust proxy for accurate IP addresses
app.set('trust proxy', true);

// Health check endpoint
app.get('/health', async (req, res) => {
  try {
    // Test database connection
    await db.$queryRaw`SELECT 1`;
    
    res.status(200).json({
      success: true,
      status: 'healthy',
      timestamp: new Date().toISOString(),
      service: 'audit-logger',
      version: '1.0.0',
    });
  } catch (error) {
    res.status(503).json({
      success: false,
      status: 'unhealthy',
      error: 'Database connection failed',
      timestamp: new Date().toISOString(),
    });
  }
});

// API routes
app.use('/api/audit', auditController);

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    error: 'Endpoint not found',
    path: req.originalUrl,
  });
});

// Error handler
app.use((error: any, req: any, res: any, next: any) => {
  console.error('Unhandled error:', error);
  
  res.status(500).json({
    success: false,
    error: CONFIG.NODE_ENV === 'production' 
      ? 'Internal server error' 
      : error.message,
  });
});

const PORT = CONFIG.PORT;

const server = app.listen(PORT, () => {
  console.log(`🔍 Audit Logger Service running on port ${PORT}`);
  console.log(`📊 Environment: ${CONFIG.NODE_ENV}`);
  console.log(`💾 Database: Connected`);
});

// Graceful shutdown
const gracefulShutdown = async (signal: string) => {
  console.log(`\n🛑 Received ${signal}. Starting graceful shutdown...`);
  
  server.close(async () => {
    console.log('🔒 HTTP server closed');
    
    try {
      await db.$disconnect();
      console.log('💾 Database disconnected');
      
      console.log('✅ Graceful shutdown completed');
      process.exit(0);
    } catch (error) {
      console.error('❌ Error during shutdown:', error);
      process.exit(1);
    }
  });
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

export default app;
