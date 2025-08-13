import { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import prisma from '../config/database';
import { config } from '../config';
import { ApiResponse, SendRemittanceRequest, RefundRequest, ReverseRequest, QueueJob } from '../types';
import { AuthenticatedRequest } from '../middleware/auth';
import { KafkaService } from '@/services/KafkaService';


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
      const existingRemittance = await prisma.remittance.findUnique({
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
      const senderAccount = await prisma.account.findFirst({
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
      const remittance = await prisma.remittance.create({
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
          metadata: metadata || {}
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
      
      const remittance = await prisma.remittance.findFirst({
        where: {
          id,
          senderAccount: { userId }
        },
        include: {
          senderAccount: {
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
      const remittance = await prisma.remittance.findFirst({
        where: {
          id: remittanceId,
          senderAccount: { id: userId },
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
      const remittance = await prisma.remittance.findFirst({
        where: {
          id: remittanceId,
          senderAccount: { id: userId },
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
}
