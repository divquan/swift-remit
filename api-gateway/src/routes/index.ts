import { Router } from 'express';
import authRoutes from './auth';
import accountRoutes from './accounts';
import remittanceRoutes from './remittance';
import webhookRoutes from './webhooks';
import adminRoutes from './admin';

const router = Router();

// API version prefix
// const API_VERSION = '/api/v1';
const API_VERSION = '';

// Mount routes
router.use(`${API_VERSION}/auth`, authRoutes);
router.use(`${API_VERSION}/accounts`, accountRoutes);
router.use(`${API_VERSION}/remittance`, remittanceRoutes);
router.use(`${API_VERSION}/webhook`, webhookRoutes);

// Admin routes (no version prefix for health checks, etc.)
router.use('/health', adminRoutes);
router.use('/metrics', adminRoutes);
router.use(`${API_VERSION}/reconcile`, adminRoutes);

// Root endpoint
router.get('/', (req, res) => {
  res.json({
    service: 'SwiftRemit API Gateway',
    version: '1.0.0',
    status: 'running',
    timestamp: new Date().toISOString(),
    documentation: '/docs'
  });
});

// API info endpoint
router.get(API_VERSION, (req, res) => {
  res.json({
    name: 'SwiftRemit API',
    version: 'v1',
    description: 'Resilient, distributed e-payment and remittance platform',
    endpoints: {
      auth: `${API_VERSION}/auth`,
      accounts: `${API_VERSION}/accounts`,
      remittance: `${API_VERSION}/remittance`,
      webhooks: `${API_VERSION}/webhook`,
      health: '/health',
      metrics: '/metrics',
      docs: '/docs'
    },
    timestamp: new Date().toISOString()
  });
});

export default router;
