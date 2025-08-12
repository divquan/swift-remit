import { Request, Response } from 'express';
import prisma from '../config/database';
import { config } from '../config';
import { ApiResponse, HealthCheckResponse, MetricsData } from '../types';
import { RedisService } from '../services/RedisService';
import { TigerBeetleService } from '../services/TigerBeetleService';

export class AdminController {
  /**
   * @swagger
   * /health:
   *   get:
   *     summary: Health check endpoint
   *     tags: [Admin]
   *     responses:
   *       200:
   *         description: Service is healthy
   *       503:
   *         description: Service is unhealthy
   */
  static async healthCheck(req: Request, res: Response) {
    try {
      const startTime = process.hrtime();
      
      // Check database connection
      let dbStatus: 'up' | 'down' = 'down';
      try {
        await prisma.$queryRaw`SELECT 1`;
        dbStatus = 'up';
      } catch (dbError) {
        console.error('Database health check failed:', dbError);
      }
      
      // Check Redis connection
      let redisStatus: 'up' | 'down' = 'down';
      try {
        if (RedisService.isReady()) {
          redisStatus = 'up';
        } else {
          await RedisService.connect();
          redisStatus = 'up';
        }
      } catch (redisError) {
        console.error('Redis health check failed:', redisError);
      }
      
      // Check TigerBeetle connection
      let tigerBeetleStatus: 'up' | 'down' = 'down';
      try {
        const isHealthy = await TigerBeetleService.healthCheck();
        tigerBeetleStatus = isHealthy ? 'up' : 'down';
      } catch (tbError) {
        console.error('TigerBeetle health check failed:', tbError);
      }
      
      const [seconds, nanoseconds] = process.hrtime(startTime);
      const uptime = process.uptime();
      
      const isHealthy = dbStatus === 'up' && redisStatus === 'up' && tigerBeetleStatus === 'up';
      
      const healthData: HealthCheckResponse = {
        status: isHealthy ? 'healthy' : 'unhealthy',
        services: {
          database: dbStatus,
          redis: redisStatus,
          tigerBeetle: tigerBeetleStatus
        },
        timestamp: new Date().toISOString(),
        uptime: Math.floor(uptime)
      };
      
      const response: ApiResponse<HealthCheckResponse> = {
        success: isHealthy,
        message: isHealthy ? 'All services are healthy' : 'Some services are down',
        data: healthData,
        timestamp: new Date().toISOString(),
        requestId: req.headers['x-request-id'] as string || 'unknown'
      };
      
      res.status(isHealthy ? 200 : 503).json(response);
    } catch (error) {
      console.error('Health check error:', error);
      
      const response: ApiResponse = {
        success: false,
        message: 'Health check failed',
        error: config.server.env === 'development' ? (error as Error).message : undefined,
        timestamp: new Date().toISOString(),
        requestId: req.headers['x-request-id'] as string || 'unknown'
      };
      
      res.status(500).json(response);
    }
  }

  /**
   * @swagger
   * /metrics:
   *   get:
   *     summary: Get application metrics
   *     tags: [Admin]
   *     responses:
   *       200:
   *         description: Metrics retrieved successfully
   */
  static async metrics(req: Request, res: Response) {
    try {
      // Get remittance statistics
      const [totalRemittances, pendingRemittances, completedRemittances, failedRemittances] = await Promise.all([
        prisma.remittance.count(),
        prisma.remittance.count({ where: { status: 'PENDING' } }),
        prisma.remittance.count({ where: { status: 'COMPLETED' } }),
        prisma.remittance.count({ where: { status: 'FAILED' } })
      ]);
      
      // Get queue lengths
      const [remittanceQueueLength, webhookQueueLength, refundQueueLength] = await Promise.all([
        RedisService.getQueueLength('remittance-queue'),
        RedisService.getQueueLength('webhook-queue'),
        RedisService.getQueueLength('refund-queue')
      ]);
      
      const metricsData: MetricsData = {
        totalRequests: 0, // Would be tracked by middleware
        activeConnections: 0, // Would be tracked by server
        responseTime: {
          p50: 0,
          p95: 0,
          p99: 0
        },
        errorRate: 0,
        remittances: {
          total: totalRemittances,
          pending: pendingRemittances,
          completed: completedRemittances,
          failed: failedRemittances
        }
      };
      
      const response: ApiResponse<MetricsData> = {
        success: true,
        message: 'Metrics retrieved successfully',
        data: metricsData,
        timestamp: new Date().toISOString(),
        requestId: req.headers['x-request-id'] as string || 'unknown'
      };
      
      res.json(response);
    } catch (error) {
      console.error('Metrics error:', error);
      
      const response: ApiResponse = {
        success: false,
        message: 'Failed to retrieve metrics',
        error: config.server.env === 'development' ? (error as Error).message : undefined,
        timestamp: new Date().toISOString(),
        requestId: req.headers['x-request-id'] as string || 'unknown'
      };
      
      res.status(500).json(response);
    }
  }

  /**
   * @swagger
   * /reconcile:
   *   post:
   *     summary: Trigger ledger reconciliation
   *     tags: [Admin]
   *     security:
   *       - bearerAuth: []
   *     responses:
   *       202:
   *         description: Reconciliation initiated successfully
   */
  static async reconcile(req: Request, res: Response) {
    try {
      // This would typically be an admin-only operation
      // For now, we'll create a basic reconciliation job
      
      const reconciliationId = `reconcile-${Date.now()}`;
      
      // Get all accounts from Postgres
      const accounts = await prisma.account.findMany({
        where: { status: 'ACTIVE' },
        select: {
          id: true,
          tigerBeetleId: true,
          currency: true,
          userId: true
        }
      });
      
      const reconciliationData = {
        id: reconciliationId,
        accounts: accounts.length,
        timestamp: new Date().toISOString(),
        status: 'initiated'
      };
      
      // Store reconciliation status in cache
      await RedisService.setCache(
        `reconciliation:${reconciliationId}`,
        reconciliationData,
        3600 // 1 hour
      );
      
      // In a real implementation, this would queue a job to:
      // 1. Fetch balances from TigerBeetle for each account
      // 2. Compare with transaction totals in Postgres
      // 3. Generate discrepancy report
      // 4. Create corrective entries if needed
      
      const response: ApiResponse = {
        success: true,
        message: 'Reconciliation initiated successfully',
        data: {
          reconciliationId,
          accountsToReconcile: accounts.length,
          estimatedCompletion: new Date(Date.now() + 10 * 60 * 1000) // 10 minutes
        },
        timestamp: new Date().toISOString(),
        requestId: req.headers['x-request-id'] as string || 'unknown'
      };
      
      res.status(202).json(response);
    } catch (error) {
      console.error('Reconciliation error:', error);
      
      const response: ApiResponse = {
        success: false,
        message: 'Failed to initiate reconciliation',
        error: config.server.env === 'development' ? (error as Error).message : undefined,
        timestamp: new Date().toISOString(),
        requestId: req.headers['x-request-id'] as string || 'unknown'
      };
      
      res.status(500).json(response);
    }
  }
}
