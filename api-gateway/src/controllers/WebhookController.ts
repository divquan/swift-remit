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
      
      // Parse the body from raw buffer when using express.raw()
      let payload;
      if (Buffer.isBuffer(req.body)) {
        payload = JSON.parse(req.body.toString());
      } else {
        payload = req.body;
      }
      
      console.log("Payload:", payload);
      const signature = req.headers['x-paystack-signature'] as string;
      
      // Verify webhook signature for Paystack
      // if (provider === 'paystack' && signature && !WebhookController.verifyPaystackSignature(req.body, signature)) {
      //   const response: ApiResponse = {
      //     success: false,
      //     message: 'Invalid webhook signature',
      //     timestamp: new Date().toISOString(),
      //     requestId: req.headers['x-request-id'] as string || 'unknown'
      //   };
      //   return res.status(401).json(response);
      // }
      
      // Process webhook based on provider
      switch (provider.toLowerCase()) {
        case 'paystack':
          await WebhookController.handlePaystackWebhook(payload, req);
          break;
        case 'central-accounts':
          // No signature verification needed for our internal system
          await WebhookController.handleCentralAccountsWebhook(payload, req);
          break;
        default:
          // Verify webhook signature for other providers
          if (!WebhookController.verifyWebhookSignature(payload, signature, provider)) {
            const response: ApiResponse = {
              success: false,
              message: 'Invalid webhook signature',
              timestamp: new Date().toISOString(),
              requestId: req.headers['x-request-id'] as string || 'unknown'
            };
            return res.status(401).json(response);
          }
          await WebhookController.handleGenericWebhook(payload, provider, req);
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
  private static verifyPaystackSignature(rawBody: any, signature: string): boolean {
    if (!signature) {
      console.log('No signature provided for Paystack webhook');
      return false;
    }
    
    try {
      // Use the Paystack secret key for webhook verification
      const paystackSecret = config.paystack?.secretKey || config.security.webhookSecret;
      console.log('Using Paystack secret:', paystackSecret?.substring(0, 10) + '...');
      
      // Get the raw body string
      let bodyString: string;
      if (Buffer.isBuffer(rawBody)) {
        bodyString = rawBody.toString();
      } else if (typeof rawBody === 'string') {
        bodyString = rawBody;
      } else {
        bodyString = JSON.stringify(rawBody);
      }
      
      console.log('Body string length:', bodyString.length);
      console.log('Received signature:', signature);
      
      // Create hash using the same method as Paystack documentation
      const hash = crypto
        .createHmac('sha512', paystackSecret)
        .update(bodyString)
        .digest('hex');
      
      console.log('Computed hash:', hash);
      console.log('Signatures match:', hash === signature);
      
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
        await WebhookController.handlePaystackChargeSuccess(data, req);
        break;
      case 'transfer.success':
        await WebhookController.handlePaystackTransferSuccess(data, req);
        break;
      case 'transfer.failed':
        await WebhookController.handlePaystackTransferFailed(data, req);
        break;
      case 'charge.failed':
        await WebhookController.handlePaystackChargeFailed(data, req);
        break;
      default:
        console.log(`Unhandled Paystack webhook event: ${event}`);
    }
  }

  /**
   * Handle successful Paystack charge (card payment) - ONLY for account funding
   */
  private static async handlePaystackChargeSuccess(data: any, req: Request): Promise<void> {
    console.log('Processing Paystack charge success:', {
      reference: data.reference,
      amount: data.amount,
      requestedAmount: data.requested_amount,
      customer: data.customer?.email,
      metadata: data.metadata
    });

    const transactionId = data.metadata?.transactionId;
    const accountId = data.metadata?.accountId;
    const userId = data.metadata?.userId;
    
    // Charges should ONLY be used for account funding, not remittances
    if (!transactionId || !accountId) {
      console.log('Paystack charge success webhook missing transactionId or accountId - charges are only for account funding');
      return;
    }

    // Explicitly reject if this has remittanceId - remittances should use transfers
    if (data.metadata?.remittanceId) {
      console.log('Paystack charge success webhook has remittanceId - remittances should use transfers, not charges');
      return;
    }

    // Create webhook processing job for account funding
    const job: QueueJob = {
      id: uuidv4(),
      type: 'WEBHOOK_PROCESSING',
      data: {
        provider: 'paystack',
        event: 'charge.success',
        transactionId: transactionId || data.reference,
        accountId,
        userId,
        amount: data.amount / 100, // Convert from kobo
        requestedAmount: data.requested_amount / 100, // Convert from kobo
        currency: data.currency,
        status: 'success',
        reference: data.reference,
        paidAt: data.paidAt,
        customer: {
          id: data.customer?.id,
          email: data.customer?.email,
          customerCode: data.customer?.customer_code,
          firstName: data.customer?.first_name,
          lastName: data.customer?.last_name,
          phone: data.customer?.phone
        },
        authorization: {
          channel: data.authorization?.channel,
          bank: data.authorization?.bank,
          cardType: data.authorization?.card_type,
          last4: data.authorization?.last4,
          expMonth: data.authorization?.exp_month,
          expYear: data.authorization?.exp_year,
          countryCode: data.authorization?.country_code
        },
        metadata: {
          channel: data.channel,
          gateway_response: data.gateway_response,
          fees: data.fees / 100,
          domain: data.domain,
          source: data.source
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
   * Handle failed Paystack charge - ONLY for account funding failures
   */
  private static async handlePaystackChargeFailed(data: any, req: Request): Promise<void> {
    console.log('Processing Paystack charge failed:', {
      reference: data.reference,
      amount: data.amount,
      requestedAmount: data.requested_amount,
      customer: data.customer?.email,
      gatewayResponse: data.gateway_response,
      metadata: data.metadata
    });

    const transactionId = data.metadata?.transactionId;
    const accountId = data.metadata?.accountId;
    const userId = data.metadata?.userId;
    
    // Charges should ONLY be used for account funding, not remittances
    if (!transactionId || !accountId) {
      console.log('Paystack charge failed webhook missing transactionId or accountId - charges are only for account funding');
      return;
    }

    // Explicitly reject if this has remittanceId - remittances should use transfers
    if (data.metadata?.remittanceId) {
      console.log('Paystack charge failed webhook has remittanceId - remittances should use transfers, not charges');
      return;
    }

    // Create webhook processing job for failed account funding
    const job: QueueJob = {
      id: uuidv4(),
      type: 'WEBHOOK_PROCESSING',
      data: {
        provider: 'paystack',
        event: 'charge.failed',
        transactionId: transactionId || data.reference,
        accountId,
        userId,
        amount: data.amount / 100,
        requestedAmount: data.requested_amount / 100, // Convert from kobo
        currency: data.currency,
        status: 'failed',
        reference: data.reference,
        failureReason: data.gateway_response || 'Charge failed',
        customer: {
          id: data.customer?.id,
          email: data.customer?.email,
          customerCode: data.customer?.customer_code,
          firstName: data.customer?.first_name,
          lastName: data.customer?.last_name,
          phone: data.customer?.phone
        },
        authorization: {
          channel: data.authorization?.channel,
          bank: data.authorization?.bank,
          cardType: data.authorization?.card_type,
          last4: data.authorization?.last4,
          expMonth: data.authorization?.exp_month,
          expYear: data.authorization?.exp_year,
          countryCode: data.authorization?.country_code
        },
        metadata: {
          channel: data.channel,
          gateway_response: data.gateway_response,
          fees: data.fees / 100,
          domain: data.domain,
          source: data.source
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

  /**
   * Handle Central Accounts webhook events (our internal payment system)
   */
  private static async handleCentralAccountsWebhook(payload: any, req: Request): Promise<void> {
    const { event, ...data } = payload;
    
    console.log(`Processing Central Accounts webhook event: ${event}`, data);
    
    switch (event) {
      case 'charge.success':
        await WebhookController.handleCentralChargeSuccess(data, req);
        break;
      case 'charge.failed':
        await WebhookController.handleCentralChargeFailed(data, req);
        break;
      case 'transfer.success':
        await WebhookController.handleCentralTransferSuccess(data, req);
        break;
      case 'transfer.failed':
        await WebhookController.handleCentralTransferFailed(data, req);
        break;
      default:
        console.log(`Unhandled Central Accounts webhook event: ${event}`);
    }
  }

  /**
   * Handle successful Central Accounts charge (for account funding)
   */
  private static async handleCentralChargeSuccess(data: any, req: Request): Promise<void> {
    console.log('Processing Central Accounts charge success:', data);

    const transactionId = data.metadata?.transactionId;
    const accountId = data.metadata?.accountId;
    const userId = data.metadata?.userId;
    
    if (!transactionId || !accountId) {
      console.log('Central charge success webhook missing transactionId or accountId');
      return;
    }

    // Create webhook processing job for account funding
    const job: QueueJob = {
      id: uuidv4(),
      type: 'WEBHOOK_PROCESSING',
      data: {
        provider: 'central-accounts',
        event: 'charge.success',
        transactionId,
        accountId,
        userId,
        amount: data.amount / 100, // Convert from smallest unit
        currency: data.currency,
        status: 'success',
        reference: data.reference,
        customer: data.customer,
        authorization: data.authorization,
        metadata: data.metadata,
        timestamp: new Date().toISOString()
      }
    };

    await KafkaService.publishJob('callback-topic', job);
  }

  /**
   * Handle failed Central Accounts charge (for account funding)
   */
  private static async handleCentralChargeFailed(data: any, req: Request): Promise<void> {
    console.log('Processing Central Accounts charge failed:', data);

    const transactionId = data.metadata?.transactionId;
    const accountId = data.metadata?.accountId;
    const userId = data.metadata?.userId;
    
    if (!transactionId || !accountId) {
      console.log('Central charge failed webhook missing transactionId or accountId');
      return;
    }

    // Create webhook processing job for failed account funding
    const job: QueueJob = {
      id: uuidv4(),
      type: 'WEBHOOK_PROCESSING',
      data: {
        provider: 'central-accounts',
        event: 'charge.failed',
        transactionId,
        accountId,
        userId,
        amount: data.amount / 100,
        currency: data.currency,
        status: 'failed',
        reference: data.reference,
        failureReason: data.gateway_response || 'Charge failed',
        metadata: data.metadata,
        timestamp: new Date().toISOString()
      }
    };

    await KafkaService.publishJob('callback-topic', job);
  }

  /**
   * Handle successful Central Accounts transfer (for remittances)
   */
  private static async handleCentralTransferSuccess(data: any, req: Request): Promise<void> {
    console.log('Processing Central Accounts transfer success:', data);

    const remittanceId = data.metadata?.remittanceId;
    if (!remittanceId) {
      console.log('Central transfer success webhook missing remittanceId');
      return;
    }

    // Create webhook processing job for remittance completion
    const job: QueueJob = {
      id: uuidv4(),
      type: 'WEBHOOK_PROCESSING',
      data: {
        provider: 'central-accounts',
        event: 'transfer.success',
        remittanceId,
        transactionId: data.reference,
        amount: data.amount / 100,
        currency: data.currency,
        status: 'success',
        reference: data.reference,
        recipient: data.recipient,
        metadata: {
          transfer_code: data.transfer_code,
          transferMethod: data.metadata?.transferMethod,
          ...data.metadata
        },
        timestamp: new Date().toISOString()
      }
    };

    await KafkaService.publishJob('callback-topic', job);
  }

  /**
   * Handle failed Central Accounts transfer (for remittances)
   */
  private static async handleCentralTransferFailed(data: any, req: Request): Promise<void> {
    console.log('Processing Central Accounts transfer failed:', data);

    const remittanceId = data.metadata?.remittanceId;
    if (!remittanceId) {
      console.log('Central transfer failed webhook missing remittanceId');
      return;
    }

    // Create webhook processing job for failed remittance
    const job: QueueJob = {
      id: uuidv4(),
      type: 'WEBHOOK_PROCESSING',
      data: {
        provider: 'central-accounts',
        event: 'transfer.failed',
        remittanceId,
        transactionId: data.reference,
        amount: data.amount / 100,
        currency: data.currency,
        status: 'failed',
        reference: data.reference,
        failureReason: data.failure_reason || 'Transfer failed',
        recipient: data.recipient,
        metadata: {
          transfer_code: data.transfer_code,
          transferMethod: data.metadata?.transferMethod,
          ...data.metadata
        },
        timestamp: new Date().toISOString()
      }
    };

    await KafkaService.publishJob('callback-topic', job);
  }
}
