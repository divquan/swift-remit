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

// Send money
router.post('/send',
  remittanceRateLimit,
  sendRemittanceValidation,
  validate,
  RemittanceController.send
);

// Get remittance status
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
