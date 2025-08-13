import { Request, Response } from 'express';
import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import prisma from '../config/database';
import { config } from '../config';
import { ApiResponse, WebhookPayload, QueueJob, ExchangeRateUpdate } from '../types';
import { KafkaService } from '../services/KafkaService';

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
      const signature = req.headers['x-paystack-signature'] as string;
      
      // Verify webhook signature for Paystack
      if (provider === 'paystack' && !this.verifyPaystackSignature(payload, signature)) {
        const response: ApiResponse = {
          success: false,
          message: 'Invalid webhook signature',
          timestamp: new Date().toISOString(),
          requestId: req.headers['x-request-id'] as string || 'unknown'
        };
        return res.status(401).json(response);
      }
      
      // Process webhook based on provider
      switch (provider.toLowerCase()) {
        case 'paystack':
          await this.handlePaystackWebhook(payload, req);
          break;
        default:
          // Verify webhook signature for other providers
          if (!this.verifyWebhookSignature(payload, signature, provider)) {
            const response: ApiResponse = {
              success: false,
              message: 'Invalid webhook signature',
              timestamp: new Date().toISOString(),
              requestId: req.headers['x-request-id'] as string || 'unknown'
            };
            return res.status(401).json(response);
          }
          await this.handleGenericWebhook(payload, provider, req);
          break;
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
      await KafkaService.publishJob('callback-topic', job);
      
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
      
      // Store rate in database for persistence
      console.log(`FX Rate updated: ${fromCurrency}/${toCurrency} = ${rate} (${provider})`);
      
      // Publish rate update to Kafka topic
      const fxRateJob: QueueJob = {
        id: uuidv4(),
        type: 'FX_RATE_UPDATE',
        data: {
          fromCurrency,
          toCurrency,
          rate,
          provider,
          timestamp: new Date().toISOString()
        }
      };
      await KafkaService.publishJob('fx-rate-updates', fxRateJob);
      
      const response: ApiResponse = {
        success: true,
        message: 'Exchange rate updated successfully',
        data: {
          fromCurrency,
          toCurrency,
          rate,
          provider
        },
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

  /**
   * Verify Paystack webhook signature
   */
  private static verifyPaystackSignature(payload: any, signature: string): boolean {
    if (!signature) return false;
    
    try {
      const payloadString = typeof payload === 'string' ? payload : JSON.stringify(payload);
      const paystackSecret = config.paystack.webhookSecret;
      
      const hash = crypto
        .createHmac('sha512', paystackSecret)
        .update(payloadString)
        .digest('hex');
      
      return hash === signature;
    } catch (error) {
      console.error('Paystack signature verification failed:', error);
      return false;
    }
  }

  /**
   * Handle Paystack webhook events
   */
  private static async handlePaystackWebhook(payload: any, req: Request): Promise<void> {
    const { event, data } = payload;
    
    switch (event) {
      case 'charge.success':
        await this.handlePaystackChargeSuccess(data, req);
        break;
      case 'transfer.success':
        await this.handlePaystackTransferSuccess(data, req);
        break;
      case 'transfer.failed':
        await this.handlePaystackTransferFailed(data, req);
        break;
      case 'charge.failed':
        await this.handlePaystackChargeFailed(data, req);
        break;
      default:
        console.log(`Unhandled Paystack webhook event: ${event}`);
    }
  }

  /**
   * Handle successful Paystack charge (card payment)
   */
  private static async handlePaystackChargeSuccess(data: any, req: Request): Promise<void> {
    const remittanceId = data.metadata?.remittanceId;
    if (!remittanceId) return;

    // Create webhook processing job
    const job: QueueJob = {
      id: uuidv4(),
      type: 'WEBHOOK_PROCESSING',
      data: {
        provider: 'paystack',
        event: 'charge.success',
        remittanceId,
        transactionId: data.reference,
        amount: data.amount / 100, // Convert from kobo
        currency: data.currency,
        status: 'success',
        metadata: {
          channel: data.channel,
          gateway_response: data.gateway_response,
          fees: data.fees / 100
        },
        timestamp: new Date().toISOString()
      }
    };

    // Queue for processing
    await KafkaService.publishJob('callback-topic', job);
  }

  /**
   * Handle successful Paystack transfer (bank transfer/mobile money)
   */
  private static async handlePaystackTransferSuccess(data: any, req: Request): Promise<void> {
    const remittanceId = data.metadata?.remittanceId;
    if (!remittanceId) return;

    // Create webhook processing job
    const job: QueueJob = {
      id: uuidv4(),
      type: 'WEBHOOK_PROCESSING',
      data: {
        provider: 'paystack',
        event: 'transfer.success',
        remittanceId,
        transactionId: data.reference,
        amount: data.amount / 100,
        currency: data.currency,
        status: 'success',
        metadata: {
          transfer_code: data.transfer_code,
          recipient: data.recipient
        },
        timestamp: new Date().toISOString()
      }
    };

    // Queue for processing
    await KafkaService.publishJob('callback-topic', job);
  }

  /**
   * Handle failed Paystack transfer
   */
  private static async handlePaystackTransferFailed(data: any, req: Request): Promise<void> {
    const remittanceId = data.metadata?.remittanceId;
    if (!remittanceId) return;

    // Create webhook processing job
    const job: QueueJob = {
      id: uuidv4(),
      type: 'WEBHOOK_PROCESSING',
      data: {
        provider: 'paystack',
        event: 'transfer.failed',
        remittanceId,
        transactionId: data.reference,
        amount: data.amount / 100,
        currency: data.currency,
        status: 'failed',
        failureReason: data.failure_reason || 'Transfer failed',
        metadata: {
          transfer_code: data.transfer_code,
          recipient: data.recipient
        },
        timestamp: new Date().toISOString()
      }
    };

    // Queue for processing
    await KafkaService.publishJob('callback-topic', job);
  }

  /**
   * Handle failed Paystack charge
   */
  private static async handlePaystackChargeFailed(data: any, req: Request): Promise<void> {
    const remittanceId = data.metadata?.remittanceId;
    if (!remittanceId) return;

    // Create webhook processing job
    const job: QueueJob = {
      id: uuidv4(),
      type: 'WEBHOOK_PROCESSING',
      data: {
        provider: 'paystack',
        event: 'charge.failed',
        remittanceId,
        transactionId: data.reference,
        amount: data.amount / 100,
        currency: data.currency,
        status: 'failed',
        failureReason: data.gateway_response || 'Charge failed',
        metadata: {
          channel: data.channel,
          gateway_response: data.gateway_response
        },
        timestamp: new Date().toISOString()
      }
    };

    // Queue for processing
    await KafkaService.publishJob('callback-topic', job);
  }

  /**
   * Handle generic webhook for other providers
   */
  private static async handleGenericWebhook(payload: any, provider: string, req: Request): Promise<void> {
    // Extract webhook data and create job
    const job: QueueJob = {
      id: uuidv4(),
      type: 'WEBHOOK_PROCESSING',
      data: {
        provider,
        payload,
        timestamp: new Date().toISOString()
      }
    };

    // Queue job to Kafka
    await KafkaService.publishJob('webhook-processing', job);
  }
}
