import { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import prisma from '../config/database';
import { config } from '../config';
import { ApiResponse, CreateAccountRequest } from '../types';
import { AuthenticatedRequest } from '../middleware/auth';


export class AccountController {
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
      const account = await prisma.account.create({
        data: {
          id: uuidv4(),
          userId,
          accountType,
          currency,
          balance: 0,
          status: 'ACTIVE'
        },
        include: {
          user: {
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
      
      const account = await prisma.account.findFirst({
        where: {
          // id,
          userId // Ensure user can only access their own accounts
        },
        include: {
          user: {
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
      const account = await prisma.account.findFirst({
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
      const account = await prisma.account.findFirst({
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
        prisma.remittance.findMany({
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
        prisma.remittance.count({
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
}
