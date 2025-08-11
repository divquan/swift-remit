import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import swaggerUi from 'swagger-ui-express';
import { config } from './config';
import { swaggerSpec } from './config/swagger';
import { RedisService } from './services/RedisService';
import routes from './routes';
import { 
  requestId, 
  corsOptions, 
  errorHandler, 
  notFoundHandler,
  createRateLimit 
} from './middleware/common';

class App {
  public app: express.Application;

  constructor() {
    this.app = express();
    this.initializeMiddleware();
    this.initializeRoutes();
    this.initializeErrorHandling();
  }

  private initializeMiddleware(): void {
    // Security middleware
    this.app.use(helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'", "'unsafe-inline'", "https://cdnjs.cloudflare.com"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", "data:", "https:"],
        },
      },
    }));

    // CORS
    this.app.use(cors(corsOptions));

    // Request parsing
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));

    // Compression
    this.app.use(compression());

    // Request ID
    this.app.use(requestId);

    // Logging
    if (config.server.env !== 'test') {
      this.app.use(morgan('combined'));
    }

    // Global rate limiting
    this.app.use(createRateLimit());

    // Trust proxy for rate limiting and real IP
    this.app.set('trust proxy', 1);
  }

  private initializeRoutes(): void {
    // API Documentation
    this.app.use('/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
      explorer: true,
      customCss: '.swagger-ui .topbar { display: none }',
      customSiteTitle: 'SwiftRemit API Documentation'
    }));

    // Health check at root level
    this.app.get('/health', (req, res) => {
      res.json({
        status: 'healthy',
        service: 'SwiftRemit API Gateway',
        timestamp: new Date().toISOString(),
        uptime: process.uptime()
      });
    });

    // Main routes
    this.app.use('/', routes);
  }

  private initializeErrorHandling(): void {
    // 404 handler
    this.app.use(notFoundHandler);

    // Global error handler
    this.app.use(errorHandler);
  }

  public async start(): Promise<void> {
    try {
      // Initialize Redis connection
      await RedisService.connect();
      console.log('✅ Redis connected successfully');

      // Start server
      const server = this.app.listen(config.server.port, () => {
        console.log(`🚀 SwiftRemit API Gateway running on port ${config.server.port}`);
        console.log(`📚 API Documentation available at http://localhost:${config.server.port}/docs`);
        console.log(`🏥 Health check available at http://localhost:${config.server.port}/health`);
        console.log(`📊 Metrics available at http://localhost:${config.server.port}/metrics`);
        console.log(`🌍 Environment: ${config.server.env}`);
      });

      // Graceful shutdown
      process.on('SIGTERM', async () => {
        console.log('🛑 SIGTERM received, shutting down gracefully...');
        
        server.close(async () => {
          console.log('✅ HTTP server closed');
          
          try {
            await RedisService.disconnect();
            console.log('✅ Redis disconnected');
          } catch (error) {
            console.error('❌ Error disconnecting Redis:', error);
          }
          
          process.exit(0);
        });
      });

      process.on('SIGINT', async () => {
        console.log('🛑 SIGINT received, shutting down gracefully...');
        
        server.close(async () => {
          console.log('✅ HTTP server closed');
          
          try {
            await RedisService.disconnect();
            console.log('✅ Redis disconnected');
          } catch (error) {
            console.error('❌ Error disconnecting Redis:', error);
          }
          
          process.exit(0);
        });
      });

    } catch (error) {
      console.error('❌ Failed to start server:', error);
      process.exit(1);
    }
  }
}

// Start the application
const app = new App();

if (require.main === module) {
  app.start().catch((error) => {
    console.error('❌ Application startup failed:', error);
    process.exit(1);
  });
}

export default app;
