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

// Admin endpoints (require authentication)
router.use(authenticate);

// Reconciliation
router.post('/reconcile', AdminController.reconcile);

// Account management
router.get('/accounts', AdminController.listAccounts);
router.post('/accounts/:accountId/fund', AdminController.fundAccount);

export default router;
