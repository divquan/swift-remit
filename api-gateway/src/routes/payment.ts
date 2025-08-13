import { Router, Request, Response } from 'express';
import { KafkaService } from '../services/KafkaService';
import { v4 as uuidv4 } from 'uuid';

const router = Router();

/**
 * @swagger
 * /payment/supported-banks:
 *   get:
 *     summary: Get list of supported banks and mobile money providers
 *     tags: [Payment]
 *     responses:
 *       200:
 *         description: List of supported payment providers
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       name:
 *                         type: string
 *                         example: MTN Mobile Money
 *                       code:
 *                         type: string
 *                         example: MTN
 *                       type:
 *                         type: string
 *                         enum: [mobile_money, bank]
 *                         example: mobile_money
 */
router.get('/supported-banks', async (req: Request, res: Response) => {
  try {
    // Request supported banks from orchestrator via Kafka
    const job = {
      id: uuidv4(),
      type: 'GET_SUPPORTED_BANKS',
      data: {
        requestId: uuidv4(),
        timestamp: new Date().toISOString()
      }
    };

    // In a real implementation, you'd send to Kafka and wait for response
    // For now, we'll return the hardcoded list directly
    const supportedBanks = [
      // Mobile Money
      { name: 'MTN Mobile Money', code: 'MTN', type: 'mobile_money' },
      { name: 'Telecel Cash', code: 'TELECEL', type: 'mobile_money' },
      { name: 'AirtelTigo Money', code: 'AIRTELTIGO', type: 'mobile_money' },
      
      // Traditional Banks
      { name: 'Ghana Commercial Bank', code: 'GCB', type: 'bank' },
      { name: 'Ecobank Ghana', code: 'ECOBANK', type: 'bank' },
      { name: 'Zenith Bank', code: 'ZENITH', type: 'bank' },
      { name: 'United Bank for Africa', code: 'UBA', type: 'bank' },
      { name: 'Stanbic Bank', code: 'STANBIC', type: 'bank' },
      { name: 'Access Bank', code: 'ACCESS', type: 'bank' },
      { name: 'Fidelity Bank', code: 'FIDELITY', type: 'bank' }
    ];

    res.json({
      success: true,
      data: supportedBanks,
      metadata: {
        total: supportedBanks.length,
        mobileMoneyProviders: supportedBanks.filter(b => b.type === 'mobile_money').length,
        banks: supportedBanks.filter(b => b.type === 'bank').length,
        lastUpdated: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('Error fetching supported banks:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch supported banks',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * @swagger
 * /payment/supported-banks/{type}:
 *   get:
 *     summary: Get supported banks filtered by type
 *     tags: [Payment]
 *     parameters:
 *       - in: path
 *         name: type
 *         required: true
 *         schema:
 *           type: string
 *           enum: [mobile_money, bank]
 *         description: Type of payment provider to filter by
 *     responses:
 *       200:
 *         description: Filtered list of supported payment providers
 *       400:
 *         description: Invalid type parameter
 */
router.get('/supported-banks/:type', async (req: Request, res: Response): Promise<void> => {
  try {
    const { type } = req.params;
    
    if (!['mobile_money', 'bank'].includes(type)) {
      res.status(400).json({
        success: false,
        error: 'Invalid type parameter',
        message: 'Type must be either "mobile_money" or "bank"'
      });
      return;
    }

    const allBanks = [
      // Mobile Money
      { name: 'MTN Mobile Money', code: 'MTN', type: 'mobile_money' },
      { name: 'Telecel Cash', code: 'TELECEL', type: 'mobile_money' },
      { name: 'AirtelTigo Money', code: 'AIRTELTIGO', type: 'mobile_money' },
      
      // Traditional Banks
      { name: 'Ghana Commercial Bank', code: 'GCB', type: 'bank' },
      { name: 'Ecobank Ghana', code: 'ECOBANK', type: 'bank' },
      { name: 'Zenith Bank', code: 'ZENITH', type: 'bank' },
      { name: 'United Bank for Africa', code: 'UBA', type: 'bank' },
      { name: 'Stanbic Bank', code: 'STANBIC', type: 'bank' },
      { name: 'Access Bank', code: 'ACCESS', type: 'bank' },
      { name: 'Fidelity Bank', code: 'FIDELITY', type: 'bank' }
    ];

    const filteredBanks = allBanks.filter(bank => bank.type === type);

    res.json({
      success: true,
      data: filteredBanks,
      metadata: {
        type,
        total: filteredBanks.length,
        lastUpdated: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('Error fetching filtered banks:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch filtered banks',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export default router;
