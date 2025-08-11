import { Router } from 'express';
import { AdminController } from '../controllers/AdminController';
import { authenticate } from '../middleware/auth';

const router = Router();

/**
 * @swagger
 * tags:
 *   name: Admin
 *   description: Administrative and monitoring endpoints
 */

// Health check (public endpoint)
router.get('/health', AdminController.healthCheck);

// Metrics (public endpoint for monitoring tools)
router.get('/metrics', AdminController.metrics);

// Reconciliation (requires authentication)
router.post('/reconcile', authenticate, AdminController.reconcile);

export default router;
