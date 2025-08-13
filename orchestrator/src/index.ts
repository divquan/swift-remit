import express from 'express';
import { DatabaseService } from '@/config/database';
import { KafkaService } from '@/services/KafkaService';
import { RemittanceWorker } from '@/workers/RemittanceWorker';
import { CallbackWorker } from '@/workers/CallbackWorker';
import { OrchestratorService } from '@/services/OrchestratorService';
import { CONFIG } from '@/config';

class OrchestratorApp {
  private app: express.Application;
  private dbService: DatabaseService;
  private kafkaService: typeof KafkaService;
  private remittanceWorker: RemittanceWorker;
  private callbackWorker: CallbackWorker;
  private orchestratorService: OrchestratorService;

  constructor() {
    this.app = express();
    this.dbService = DatabaseService.getInstance();
    this.kafkaService = KafkaService;
    this.remittanceWorker = new RemittanceWorker();
    this.callbackWorker = new CallbackWorker();
    this.orchestratorService = new OrchestratorService();
    
    this.setupMiddleware();
    this.setupRoutes();
    this.setupErrorHandling();
  }

  private setupMiddleware(): void {
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true }));
  }

  private setupRoutes(): void {
    // Health check endpoint
    this.app.get('/health', async (req, res) => {
      try {
        const [dbHealth, kafkaHealth] = await Promise.all([
          this.dbService.healthCheck(),
          this.kafkaService.healthCheck(),
        ]);

        const health = {
          status: dbHealth && kafkaHealth ? 'healthy' : 'unhealthy',
          timestamp: new Date().toISOString(),
          services: {
            database: dbHealth ? 'healthy' : 'unhealthy',
            kafka: kafkaHealth ? 'healthy' : 'unhealthy',
          },
        };

        res.status(health.status === 'healthy' ? 200 : 503).json(health);
      } catch (error) {
        res.status(503).json({
          status: 'error',
          message: 'Health check failed',
          timestamp: new Date().toISOString(),
        });
      }
    });

    // Kafka statistics endpoint
    this.app.get('/stats', async (req, res) => {
      try {
        // For now, return basic Kafka connection status
        // You can extend this to get more detailed Kafka metrics
        const stats = {
          kafka: {
            connected: true,
            topics: ['remittance-topic', 'refund-topic', 'reverse-topic', 'callback-topic']
          }
        };
        res.json({
          success: true,
          stats,
          timestamp: new Date().toISOString(),
        });
      } catch (error) {
        res.status(500).json({
          success: false,
          error: 'Failed to get Kafka statistics',
        });
      }
    });

    // Get remittance status endpoint
    this.app.get('/remittance/:id', async (req, res) => {
      try {
        const { id } = req.params;
        const remittance = await this.orchestratorService.getRemittanceStatus(id);
        
        if (!remittance) {
          return res.status(404).json({
            success: false,
            error: 'Remittance not found',
          });
        }

       return res.json({
          success: true,
          data: remittance,
        });
      } catch (error) {
        return res.status(500).json({
          success: false,
          error: 'Failed to get remittance status',
        });
      }
    });

    // Payment callback webhook endpoint
    this.app.post('/webhook/payment-callback', async (req, res) => {
      try {
        const callbackData = req.body;
        
        // Add callback to Kafka for processing
        await this.kafkaService.publishJob('callback-topic', callbackData);
        
        res.json({
          success: true,
          message: 'Callback received and queued for processing',
        });
      } catch (error) {
        console.error('Callback webhook error:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to process callback',
        });
      }
    });

    // Manual retry endpoint for failed jobs - simplified for Kafka
    this.app.post('/retry/:queueType/:jobId', async (req, res) => {
      try {
        const { queueType, jobId } = req.params;
        
        // For Kafka, you would republish the message to the topic
        // This is a simplified implementation
        res.json({
          success: true,
          message: `Job ${jobId} retry initiated (Kafka implementation needed)`,
        });
      } catch (error) {
        res.status(500).json({
          success: false,
          error: 'Failed to retry job',
        });
      }
    });

    // Test endpoints for development
    this.app.post('/test/remittance', async (req, res) => {
      try {
        const remittanceData = req.body;
        
        // Process remittance through orchestrator
        const result = await this.orchestratorService.processRemittance(remittanceData);
        
        res.json({
          success: true,
          message: 'Remittance processed successfully',
          data: result,
        });
      } catch (error) {
        console.error('Test remittance error:', error);
        res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : 'Failed to process remittance',
        });
      }
    });

    this.app.post('/test/callback', async (req, res) => {
      try {
        const callbackData = req.body;
        
        // Process callback through orchestrator
        await this.orchestratorService.processPaymentCallback(callbackData);
        
        res.json({
          success: true,
          message: 'Callback processed successfully',
        });
      } catch (error) {
        console.error('Test callback error:', error);
        res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : 'Failed to process callback',
        });
      }
    });
  }

  private setupErrorHandling(): void {
    // 404 handler
    this.app.use((req, res) => {
      res.status(404).json({
        success: false,
        error: 'Endpoint not found',
      });
    });

    // Global error handler
    this.app.use((error: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
      console.error('Unhandled error:', error);
      
      res.status(500).json({
        success: false,
        error: CONFIG.NODE_ENV === 'development' ? error.message : 'Internal server error',
      });
    });
  }

  async start(): Promise<void> {
      try {
        // Connect to database
        await this.dbService.connect();
        
        // Connect to Kafka and create topics
        await this.kafkaService.connect();
        await this.kafkaService.createTopics([
          'remittance-topic',
          'refund-topic', 
          'reverse-topic',
          'callback-topic'
        ]);
        
        // Start workers
        await this.remittanceWorker.start();
        await this.callbackWorker.start();
        
        // Start HTTP server
        this.app.listen(CONFIG.PORT, () => {
          console.log(`🚀 Orchestrator service running on port ${CONFIG.PORT}`);
          console.log(`📊 Health check: http://localhost:${CONFIG.PORT}/health`);
          console.log(`📈 Kafka stats: http://localhost:${CONFIG.PORT}/stats`);
        });

        // Graceful shutdown
        this.setupGracefulShutdown();    } catch (error) {
      console.error('Failed to start orchestrator service:', error);
      process.exit(1);
    }
  }

  private setupGracefulShutdown(): void {
    const gracefulShutdown = async (signal: string) => {
      console.log(`Received ${signal}, starting graceful shutdown...`);
      
      try {
        // Stop workers
        await this.remittanceWorker.stop();
        await this.callbackWorker.stop();
        
        // Close Kafka connections
        await this.kafkaService.disconnect();
        
        // Disconnect from database
        await this.dbService.disconnect();
        
        console.log('Graceful shutdown completed');
        process.exit(0);
      } catch (error) {
        console.error('Error during shutdown:', error);
        process.exit(1);
      }
    };

    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));
  }
}

// Start the application
if (require.main === module) {
  const app = new OrchestratorApp();
  app.start().catch((error) => {
    console.error('Failed to start application:', error);
    process.exit(1);
  });
}

export { OrchestratorApp };
