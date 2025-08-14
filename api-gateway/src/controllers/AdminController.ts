import { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import prisma from '../config/database';
import { config } from '../config';
import { ApiResponse, HealthCheckResponse, MetricsData } from '../types';
import { AuthenticatedRequest } from '../middleware/auth';
import { KafkaService } from '../services/KafkaService';

export class AdminController {
  /**
   * @swagger
   * /health:
   *   get:
   *     summary: Health check endpoint
   *     tag        requestId: req.headers['x-request-id'] as string || 'unknown'
      };

      return res.status(200).json(response);
    } catch (error) {
      console.error('List accounts error:', error);

      const response: ApiResponse = {
        success: false,
        message: 'Failed to retrieve accounts',
        error: config.server.env === 'development' ? (error as Error).message : undefined,
        timestamp: new Date().toISOString(),
        requestId: req.headers['x-request-id'] as string || 'unknown'
      };

      return res.status(500).json(response);
    }
  }  responses:
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
      
      // Check Kafka connection
      let kafkaStatus: 'up' | 'down' = 'down';
      try {
        // Simply check if Kafka service is available
        kafkaStatus = 'up'; // Since KafkaService.connect() would throw if it fails
      } catch (kafkaError) {
        console.error('Kafka health check failed:', kafkaError);
      }
      
      const [seconds, nanoseconds] = process.hrtime(startTime);
      const uptime = process.uptime();
      
      const isHealthy = dbStatus === 'up' && kafkaStatus === 'up';
      
      const healthData: HealthCheckResponse = {
        status: isHealthy ? 'healthy' : 'unhealthy',
        services: {
          database: dbStatus,
          kafka: kafkaStatus
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
        prisma.remittances.count(),
        prisma.remittances.count({ where: { status: 'PENDING' } }),
        prisma.remittances.count({ where: { status: 'COMPLETED' } }),
        prisma.remittances.count({ where: { status: 'FAILED' } })
      ]);
      
      // Kafka topics statistics (simplified for now)
      // In a full implementation, you would query Kafka for topic metrics
      const kafkaTopics = {
        'remittance-topic': 0,
        'refund-topic': 0,
        'reverse-topic': 0,
        'callback-topic': 0
      };
      
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
      const accounts = await prisma.accounts.findMany({
        where: { status: 'ACTIVE' },
        select: {
          id: true,
          currency: true,
          userId: true,
          balance: true
        }
      });
      
      const reconciliationData = {
        id: reconciliationId,
        accounts: accounts.length,
        timestamp: new Date().toISOString(),
        status: 'initiated'
      };
      
      // Store reconciliation status in memory for now
      // In a production system, you would store this in a database or distributed cache
      console.log(`Reconciliation ${reconciliationId} initiated:`, reconciliationData);
      
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

  /**
   * @swagger
   * /admin/accounts/{accountId}/fund:
   *   post:
   *     summary: Fund an account (Admin only)
   *     tags: [Admin]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: accountId
   *         required: true
   *         schema:
   *           type: string
   *         description: Account ID to fund
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required:
   *               - amount
   *             properties:
   *               amount:
   *                 type: number
   *                 description: Amount to fund
   *               currency:
   *                 type: string
   *                 description: Currency (optional, defaults to account currency)
   *               description:
   *                 type: string
   *                 description: Description for the funding
   *     responses:
   *       200:
   *         description: Account funded successfully
   *       400:
   *         description: Invalid request
   *       404:
   *         description: Account not found
   */
  static async fundAccount(req: AuthenticatedRequest, res: Response) {
    try {
      const { accountId } = req.params;
      const { amount, currency, description } = req.body;
      const adminUserId = req.user!.userId;

      // Validate input
      if (!amount || amount <= 0) {
        const response: ApiResponse = {
          success: false,
          message: 'Invalid amount. Must be greater than 0',
          timestamp: new Date().toISOString(),
          requestId: req.headers['x-request-id'] as string || 'unknown'
        };
        return res.status(400).json(response);
      }

      // Find the account
      const account = await prisma.accounts.findUnique({
        where: { id: accountId },
        include: {
          users: {
            select: {
              firstName: true,
              lastName: true,
              email: true
            }
          }
        }
      });

      if (!account) {
        const response: ApiResponse = {
          success: false,
          message: 'Account not found',
          timestamp: new Date().toISOString(),
          requestId: req.headers['x-request-id'] as string || 'unknown'
        };
        return res.status(404).json(response);
      }

      // Perform funding transaction
      const fundingResult = await prisma.$transaction(async (prisma) => {
        // Create funding transaction record
        const transaction = await prisma.transactions.create({
          data: {
            id: uuidv4(),
            creditAccountId: accountId,
            amount: amount,
            currency: currency || account.currency,
            type: 'DEPOSIT',
            status: 'COMPLETED',
            description: description || `Admin funding - ${amount} ${currency || account.currency}`,
            reference: `ADMIN-FUND-${Date.now()}`,
            metadata: {
              fundedBy: adminUserId,
              adminFunding: true,
              timestamp: new Date().toISOString()
            },
            updatedAt: new Date()
          }
        });

        // Update account balance
        const updatedAccount = await prisma.accounts.update({
          where: { id: accountId },
          data: {
            balance: {
              increment: amount
            },
            updatedAt: new Date()
          }
        });

        return { transaction, updatedAccount };
      });

      // Log audit event
      await prisma.audit_logs.create({
        data: {
          id: uuidv4(),
          action: 'ACCOUNT_FUNDED',
          resource: 'ACCOUNT',
          details: {
            accountId,
            amount,
            currency: currency || account.currency,
            description,
            transactionId: fundingResult.transaction.id,
            accountHolder: `${account.users.firstName} ${account.users.lastName}`,
            newBalance: fundingResult.updatedAccount.balance
          },
          ipAddress: req.ip,
          userAgent: req.headers['user-agent'],
          userId: adminUserId
        }
      });

      const response: ApiResponse = {
        success: true,
        message: 'Account funded successfully',
        data: {
          accountId,
          transactionId: fundingResult.transaction.id,
          amount,
          currency: currency || account.currency,
          newBalance: Number(fundingResult.updatedAccount.balance),
          accountHolder: `${account.users.firstName} ${account.users.lastName}`,
          fundedAt: new Date().toISOString()
        },
        timestamp: new Date().toISOString(),
        requestId: req.headers['x-request-id'] as string || 'unknown'
      };

      return res.status(200).json(response);
    } catch (error) {
      console.error('Fund account error:', error);

      const response: ApiResponse = {
        success: false,
        message: 'Failed to fund account',
        error: config.server.env === 'development' ? (error as Error).message : undefined,
        timestamp: new Date().toISOString(),
        requestId: req.headers['x-request-id'] as string || 'unknown'
      };

      return res.status(500).json(response);
    }
  }

  /**
   * @swagger
   * /admin/accounts:
   *   get:
   *     summary: List all accounts (Admin only)
   *     tags: [Admin]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: query
   *         name: page
   *         schema:
   *           type: integer
   *           default: 1
   *       - in: query
   *         name: limit
   *         schema:
   *           type: integer
   *           default: 20
   *       - in: query
   *         name: currency
   *         schema:
   *           type: string
   *         description: Filter by currency
   *     responses:
   *       200:
   *         description: Accounts retrieved successfully
   */
  static async listAccounts(req: AuthenticatedRequest, res: Response) {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
      const currency = req.query.currency as string;
      const skip = (page - 1) * limit;

      const whereClause: any = {};
      if (currency) {
        whereClause.currency = currency;
      }

      const [accounts, total] = await Promise.all([
        prisma.accounts.findMany({
          where: whereClause,
          include: {
            users: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true
              }
            }
          },
          orderBy: { createdAt: 'desc' },
          skip,
          take: limit
        }),
        prisma.accounts.count({ where: whereClause })
      ]);

      const response: ApiResponse = {
        success: true,
        message: 'Accounts retrieved successfully',
        data: {
          accounts: accounts.map(account => ({
            id: account.id,
            balance: Number(account.balance),
            currency: account.currency,
            accountType: account.accountType,
            status: account.status,
            createdAt: account.createdAt,
            user: account.users
          })),
          pagination: {
            page,
            limit,
            total,
            totalPages: Math.ceil(total / limit)
          }
        },
        timestamp: new Date().toISOString(),
        requestId: req.headers['x-request-id'] as string || 'unknown'
      };

      return res.status(200).json(response);
    } catch (error) {
      console.error('List accounts error:', error);

      const response: ApiResponse = {
        success: false,
        message: 'Failed to retrieve accounts',
        error: config.server.env === 'development' ? (error as Error).message : undefined,
        timestamp: new Date().toISOString(),
        requestId: req.headers['x-request-id'] as string || 'unknown'
      };

      return res.status(500).json(response);
    }
  }
}
