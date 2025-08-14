import { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import prisma from '../config/database';
import { config } from '../config';
import { ApiResponse, CreateAccountRequest, QueueJob } from '../types';
import { AuthenticatedRequest } from '../middleware/auth';


export class AccountController {
  /**
   * @swagger
   * /accounts:
   *   get:
   *     summary: Get all accounts for the authenticated user
   *     tags: [Accounts]
   *     security:
   *       - bearerAuth: []
   *     responses:
   *       200:
   *         description: User accounts retrieved successfully
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 success:
   *                   type: boolean
   *                 message:
   *                   type: string
   *                 data:
   *                   type: array
   *                   items:
   *                     type: object
   *                     properties:
   *                       id:
   *                         type: string
   *                       accountType:
   *                         type: string
   *                       currency:
   *                         type: string
   *                       balance:
   *                         type: number
   *                       status:
   *                         type: string
   *                       createdAt:
   *                         type: string
   *                 metadata:
   *                   type: object
   *                   properties:
   *                     total:
   *                       type: number
   *                     activeAccounts:
   *                       type: number
   *       401:
   *         description: Unauthorized
   */
  static async getUserAccounts(req: AuthenticatedRequest, res: Response) {
    try {
      const userId = req.user!.userId;
      
      // Get all accounts for the authenticated user
      const accounts = await prisma.accounts.findMany({
        where: {
          userId
        },
        include: {
          users: {
            select: {
              firstName: true,
              lastName: true,
              email: true
            }
          }
        },
        orderBy: {
          createdAt: 'desc'
        }
      });
      
      // Calculate metadata
      const metadata = {
        total: accounts.length,
        activeAccounts: accounts.filter((acc: any) => acc.status === 'ACTIVE').length,
        totalBalance: accounts.reduce((sum: number, acc: any) => sum + Number(acc.balance), 0),
        currencies: [...new Set(accounts.map((acc: any) => acc.currency))],
        accountTypes: [...new Set(accounts.map((acc: any) => acc.accountType))]
      };
      
      const response: ApiResponse = {
        success: true,
        message: 'User accounts retrieved successfully',
        data: {
          accounts,
          metadata
        },
        timestamp: new Date().toISOString(),
        requestId: req.headers['x-request-id'] as string
      };
      
      return res.status(200).json(response);
    } catch (error) {
      console.error('Get user accounts error:', error);
      
      const response: ApiResponse = {
        success: false,
        message: 'Failed to retrieve user accounts',
        error: config.server.env === 'development' ? (error as Error).message : undefined,
        timestamp: new Date().toISOString(),
        requestId: req.headers['x-request-id'] as string
      };
      
      return res.status(500).json(response);
    }
  }

  /**
   * @swagger
   * /accounts:
   *   post:
   *     summary: Create a new account
   *     tags: [Accounts]
   *     security:
   *       - bearerAuth: []
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required:
   *               - accountType
   *               - currency
   *             properties:
   *               accountType:
   *                 type: string
   *                 enum: [PERSONAL, BUSINESS, MERCHANT]
   *               currency:
   *                 type: string
   *                 example: GHS
   *     responses:
   *       201:
   *         description: Account created successfully
   *       400:
   *         description: Validation error
   *       401:
   *         description: Unauthorized
   */
  static async createAccount(req: AuthenticatedRequest, res: Response) {
    try {
      const { accountType, currency }: CreateAccountRequest = req.body;
      const userId = req.user!.userId;
      
      // Create account in Postgres with initial balance of 0
      const account = await prisma.accounts.create({
        data: {
          id: uuidv4(),
          userId,
          accountType,
          currency,
          balance: 0,
          status: 'ACTIVE',
          updatedAt: new Date()
        },
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
      
      const response: ApiResponse = {
        success: true,
        message: 'Account created successfully',
        data: account,
        timestamp: new Date().toISOString(),
        requestId: req.headers['x-request-id'] as string
      };
      
  return res.status(201).json(response);
    } catch (error) {
      console.error('Create account error:', error);
      
      const response: ApiResponse = {
        success: false,
        message: 'Failed to create account',
        error: config.server.env === 'development' ? (error as Error).message : undefined,
        timestamp: new Date().toISOString(),
        requestId: req.headers['x-request-id'] as string
      };
      
  return res.status(500).json(response);
    }
  }

  /**
   * @swagger
   * /accounts/{id}:
   *   get:
   *     summary: Get account information
   *     tags: [Accounts]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: string
   *     responses:
   *       200:
   *         description: Account information retrieved
   *       404:
   *         description: Account not found
   */
  static async getAccount(req: AuthenticatedRequest, res: Response) {
    try {

      console.log("Getting account information...")

      console.log(req.params, req.user?.userId)
      const { id } = req.params;
      const userId = req.user!.userId;
      
      const account = await prisma.accounts.findFirst({
        where: {
          // id,
          userId // Ensure user can only access their own accounts
        },
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
          requestId: req.headers['x-request-id'] as string
        };
        return res.status(404).json(response);
      }
      
      const response: ApiResponse = {
        success: true,
        message: 'Account retrieved successfully',
        data: account,
        timestamp: new Date().toISOString(),
        requestId: req.headers['x-request-id'] as string
      };
      
  return res.json(response);
    } catch (error) {
      console.error('Get account error:', error);
      
      const response: ApiResponse = {
        success: false,
        message: 'Failed to retrieve account',
        error: config.server.env === 'development' ? (error as Error).message : undefined,
        timestamp: new Date().toISOString(),
        requestId: req.headers['x-request-id'] as string
      };
      
  return res.status(500).json(response);
    }
  }

  /**
   * @swagger
   * /accounts/{id}/balance:
   *   get:
   *     summary: Get account balance from PostgreSQL
   *     tags: [Accounts]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: string
   *     responses:
   *       200:
   *         description: Balance retrieved successfully
   *       404:
   *         description: Account not found
   */
  static async getBalance(req: AuthenticatedRequest, res: Response) {
    try {
      const { id } = req.params;
      const userId = req.user!.userId;
      
      // Verify account ownership
      const account = await prisma.accounts.findFirst({
        where: {
          id,
          userId
        }
      });
      
      if (!account) {
        const response: ApiResponse = {
          success: false,
          message: 'Account not found',
          timestamp: new Date().toISOString(),
          requestId: req.headers['x-request-id'] as string
        };
        return res.status(404).json(response);
      }
      
      // Get balance from PostgreSQL
      const balance = {
        available: Number(account.balance),
        pending: 0, // No pending balance in simple implementation
        currency: account.currency
      };
      
      const response: ApiResponse = {
        success: true,
        message: 'Balance retrieved successfully',
        data: {
          accountId: account.id,
          balance
        },
        timestamp: new Date().toISOString(),
        requestId: req.headers['x-request-id'] as string
      };
      
      return res.json(response);
    } catch (error) {
      console.error('Get balance error:', error);
      
      const response: ApiResponse = {
        success: false,
        message: 'Failed to retrieve balance',
        error: config.server.env === 'development' ? (error as Error).message : undefined,
        timestamp: new Date().toISOString(),
        requestId: req.headers['x-request-id'] as string
      };
      
  return res.status(500).json(response);
    }
  }

  /**
   * @swagger
   * /accounts/{id}/transactions:
   *   get:
   *     summary: List account transactions
   *     tags: [Accounts]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: string
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
   *     responses:
   *       200:
   *         description: Transactions retrieved successfully
   */
  static async listTransactions(req: AuthenticatedRequest, res: Response) {
    try {
      const { id } = req.params;
      const userId = req.user!.userId;
      const page = parseInt(req.query.page as string) || 1;
      const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
      const skip = (page - 1) * limit;
      
      // Verify account ownership
      const account = await prisma.accounts.findFirst({
        where: {
          id,
          userId
        }
      });
      
      if (!account) {
        const response: ApiResponse = {
          success: false,
          message: 'Account not found',
          timestamp: new Date().toISOString(),
          requestId: req.headers['x-request-id'] as string
        };
        return res.status(404).json(response);
      }
      
      // Get transactions
      const [transactions, total] = await Promise.all([
        prisma.remittances.findMany({
          where: {
            OR: [
              { senderAccountId: id },
              { receiverAccountId: id }
            ]
          },
          orderBy: { createdAt: 'desc' },
          skip,
          take: limit,
          select: {
            id: true,
            amount: true,
            currency: true,
            convertedAmount: true,
            convertedCurrency: true,
            fee: true,
            status: true,
            createdAt: true,
            completedAt: true,
            senderAccountId: true,
            receiverAccountId: true,
            receiverDetails: true
          }
        }),
        prisma.remittances.count({
          where: {
            OR: [
              { senderAccountId: id },
              { receiverAccountId: id }
            ]
          }
        })
      ]);
      
      const response: ApiResponse = {
        success: true,
        message: 'Transactions retrieved successfully',
        data: {
          transactions,
          pagination: {
            page,
            limit,
            total,
            totalPages: Math.ceil(total / limit)
          }
        },
        timestamp: new Date().toISOString(),
        requestId: req.headers['x-request-id'] as string
      };
      
  return res.json(response);
    } catch (error) {
      console.error('List transactions error:', error);
      
      const response: ApiResponse = {
        success: false,
        message: 'Failed to retrieve transactions',
        error: config.server.env === 'development' ? (error as Error).message : undefined,
        timestamp: new Date().toISOString(),
        requestId: req.headers['x-request-id'] as string
      };
      
      return res.status(500).json(response);
    }
  }

  /**
   * @swagger
   * /accounts/{id}/fund:
   *   post:
   *     summary: Fund user account
   *     tags: [Accounts]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: string
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required:
   *               - amount
   *               - currency
   *               - paymentMethod
   *             properties:
   *               amount:
   *                 type: number
   *                 minimum: 0.01
   *                 example: 100.00
   *               currency:
   *                 type: string
   *                 example: GHS
   *               paymentMethod:
   *                 type: string
   *                 enum: [MOBILE_MONEY, BANK_TRANSFER, CARD]
   *               provider:
   *                 type: string
   *                 example: MTN
   *               phoneNumber:
   *                 type: string
   *                 example: "+233241234567"
   *     responses:
   *       200:
   *         description: Funding initiated successfully
   *       400:
   *         description: Validation error
   *       404:
   *         description: Account not found
   */
  static async fundAccount(req: AuthenticatedRequest, res: Response) {
    try {
      const { id: accountId } = req.params;
      const userId = req.user!.userId;
      const { amount, currency, paymentMethod, provider, phoneNumber } = req.body;

      // Validate amount
      if (!amount || amount <= 0) {
        const response: ApiResponse = {
          success: false,
          message: 'Amount must be greater than 0',
          timestamp: new Date().toISOString(),
          requestId: req.headers['x-request-id'] as string
        };
        return res.status(400).json(response);
      }

      // Verify account belongs to user
      const account = await prisma.accounts.findFirst({
        where: {
          id: accountId,
          userId // Ensure user can only fund their own accounts
        }
      });

      if (!account) {
        const response: ApiResponse = {
          success: false,
          message: 'Account not found or access denied',
          timestamp: new Date().toISOString(),
          requestId: req.headers['x-request-id'] as string
        };
        return res.status(404).json(response);
      }

      // Create funding transaction record
      const transaction = await prisma.transactions.create({
        data: {
          id: uuidv4(),
          creditAccountId: accountId, // For funding, this is a credit to the account
          type: 'DEPOSIT',
          amount: parseFloat(amount.toString()),
          currency,
          description: `Account funding via ${paymentMethod}`,
          status: 'PENDING',
          reference: `fund_${uuidv4()}`,
          updatedAt: new Date(),
          metadata: {
            paymentMethod,
            provider,
            phoneNumber,
            fundingType: 'USER_INITIATED'
          }
        }
      });

      // Queue payment processing job
      const kafkaService = (global as any).kafkaService;
      if (kafkaService) {
        const job: QueueJob = {
          id: transaction.id,
          type: 'PROCESS_FUNDING',
          data: {
            type: 'PROCESS_FUNDING',
            transactionId: transaction.id,
            accountId,
            userId,
            amount,
            currency,
            paymentMethod,
            provider,
            phoneNumber,
            reference: transaction.reference
          }
        };
        
        await kafkaService.publishJob('remittance-topic', job);
      }

      const response: ApiResponse = {
        success: true,
        message: 'Account funding initiated successfully',
        data: {
          transactionId: transaction.id,
          reference: transaction.reference,
          amount,
          currency,
          status: 'PENDING'
        },
        timestamp: new Date().toISOString(),
        requestId: req.headers['x-request-id'] as string
      };

      return res.json(response);
    } catch (error) {
      console.error('Fund account error:', error);
      
      const response: ApiResponse = {
        success: false,
        message: 'Failed to initiate account funding',
        error: config.server.env === 'development' ? (error as Error).message : undefined,
        timestamp: new Date().toISOString(),
        requestId: req.headers['x-request-id'] as string
      };
      
      return res.status(500).json(response);
    }
  }
}
