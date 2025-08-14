import { Router } from 'express';
import { RemittanceController } from '../controllers/RemittanceController';
import { authenticate } from '../middleware/auth';
import { sendRemittanceValidation, refundValidation, reverseValidation, validate } from '../middleware/validation';
import { createRateLimit } from '../middleware/common';

const router = Router();

/**
 * @swagger
 * tags:
 *   name: Remittance
 *   description: Money transfer operations
 */

// Rate limiting for remittance operations
const remittanceRateLimit = createRateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  maxRequests: 20, // 20 remittances per 5 minutes
  message: 'Too many remittance requests, please try again later'
});

// All remittance routes require authentication
router.use(authenticate);

/**
 * @swagger
 * /remittance:
 *   get:
 *     summary: List user's remittances
 *     tags: [Remittance]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [pending, processing, completed, failed, cancelled]
 *         description: Filter by remittance status
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Page number
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *         description: Number of items per page
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date
 *         description: Filter remittances from this date
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date
 *         description: Filter remittances up to this date
 *     responses:
 *       200:
 *         description: List of user's remittances
 */
router.get('/', RemittanceController.list);

/**
 * @swagger
 * /remittance/{id}:
 *   get:
 *     summary: Get specific remittance details
 *     tags: [Remittance]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Remittance ID
 *     responses:
 *       200:
 *         description: Remittance details
 */
router.get('/:id', RemittanceController.getById);

/**
 * @swagger
 * /remittance/{id}/status:
 *   get:
 *     summary: Track remittance status and timeline
 *     tags: [Remittance]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Remittance ID
 *     responses:
 *       200:
 *         description: Detailed remittance status with timeline
 */
router.get('/:id/status', RemittanceController.statusDetailed);

/**
 * @swagger
 * /remittance/estimate:
 *   post:
 *     summary: Calculate fees and exchange rate before sending
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
 *               - amount
 *               - fromCurrency
 *               - toCurrency
 *               - deliveryMethod
 *               - destination
 *             properties:
 *               amount:
 *                 type: number
 *                 description: Amount to send
 *               fromCurrency:
 *                 type: string
 *                 description: Source currency (USD, EUR, GBP)
 *               toCurrency:
 *                 type: string
 *                 description: Target currency (GHS)
 *               deliveryMethod:
 *                 type: string
 *                 enum: [mobile_money, bank_account, cash_pickup]
 *               destination:
 *                 type: string
 *                 description: Destination country (GH)
 *               paymentProvider:
 *                 type: string
 *                 description: Specific provider (optional)
 *     responses:
 *       200:
 *         description: Fee estimate and exchange rate quote
 */
router.post('/estimate', RemittanceController.estimate);

// Send money
router.post('/send',
  remittanceRateLimit,
  sendRemittanceValidation,
  validate,
  RemittanceController.send
);

// Get remittance status (legacy endpoint - keeping for backward compatibility)
router.get('/status/:id', RemittanceController.status);

// Initiate refund
router.post('/refund',
  refundValidation,
  validate,
  RemittanceController.refund
);

// Reverse transaction
router.post('/reverse',
  reverseValidation,
  validate,
  RemittanceController.reverse
);

export default router;
