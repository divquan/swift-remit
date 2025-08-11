import { Request, Response } from 'express';
import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import prisma from '../config/database';
import { config } from '../config';
import { ApiResponse, WebhookPayload, QueueJob, ExchangeRateUpdate } from '../types';
import { RedisService } from '../services/RedisService';

export class WebhookController {
  /**
   * @swagger
   * /webhook/payment/{provider}:
   *   post:
   *     summary: Receive payment provider webhooks
   *     tags: [Webhooks]
   *     parameters:
   *       - in: path
   *         name: provider
   *         required: true
   *         schema:
   *           type: string
   *           enum: [paystack, flutterwave, mtn-momo, vodacom]
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *     responses:
   *       200:
   *         description: Webhook processed successfully
   *       400:
   *         description: Invalid webhook
   *       401:
   *         description: Invalid signature
   */
  static async handleProviderWebhook(req: Request, res: Response) {
    try {
      const { provider } = req.params;
      const payload = req.body;
      const signature = req.headers['x-webhook-signature'] as string;
      
      // Verify webhook signature
      if (!this.verifyWebhookSignature(payload, signature, provider)) {
        const response: ApiResponse = {
          success: false,
          message: 'Invalid webhook signature',
          timestamp: new Date().toISOString(),
          requestId: req.headers['x-request-id'] as string || 'unknown'
        };
        return res.status(401).json(response);
      }
      
      // Create webhook processing job
      const job: QueueJob = {
        id: uuidv4(),
        type: 'WEBHOOK_PROCESSING',
        data: {
          provider,
          event: payload.event || payload.type,
          data: payload.data || payload,
          signature,
          timestamp: new Date().toISOString()
        }
      };
      
      // Queue for processing
      await RedisService.enqueueJob('webhook-queue', job);
      
      // Log audit trail
      await prisma.auditLog.create({
        data: {
          id: uuidv4(),
          action: 'WEBHOOK_RECEIVED',
          resource: 'PAYMENT_PROVIDER',
          details: {
            provider,
            event: payload.event || payload.type,
            webhookId: job.id
          },
          ipAddress: req.ip,
          userAgent: req.headers['user-agent']
        }
      });
      
      const response: ApiResponse = {
        success: true,
        message: 'Webhook received and queued for processing',
        data: { webhookId: job.id },
        timestamp: new Date().toISOString(),
        requestId: req.headers['x-request-id'] as string || 'unknown'
      };
      
  return res.json(response);
    } catch (error) {
      console.error('Webhook processing error:', error);
      
      const response: ApiResponse = {
        success: false,
        message: 'Failed to process webhook',
        error: config.server.env === 'development' ? (error as Error).message : undefined,
        timestamp: new Date().toISOString(),
        requestId: req.headers['x-request-id'] as string || 'unknown'
      };
      
  return res.status(500).json(response);
    }
  }

  /**
   * @swagger
   * /webhook/fx-rate:
   *   post:
   *     summary: Update foreign exchange rates
   *     tags: [Webhooks]
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required:
   *               - fromCurrency
   *               - toCurrency
   *               - rate
   *               - provider
   *             properties:
   *               fromCurrency:
   *                 type: string
   *               toCurrency:
   *                 type: string
   *               rate:
   *                 type: number
   *               provider:
   *                 type: string
   *     responses:
   *       200:
   *         description: Exchange rate updated successfully
   */
  static async handleFxRateUpdate(req: Request, res: Response) {
    try {
      const { fromCurrency, toCurrency, rate, provider }: ExchangeRateUpdate = req.body;
      
      // Update exchange rate in database
      const exchangeRate = await prisma.exchangeRate.upsert({
        where: {
          fromCurrency_toCurrency: {
            fromCurrency,
            toCurrency
          }
        },
        update: {
          rate,
          provider,
          updatedAt: new Date()
        },
        create: {
          id: uuidv4(),
          fromCurrency,
          toCurrency,
          rate,
          provider
        }
      });
      
      // Cache the rate for quick access
      const cacheKey = `fx-rate:${fromCurrency}:${toCurrency}`;
      await RedisService.setCache(cacheKey, {
        rate,
        provider,
        timestamp: new Date().toISOString()
      }, 300); // 5 minutes cache
      
      // Publish rate update to subscribers
      await RedisService.publish('fx-rate-updates', {
        fromCurrency,
        toCurrency,
        rate,
        provider,
        timestamp: new Date().toISOString()
      });
      
      const response: ApiResponse = {
        success: true,
        message: 'Exchange rate updated successfully',
        data: exchangeRate,
        timestamp: new Date().toISOString(),
        requestId: req.headers['x-request-id'] as string || 'unknown'
      };
      
  return res.json(response);
    } catch (error) {
      console.error('FX rate update error:', error);
      
      const response: ApiResponse = {
        success: false,
        message: 'Failed to update exchange rate',
        error: config.server.env === 'development' ? (error as Error).message : undefined,
        timestamp: new Date().toISOString(),
        requestId: req.headers['x-request-id'] as string || 'unknown'
      };
      
  return res.status(500).json(response);
    }
  }

  private static verifyWebhookSignature(payload: any, signature: string, provider: string): boolean {
    if (!signature) return false;
    
    try {
      const payloadString = typeof payload === 'string' ? payload : JSON.stringify(payload);
      
      switch (provider.toLowerCase()) {
        case 'paystack':
          const paystackHash = crypto
            .createHmac('sha512', config.security.webhookSecret)
            .update(payloadString)
            .digest('hex');
          return paystackHash === signature;
          
        case 'flutterwave':
          const flutterwaveHash = crypto
            .createHmac('sha256', config.security.webhookSecret)
            .update(payloadString)
            .digest('hex');
          return flutterwaveHash === signature;
          
        case 'mtn-momo':
        case 'vodacom':
          // Custom signature verification for mobile money providers
          const customHash = crypto
            .createHmac('sha256', config.security.webhookSecret)
            .update(payloadString)
            .digest('base64');
          return customHash === signature;
          
        default:
          // Generic HMAC verification
          const genericHash = crypto
            .createHmac('sha256', config.security.webhookSecret)
            .update(payloadString)
            .digest('hex');
          return genericHash === signature;
      }
    } catch (error) {
      console.error('Signature verification error:', error);
      return false;
    }
  }
}
