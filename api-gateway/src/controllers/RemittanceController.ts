import { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import prisma from '../config/database';
import { config } from '../config';
import { ApiResponse, SendRemittanceRequest, RefundRequest, ReverseRequest, QueueJob } from '../types';
import { AuthenticatedRequest } from '../middleware/auth';
import { KafkaService } from '../services/KafkaService';


export class RemittanceController {
  /**
   * @swagger
   * /remittance/send:
   *   post:
   *     summary: Send money (domestic or cross-border)
   *     tags: [Remittance]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: header
   *         name: idempotency-key
   *         required: true
   *         schema:
   *           type: string
   *         description: Unique key to ensure idempotency of the request
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required:
   *               - receiverDetails
   *               - amount
   *               - currency
   *             properties:
   *               receiverDetails:
   *                 type: object
   *                 properties:
   *                   firstName:
   *                     type: string
   *                   lastName:
   *                     type: string
   *                   email:
   *                     type: string
   *                   phoneNumber:
   *                     type: string
   *                   country:
   *                     type: string
   *                   accountNumber:
   *                     type: string
   *                   bankCode:
   *                     type: string
   *               amount:
   *                 type: number
   *               currency:
   *                 type: string
   *               convertedCurrency:
   *                 type: string
   *               paymentProvider:
   *                 type: string
   *     responses:
   *       202:
   *         description: Remittance initiated successfully
   *       400:
   *         description: Validation error
   */
  static async send(req: AuthenticatedRequest, res: Response) {
    try {
      const {
        receiverDetails,
        amount,
        currency,
        convertedCurrency,
        paymentProvider,
        metadata
      }: SendRemittanceRequest = req.body;
      
      const userId = req.user!.userId;
      const idempotencyKey = req.headers['idempotency-key'] as string;
      
      if (!idempotencyKey) {
        const response: ApiResponse = {
          success: false,
          message: 'Idempotency key is required',
          timestamp: new Date().toISOString(),
          requestId: req.headers['x-request-id'] as string
        };
        return res.status(400).json(response);
      }
      
      // Check for existing transaction with same idempotency key
      const existingRemittance = await prisma.remittances.findUnique({
        where: { idempotencyKey }
      });
      
      if (existingRemittance) {
        const response: ApiResponse = {
          success: true,
          message: 'Remittance already exists',
          data: existingRemittance,
          timestamp: new Date().toISOString(),
          requestId: req.headers['x-request-id'] as string
        };
        return res.status(200).json(response);
      }
      
      // Get user's default account
      const senderAccount = await prisma.accounts.findFirst({
        where: {
          userId,
          currency,
          status: 'ACTIVE'
        }
      });
      
      console.log('Sender Account:', senderAccount);
      
      if (!senderAccount) {
        const response: ApiResponse = {
          success: false,
          message: `No active ${currency} account found`,
          timestamp: new Date().toISOString(),
          requestId: req.headers['x-request-id'] as string
        };
        return res.status(400).json(response);
      }
      
      // Calculate fee (simplified - would normally be more complex)
      const fee = RemittanceController.calculateFee(amount, currency, convertedCurrency);
      
      
      // Create remittance record
      const remittance = await prisma.remittances.create({
        data: {
          id: uuidv4(),
          idempotencyKey,
          senderAccountId: senderAccount.id,
          receiverDetails,
          amount,
          currency,
          convertedCurrency,
          fee,
          status: 'PENDING',
          paymentProvider,
          metadata: metadata || {},
          updatedAt: new Date()
        }
      });
      
      // Create job for orchestrator
      const job: QueueJob = {
        id: uuidv4(),
        type: 'REMITTANCE',
        data: {
          remittanceId: remittance.id,
          userId: senderAccount.userId,
          senderAccountId: senderAccount.id,
          receiverAccountId: undefined, // For external transfers
          receiverDetails,
          amount,
          currency,
          fee,
          idempotencyKey,
          metadata: {
            convertedCurrency,
            paymentProvider,
            ...metadata
          }
        }
      };
      
      // Queue job to Kafka
      await KafkaService.publishJob('remittance-topic', job);
      
      const response: ApiResponse = {
        success: true,
        message: 'Remittance initiated successfully',
        data: {
          remittanceId: remittance.id,
          status: remittance.status,
          amount: remittance.amount,
          currency: remittance.currency,
          fee: remittance.fee,
          estimatedCompletion: new Date(Date.now() + 5 * 60 * 1000) // 5 minutes
        },
        timestamp: new Date().toISOString(),
        requestId: req.headers['x-request-id'] as string
      };
      
  return res.status(202).json(response);
    } catch (error) {
      console.error('Send remittance error:', error);
      const response: ApiResponse = {
        success: false,
        message: 'Failed to initiate remittance',
        error: config.server.env === 'development' ? (error as Error).message : undefined,
        timestamp: new Date().toISOString(),
        requestId: req.headers['x-request-id'] as string
      };
      return res.status(500).json(response);
    }
  }

  /**
   * @swagger
   * /remittance/status/{id}:
   *   get:
   *     summary: Get remittance status
   *     tags: [Remittance]
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
   *         description: Status retrieved successfully
   *       404:
   *         description: Remittance not found
   */
  static async status(req: AuthenticatedRequest, res: Response) {
    try {
      const { id } = req.params;
      const userId = req.user!.userId;
      
      const remittance = await prisma.remittances.findFirst({
        where: {
          id,
          accounts_remittances_senderAccountIdToaccounts: { 
            userId 
          }
        },
        include: {
          accounts_remittances_senderAccountIdToaccounts: {
            select: {
              currency: true,
              accountType: true
            }
          }
        }
      });
      
      if (!remittance) {
        const response: ApiResponse = {
          success: false,
          message: 'Remittance not found',
          timestamp: new Date().toISOString(),
          requestId: req.headers['x-request-id'] as string
        };
        return res.status(404).json(response);
      }
      
      const response: ApiResponse = {
        success: true,
        message: 'Status retrieved successfully',
        data: remittance,
        timestamp: new Date().toISOString(),
        requestId: req.headers['x-request-id'] as string
      };
      
  return res.json(response);
    } catch (error) {
      console.error('Get remittance status error:', error);
      
      const response: ApiResponse = {
        success: false,
        message: 'Failed to retrieve status',
        error: config.server.env === 'development' ? (error as Error).message : undefined,
        timestamp: new Date().toISOString(),
        requestId: req.headers['x-request-id'] as string
      };
      
  return res.status(500).json(response);
    }
  }

  /**
   * @swagger
   * /remittance/refund:
   *   post:
   *     summary: Initiate a refund
   *     tags: [Remittance]
   *     security:
   *       - bearerAuth: []
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required:
   *               - remittanceId
   *               - reason
   *             properties:
   *               remittanceId:
   *                 type: string
   *               reason:
   *                 type: string
   *               amount:
   *                 type: number
   *     responses:
   *       202:
   *         description: Refund initiated successfully
   */
  static async refund(req: AuthenticatedRequest, res: Response) {
    try {
      const { remittanceId, reason, amount }: RefundRequest = req.body;
      const userId = req.user!.userId;
      
      // Verify remittance ownership and status
      const remittance = await prisma.remittances.findFirst({
        where: {
          id: remittanceId,
          accounts_remittances_senderAccountIdToaccounts: { 
            userId 
          },
          status: 'COMPLETED'
        }
      });
      
      if (!remittance) {
        const response: ApiResponse = {
          success: false,
          message: 'Remittance not found or cannot be refunded',
          timestamp: new Date().toISOString(),
          requestId: req.headers['x-request-id'] as string
        };
        return res.status(400).json(response);
      }
      
      const refundAmount = amount || parseFloat(remittance.amount.toString());
      
      // Create refund job
      const job: QueueJob = {
        id: uuidv4(),
        type: 'REFUND',
        data: {
          remittanceId,
          reason,
          amount: refundAmount,
          originalAmount: parseFloat(remittance.amount.toString())
        }
      };
      
      await KafkaService.publishJob('refund-topic', job);
      
      const response: ApiResponse = {
        success: true,
        message: 'Refund initiated successfully',
        data: {
          refundId: job.id,
          remittanceId,
          amount: refundAmount,
          reason
        },
        timestamp: new Date().toISOString(),
        requestId: req.headers['x-request-id'] as string
      };
      
  return res.status(202).json(response);
    } catch (error) {
      console.error('Refund error:', error);
      
      const response: ApiResponse = {
        success: false,
        message: 'Failed to initiate refund',
        error: config.server.env === 'development' ? (error as Error).message : undefined,
        timestamp: new Date().toISOString(),
        requestId: req.headers['x-request-id'] as string
      };
      
  return res.status(500).json(response);
    }
  }

  /**
   * @swagger
   * /remittance/reverse:
   *   post:
   *     summary: Reverse a pending transaction
   *     tags: [Remittance]
   *     security:
   *       - bearerAuth: []
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required:
   *               - remittanceId
   *               - reason
   *             properties:
   *               remittanceId:
   *                 type: string
   *               reason:
   *                 type: string
   *     responses:
   *       202:
   *         description: Reversal initiated successfully
   */
  static async reverse(req: AuthenticatedRequest, res: Response) {
    try {
      const { remittanceId, reason }: ReverseRequest = req.body;
      const userId = req.user!.userId;
      
      // Verify remittance ownership and status
      const remittance = await prisma.remittances.findFirst({
        where: {
          id: remittanceId,
          accounts_remittances_senderAccountIdToaccounts: { 
            userId 
          },
          status: { in: ['PENDING', 'PROCESSING'] }
        }
      });
      
      if (!remittance) {
        const response: ApiResponse = {
          success: false,
          message: 'Remittance not found or cannot be reversed',
          timestamp: new Date().toISOString(),
          requestId: req.headers['x-request-id'] as string
        };
        return res.status(400).json(response);
      }
      
      // Create reverse job
      const job: QueueJob = {
        id: uuidv4(),
        type: 'REVERSE',
        data: {
          remittanceId,
          reason
        }
      };
      
      await KafkaService.publishJob('reverse-topic', job);
      
      const response: ApiResponse = {
        success: true,
        message: 'Reversal initiated successfully',
        data: {
          reversalId: job.id,
          remittanceId,
          reason
        },
        timestamp: new Date().toISOString(),
        requestId: req.headers['x-request-id'] as string
      };
      
  return res.status(202).json(response);
    } catch (error) {
      console.error('Reverse error:', error);
      
      const response: ApiResponse = {
        success: false,
        message: 'Failed to initiate reversal',
        error: config.server.env === 'development' ? (error as Error).message : undefined,
        timestamp: new Date().toISOString(),
        requestId: req.headers['x-request-id'] as string
      };
      
  return res.status(500).json(response);
    }
  }

  private static calculateFee(amount: number, fromCurrency: string, toCurrency?: string): number {
    // Simplified fee calculation
    // In reality, this would be much more complex with different fee structures
    const baseFee = 2.0; // Base fee
    const percentageFee = amount * 0.01; // 1% of amount
    const crossBorderFee = toCurrency && toCurrency !== fromCurrency ? 5.0 : 0;
    
    return baseFee + percentageFee + crossBorderFee;
  }

  /**
   * List user's remittances with filtering and pagination
   */
  static async list(req: AuthenticatedRequest, res: Response) {
    try {
      const userId = req.user!.userId;
      const { 
        status, 
        page = 1, 
        limit = 20, 
        startDate, 
        endDate 
      } = req.query;

      const skip = (Number(page) - 1) * Number(limit);
      const take = Math.min(Number(limit), 100); // Max 100 items per page

      // Build where clause
      const where: any = { 
        accounts_remittances_senderAccountIdToaccounts: { 
          userId 
        }
      };

      if (status) {
        where.status = status;
      }

      if (startDate || endDate) {
        where.createdAt = {};
        if (startDate) {
          where.createdAt.gte = new Date(startDate as string);
        }
        if (endDate) {
          where.createdAt.lte = new Date(endDate as string);
        }
      }

      // Get remittances with pagination
      const [remittances, totalCount] = await Promise.all([
        prisma.remittances.findMany({
          where,
          skip,
          take,
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            amount: true,
            currency: true,
            convertedAmount: true,
            convertedCurrency: true,
            status: true,
            receiverDetails: true,
            paymentProvider: true,
            createdAt: true,
            updatedAt: true,
            completedAt: true,
            metadata: true
          }
        }),
        prisma.remittances.count({ where })
      ]);

      // Calculate summary statistics
      const summary = {
        totalRemittances: totalCount,
        totalSent: remittances.reduce((sum: number, r: any) => sum + Number(r.amount), 0),
        statusCounts: {
          pending: 0,
          processing: 0,
          completed: 0,
          failed: 0,
          cancelled: 0
        }
      };

      // Count statuses
      const statusCounts = await prisma.remittances.groupBy({
        by: ['status'],
        where: { 
          accounts_remittances_senderAccountIdToaccounts: { 
            userId 
          }
        },
        _count: { _all: true }
      });

      statusCounts.forEach((item: any) => {
        summary.statusCounts[item.status as keyof typeof summary.statusCounts] = item._count._all;
      });

      const response: ApiResponse = {
        success: true,
        message: 'Remittances retrieved successfully',
        data: {
          remittances,
          pagination: {
            page: Number(page),
            limit: take,
            totalItems: totalCount,
            totalPages: Math.ceil(totalCount / take),
            hasMore: skip + take < totalCount
          },
          summary
        },
        timestamp: new Date().toISOString(),
        requestId: req.headers['x-request-id'] as string || uuidv4()
      };

      return res.json(response);
    } catch (error) {
      console.error('List remittances error:', error);
      
      const response: ApiResponse = {
        success: false,
        message: 'Failed to fetch remittances',
        error: config.server.env === 'development' ? (error as Error).message : undefined,
        timestamp: new Date().toISOString(),
        requestId: req.headers['x-request-id'] as string || uuidv4()
      };
      
      return res.status(500).json(response);
    }
  }

  /**
   * Get specific remittance details by ID
   */
  static async getById(req: AuthenticatedRequest, res: Response) {
    try {
      const userId = req.user!.userId;
      const { id } = req.params;

      const remittance = await prisma.remittances.findFirst({
        where: {
          id,
          accounts_remittances_senderAccountIdToaccounts: { 
            userId 
          }
        },
        include: {
          accounts_remittances_senderAccountIdToaccounts: {
            include: {
              users: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                  email: true
                }
              }
            }
          }
        }
      });

      if (!remittance) {
        const response: ApiResponse = {
          success: false,
          message: 'Remittance not found',
          timestamp: new Date().toISOString(),
          requestId: req.headers['x-request-id'] as string || uuidv4()
        };
        return res.status(404).json(response);
      }

      // Add calculated fields
      const enrichedRemittance = {
        ...remittance,
        exchangeRate: remittance.convertedAmount ? Number(remittance.convertedAmount) / Number(remittance.amount) : null,
        fee: this.calculateFee(Number(remittance.amount), remittance.currency, remittance.convertedCurrency || undefined),
        timeInTransit: remittance.completedAt ? 
          Math.round((new Date(remittance.completedAt).getTime() - new Date(remittance.createdAt).getTime()) / (1000 * 60 * 60)) : null, // hours
        canCancel: ['PENDING', 'PROCESSING'].includes(remittance.status),
        canRefund: remittance.status === 'COMPLETED' && 
          Date.now() - new Date(remittance.completedAt || 0).getTime() < 24 * 60 * 60 * 1000, // 24 hours
      };

      const response: ApiResponse = {
        success: true,
        message: 'Remittance details retrieved successfully',
        data: enrichedRemittance,
        timestamp: new Date().toISOString(),
        requestId: req.headers['x-request-id'] as string || uuidv4()
      };

      return res.json(response);
    } catch (error) {
      console.error('Get remittance by ID error:', error);
      
      const response: ApiResponse = {
        success: false,
        message: 'Failed to fetch remittance details',
        error: config.server.env === 'development' ? (error as Error).message : undefined,
        timestamp: new Date().toISOString(),
        requestId: req.headers['x-request-id'] as string || uuidv4()
      };
      
      return res.status(500).json(response);
    }
  }

  /**
   * Get detailed status and timeline for remittance tracking
   */
  static async statusDetailed(req: AuthenticatedRequest, res: Response) {
    try {
      const userId = req.user!.userId;
      const { id } = req.params;

      const remittance = await prisma.remittances.findFirst({
        where: {
          id,
          accounts_remittances_senderAccountIdToaccounts: { 
            userId 
          }
        }
      });

      if (!remittance) {
        const response: ApiResponse = {
          success: false,
          message: 'Remittance not found',
          timestamp: new Date().toISOString(),
          requestId: req.headers['x-request-id'] as string || uuidv4()
        };
        return res.status(404).json(response);
      }

      // Generate timeline based on status and dates
      const timeline = [];
      const baseTime = new Date(remittance.createdAt);
      const receiverDetails = remittance.receiverDetails as any;
      const receiverName = `${receiverDetails?.firstName || ''} ${receiverDetails?.lastName || ''}`.trim() || 'recipient';

      // Always have these initial steps
      timeline.push({
        status: 'initiated',
        title: 'Transfer Initiated',
        description: 'Your transfer request has been received and is being processed',
        timestamp: remittance.createdAt,
        completed: true,
        icon: 'check'
      });

      timeline.push({
        status: 'verified',
        title: 'Identity Verified',
        description: 'Your identity and transfer details have been verified',
        timestamp: new Date(baseTime.getTime() + 2 * 60 * 1000).toISOString(), // +2 minutes
        completed: true,
        icon: 'shield-check'
      });

      if (['PROCESSING', 'COMPLETED'].includes(remittance.status)) {
        timeline.push({
          status: 'processing',
          title: 'Being Processed',
          description: 'Your transfer is being processed by our payment partners',
          timestamp: new Date(baseTime.getTime() + 5 * 60 * 1000).toISOString(), // +5 minutes
          completed: true,
          icon: 'clock'
        });
      } else if (remittance.status === 'PENDING') {
        timeline.push({
          status: 'processing',
          title: 'Awaiting Processing',
          description: 'Your transfer will be processed shortly',
          timestamp: null,
          completed: false,
          icon: 'clock',
          estimated: new Date(Date.now() + 10 * 60 * 1000).toISOString() // +10 minutes from now
        });
      }

      if (remittance.status === 'COMPLETED' && remittance.completedAt) {
        timeline.push({
          status: 'completed',
          title: 'Transfer Completed',
          description: `Money has been delivered to ${receiverName}`,
          timestamp: remittance.completedAt,
          completed: true,
          icon: 'check-circle'
        });
      } else if (['PROCESSING', 'PENDING'].includes(remittance.status)) {
        timeline.push({
          status: 'delivery',
          title: 'Delivering to Recipient',
          description: `Money will be delivered to ${receiverName}`,
          timestamp: null,
          completed: false,
          icon: 'truck',
          estimated: new Date(Date.now() + 30 * 60 * 1000).toISOString() // +30 minutes from now
        });
      }

      if (remittance.status === 'FAILED') {
        timeline.push({
          status: 'failed',
          title: 'Transfer Failed',
          description: 'There was an issue processing your transfer. Please contact support.',
          timestamp: remittance.updatedAt,
          completed: true,
          icon: 'x-circle',
          error: true
        });
      }

      // Calculate delivery estimate
      let deliveryEstimate = null;
      if (['PENDING', 'PROCESSING'].includes(remittance.status)) {
        const estimatedMinutes = remittance.paymentProvider === 'MTN_MOBILE_MONEY' ? 5 : 
                               remittance.paymentProvider?.includes('BANK') ? 60 : 15;
        deliveryEstimate = new Date(Date.now() + estimatedMinutes * 60 * 1000).toISOString();
      }

      const response: ApiResponse = {
        success: true,
        message: 'Remittance status retrieved successfully',
        data: {
          remittanceId: id,
          currentStatus: remittance.status,
          statusDescription: this.getStatusDescription(remittance.status),
          timeline,
          recipient: {
            name: receiverName,
            phone: receiverDetails?.phoneNumber || '',
            country: receiverDetails?.country || 'GH'
          },
          transfer: {
            amount: remittance.amount,
            currency: remittance.currency,
            convertedAmount: remittance.convertedAmount,
            convertedCurrency: remittance.convertedCurrency,
            provider: remittance.paymentProvider
          },
          timing: {
            initiated: remittance.createdAt,
            lastUpdated: remittance.updatedAt,
            completed: remittance.completedAt,
            estimatedDelivery: deliveryEstimate
          },
          actions: {
            canCancel: ['PENDING'].includes(remittance.status),
            canRefund: remittance.status === 'COMPLETED',
            contactSupport: true
          }
        },
        timestamp: new Date().toISOString(),
        requestId: req.headers['x-request-id'] as string || uuidv4()
      };

      return res.json(response);
    } catch (error) {
      console.error('Status detailed error:', error);
      
      const response: ApiResponse = {
        success: false,
        message: 'Failed to fetch remittance status',
        error: config.server.env === 'development' ? (error as Error).message : undefined,
        timestamp: new Date().toISOString(),
        requestId: req.headers['x-request-id'] as string || uuidv4()
      };
      
      return res.status(500).json(response);
    }
  }

  /**
   * Calculate fees and exchange rate estimate before sending
   */
  static async estimate(req: AuthenticatedRequest, res: Response) {
    try {
      const { 
        amount, 
        fromCurrency, 
        toCurrency, 
        deliveryMethod, 
        destination, 
        paymentProvider 
      } = req.body;

      // Validate required fields
      if (!amount || !fromCurrency || !toCurrency || !deliveryMethod || !destination) {
        const response: ApiResponse = {
          success: false,
          message: 'Missing required fields: amount, fromCurrency, toCurrency, deliveryMethod, destination',
          timestamp: new Date().toISOString(),
          requestId: req.headers['x-request-id'] as string || uuidv4()
        };
        return res.status(400).json(response);
      }

      // Get current exchange rate
      const exchangeRates: { [key: string]: number } = {
        'USD_GHS': 12.45,
        'EUR_GHS': 13.67,
        'GBP_GHS': 15.82
      };

      const rateKey = `${fromCurrency}_${toCurrency}`;
      const exchangeRate = exchangeRates[rateKey];

      if (!exchangeRate) {
        const response: ApiResponse = {
          success: false,
          message: `Exchange rate not available for ${fromCurrency} to ${toCurrency}`,
          timestamp: new Date().toISOString(),
          requestId: req.headers['x-request-id'] as string || uuidv4()
        };
        return res.status(400).json(response);
      }

      // Calculate fees based on delivery method and provider
      const baseFee = deliveryMethod === 'mobile_money' ? 2.99 : 
                     deliveryMethod === 'bank_account' ? 4.99 : 6.99; // cash_pickup
      const percentageFee = amount * 0.015; // 1.5%
      const totalFee = baseFee + percentageFee;
      
      // Provider-specific adjustments
      const providerMultiplier = paymentProvider === 'MTN_MOBILE_MONEY' ? 0.9 : 
                                paymentProvider?.includes('BANK') ? 1.1 : 1.0;
      const adjustedFee = totalFee * providerMultiplier;

      // Calculate converted amounts
      const convertedAmount = amount * exchangeRate;
      const recipientReceives = convertedAmount; // Fees deducted from sender

      // Calculate delivery time estimate
      const deliveryEstimate = deliveryMethod === 'mobile_money' ? '5-15 minutes' :
                              deliveryMethod === 'bank_account' ? '1-2 hours' : '2-4 hours';

      const response: ApiResponse = {
        success: true,
        message: 'Fee estimate calculated successfully',
        data: {
          estimate: {
            sendAmount: amount,
            sendCurrency: fromCurrency,
            receiveAmount: Number(recipientReceives.toFixed(2)),
            receiveCurrency: toCurrency,
            exchangeRate: exchangeRate,
            inverseRate: Number((1 / exchangeRate).toFixed(6)),
            fees: {
              total: Number(adjustedFee.toFixed(2)),
              breakdown: {
                baseFee: Number(baseFee.toFixed(2)),
                percentageFee: Number(percentageFee.toFixed(2)),
                providerFee: Number((adjustedFee - totalFee).toFixed(2))
              }
            },
            totalCost: Number((amount + adjustedFee).toFixed(2)),
            deliveryMethod,
            estimatedDelivery: deliveryEstimate,
            validUntil: new Date(Date.now() + 10 * 60 * 1000).toISOString() // 10 minutes
          },
          supportedProviders: this.getProvidersForDeliveryMethod(deliveryMethod, destination),
          warnings: this.getEstimateWarnings(amount, fromCurrency, toCurrency),
          compliance: {
            requiresId: amount > 1000,
            requiresPurpose: amount > 500,
            dailyLimit: 10000,
            monthlyLimit: 50000
          }
        },
        timestamp: new Date().toISOString(),
        requestId: req.headers['x-request-id'] as string || uuidv4()
      };

      return res.json(response);
    } catch (error) {
      console.error('Estimate error:', error);
      
      const response: ApiResponse = {
        success: false,
        message: 'Failed to calculate estimate',
        error: config.server.env === 'development' ? (error as Error).message : undefined,
        timestamp: new Date().toISOString(),
        requestId: req.headers['x-request-id'] as string || uuidv4()
      };
      
      return res.status(500).json(response);
    }
  }

  private static getStatusDescription(status: string): string {
    const descriptions = {
      'PENDING': 'Your transfer is being reviewed and will be processed shortly',
      'PROCESSING': 'Your transfer is currently being processed by our payment partners',
      'COMPLETED': 'Your transfer has been successfully delivered to the recipient',
      'FAILED': 'There was an issue processing your transfer. Please contact support.',
      'CANCELLED': 'This transfer has been cancelled',
      'REFUNDED': 'This transfer has been refunded to your account'
    };
    return descriptions[status as keyof typeof descriptions] || 'Status unknown';
  }

  private static getProvidersForDeliveryMethod(method: string, destination: string) {
    if (destination !== 'GH') return [];
    
    const providers = {
      mobile_money: [
        { code: 'MTN_MOBILE_MONEY', name: 'MTN Mobile Money', fee: 2.99 },
        { code: 'VODAFONE_CASH', name: 'Vodafone Cash', fee: 3.49 },
        { code: 'AIRTELTIGO_MONEY', name: 'AirtelTigo Money', fee: 3.49 }
      ],
      bank_account: [
        { code: 'GCB_BANK', name: 'GCB Bank Limited', fee: 4.99 },
        { code: 'ECOBANK_GHANA', name: 'Ecobank Ghana', fee: 5.99 },
        { code: 'STANBIC_BANK', name: 'Stanbic Bank Ghana', fee: 5.99 }
      ],
      cash_pickup: [
        { code: 'WESTERN_UNION', name: 'Western Union', fee: 6.99 },
        { code: 'MONEYGRAM', name: 'MoneyGram', fee: 7.99 }
      ]
    };

    return providers[method as keyof typeof providers] || [];
  }

  private static getEstimateWarnings(amount: number, fromCurrency: string, toCurrency: string): string[] {
    const warnings = [];
    
    if (amount > 5000) {
      warnings.push('Large transfers may require additional verification');
    }
    
    if (amount > 10000) {
      warnings.push('Transfers over $10,000 require enhanced due diligence');
    }
    
    warnings.push('Exchange rates may fluctuate. Final rate applied at transaction time.');
    warnings.push('Delivery times are estimates and may vary based on provider and local conditions.');
    
    return warnings;
  }
}
