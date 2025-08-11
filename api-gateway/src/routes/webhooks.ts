import { Router } from 'express';
import { WebhookController } from '../controllers/WebhookController';
import { createRateLimit } from '../middleware/common';

const router = Router();

/**
 * @swagger
 * tags:
 *   name: Webhooks
 *   description: Webhook endpoints for external integrations
 */

// Rate limiting for webhooks (generous since these come from external services)
const webhookRateLimit = createRateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  maxRequests: 100, // 100 webhooks per minute
  message: 'Too many webhook requests'
});

// Payment provider webhooks
router.post('/payment/:provider',
  webhookRateLimit,
  WebhookController.handleProviderWebhook
);

// Foreign exchange rate updates
router.post('/fx-rate',
  webhookRateLimit,
  WebhookController.handleFxRateUpdate
);

export default router;
