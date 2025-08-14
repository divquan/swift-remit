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
    // For now, we'll return the list with both US and Ghana providers for backward compatibility
    const supportedBanks = [
      // US Funding Providers
      { name: 'Chase Bank', code: 'CHASE', type: 'us_bank', region: 'US', currency: 'USD', purpose: 'funding' },
      { name: 'Bank of America', code: 'BOA', type: 'us_bank', region: 'US', currency: 'USD', purpose: 'funding' },
      { name: 'Wells Fargo', code: 'WELLS_FARGO', type: 'us_bank', region: 'US', currency: 'USD', purpose: 'funding' },
      { name: 'Citibank', code: 'CITIBANK', type: 'us_bank', region: 'US', currency: 'USD', purpose: 'funding' },
      
      // US Card Providers
      { name: 'Visa', code: 'VISA', type: 'us_credit_card', region: 'US', currency: 'USD', purpose: 'funding' },
      { name: 'Mastercard', code: 'MASTERCARD', type: 'us_credit_card', region: 'US', currency: 'USD', purpose: 'funding' },
      { name: 'American Express', code: 'AMEX', type: 'us_credit_card', region: 'US', currency: 'USD', purpose: 'funding' },
      { name: 'Discover', code: 'DISCOVER', type: 'us_credit_card', region: 'US', currency: 'USD', purpose: 'funding' },
      
      // US Digital Wallets
      { name: 'PayPal', code: 'PAYPAL', type: 'digital_wallet', region: 'US', currency: 'USD', purpose: 'funding' },
      { name: 'Apple Pay', code: 'APPLE_PAY', type: 'digital_wallet', region: 'US', currency: 'USD', purpose: 'funding' },
      { name: 'Google Pay', code: 'GOOGLE_PAY', type: 'digital_wallet', region: 'US', currency: 'USD', purpose: 'funding' },
      
      // Ghana Mobile Money (for remittances)
      { name: 'MTN Mobile Money', code: 'MTN', type: 'ghana_mobile_money', region: 'Ghana', currency: 'GHS', purpose: 'remittance' },
      { name: 'Telecel Cash', code: 'TELECEL', type: 'ghana_mobile_money', region: 'Ghana', currency: 'GHS', purpose: 'remittance' },
      { name: 'AirtelTigo Money', code: 'AIRTELTIGO', type: 'ghana_mobile_money', region: 'Ghana', currency: 'GHS', purpose: 'remittance' },
      
      // Ghana Banks (for remittances)
      { name: 'Ghana Commercial Bank', code: 'GCB', type: 'ghana_bank', region: 'Ghana', currency: 'GHS', purpose: 'remittance' },
      { name: 'Ecobank Ghana', code: 'ECOBANK', type: 'ghana_bank', region: 'Ghana', currency: 'GHS', purpose: 'remittance' },
      { name: 'Zenith Bank Ghana', code: 'ZENITH', type: 'ghana_bank', region: 'Ghana', currency: 'GHS', purpose: 'remittance' },
      { name: 'United Bank for Africa Ghana', code: 'UBA', type: 'ghana_bank', region: 'Ghana', currency: 'GHS', purpose: 'remittance' },
      { name: 'Stanbic Bank Ghana', code: 'STANBIC', type: 'ghana_bank', region: 'Ghana', currency: 'GHS', purpose: 'remittance' },
      { name: 'Access Bank Ghana', code: 'ACCESS', type: 'ghana_bank', region: 'Ghana', currency: 'GHS', purpose: 'remittance' },
      { name: 'Fidelity Bank Ghana', code: 'FIDELITY', type: 'ghana_bank', region: 'Ghana', currency: 'GHS', purpose: 'remittance' }
    ];

    res.json({
      success: true,
      data: supportedBanks,
      metadata: {
        total: supportedBanks.length,
        fundingProviders: supportedBanks.filter(b => b.purpose === 'funding').length,
        remittanceProviders: supportedBanks.filter(b => b.purpose === 'remittance').length,
        usBanks: supportedBanks.filter(b => b.type === 'us_bank').length,
        usCards: supportedBanks.filter(b => b.type === 'us_credit_card').length,
        digitalWallets: supportedBanks.filter(b => b.type === 'digital_wallet').length,
        ghanaMobileMoney: supportedBanks.filter(b => b.type === 'ghana_mobile_money').length,
        ghanaBanks: supportedBanks.filter(b => b.type === 'ghana_bank').length,
        supportedCurrencies: ['USD', 'GHS'],
        supportedRegions: ['US', 'Ghana'],
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
    
    if (!['us_bank', 'us_credit_card', 'digital_wallet', 'ghana_mobile_money', 'ghana_bank', 'funding', 'remittance'].includes(type)) {
      res.status(400).json({
        success: false,
        error: 'Invalid type parameter',
        message: 'Type must be one of: us_bank, us_credit_card, digital_wallet, ghana_mobile_money, ghana_bank, funding, remittance'
      });
      return;
    }

    const allBanks = [
      // US Funding Providers
      { name: 'Chase Bank', code: 'CHASE', type: 'us_bank', region: 'US', currency: 'USD', purpose: 'funding' },
      { name: 'Bank of America', code: 'BOA', type: 'us_bank', region: 'US', currency: 'USD', purpose: 'funding' },
      { name: 'Wells Fargo', code: 'WELLS_FARGO', type: 'us_bank', region: 'US', currency: 'USD', purpose: 'funding' },
      { name: 'Citibank', code: 'CITIBANK', type: 'us_bank', region: 'US', currency: 'USD', purpose: 'funding' },
      
      // US Card Providers
      { name: 'Visa', code: 'VISA', type: 'us_credit_card', region: 'US', currency: 'USD', purpose: 'funding' },
      { name: 'Mastercard', code: 'MASTERCARD', type: 'us_credit_card', region: 'US', currency: 'USD', purpose: 'funding' },
      { name: 'American Express', code: 'AMEX', type: 'us_credit_card', region: 'US', currency: 'USD', purpose: 'funding' },
      { name: 'Discover', code: 'DISCOVER', type: 'us_credit_card', region: 'US', currency: 'USD', purpose: 'funding' },
      
      // US Digital Wallets
      { name: 'PayPal', code: 'PAYPAL', type: 'digital_wallet', region: 'US', currency: 'USD', purpose: 'funding' },
      { name: 'Apple Pay', code: 'APPLE_PAY', type: 'digital_wallet', region: 'US', currency: 'USD', purpose: 'funding' },
      { name: 'Google Pay', code: 'GOOGLE_PAY', type: 'digital_wallet', region: 'US', currency: 'USD', purpose: 'funding' },
      
      // Ghana Mobile Money (for remittances)
      { name: 'MTN Mobile Money', code: 'MTN', type: 'ghana_mobile_money', region: 'Ghana', currency: 'GHS', purpose: 'remittance' },
      { name: 'Telecel Cash', code: 'TELECEL', type: 'ghana_mobile_money', region: 'Ghana', currency: 'GHS', purpose: 'remittance' },
      { name: 'AirtelTigo Money', code: 'AIRTELTIGO', type: 'ghana_mobile_money', region: 'Ghana', currency: 'GHS', purpose: 'remittance' },
      
      // Ghana Banks (for remittances)
      { name: 'Ghana Commercial Bank', code: 'GCB', type: 'ghana_bank', region: 'Ghana', currency: 'GHS', purpose: 'remittance' },
      { name: 'Ecobank Ghana', code: 'ECOBANK', type: 'ghana_bank', region: 'Ghana', currency: 'GHS', purpose: 'remittance' },
      { name: 'Zenith Bank Ghana', code: 'ZENITH', type: 'ghana_bank', region: 'Ghana', currency: 'GHS', purpose: 'remittance' },
      { name: 'United Bank for Africa Ghana', code: 'UBA', type: 'ghana_bank', region: 'Ghana', currency: 'GHS', purpose: 'remittance' },
      { name: 'Stanbic Bank Ghana', code: 'STANBIC', type: 'ghana_bank', region: 'Ghana', currency: 'GHS', purpose: 'remittance' },
      { name: 'Access Bank Ghana', code: 'ACCESS', type: 'ghana_bank', region: 'Ghana', currency: 'GHS', purpose: 'remittance' },
      { name: 'Fidelity Bank Ghana', code: 'FIDELITY', type: 'ghana_bank', region: 'Ghana', currency: 'GHS', purpose: 'remittance' }
    ];

    const filteredBanks = allBanks.filter(bank => bank.type === type || bank.purpose === type);

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

/**
 * @swagger
 * /payment/providers:
 *   get:
 *     summary: Get all payment providers with detailed information
 *     tags: [Payment]
 *     responses:
 *       200:
 *         description: Complete list of payment providers with capabilities
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   properties:
 *                     mobileMoneyProviders:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           name:
 *                             type: string
 *                             example: MTN Mobile Money
 *                           code:
 *                             type: string
 *                             example: MTN
 *                           type:
 *                             type: string
 *                             example: mobile_money
 *                           supportsFunding:
 *                             type: boolean
 *                             example: true
 *                           supportsRemittance:
 *                             type: boolean
 *                             example: true
 *                           currency:
 *                             type: string
 *                             example: GHS
 *                           limits:
 *                             type: object
 *                             properties:
 *                               min:
 *                                 type: number
 *                                 example: 1
 *                               max:
 *                                 type: number
 *                                 example: 5000
 *                     bankProviders:
 *                       type: array
 *                       items:
 *                         type: object
 *                     cardProviders:
 *                       type: array
 *                       items:
 *                         type: object
 */
router.get('/providers', async (req: Request, res: Response) => {
  try {
    const providers = {
      // US-based funding providers (for users in US to fund their accounts)
      fundingProviders: {
        bankProviders: [
          {
            name: 'Chase Bank',
            code: 'CHASE',
            type: 'us_bank',
            supportsFunding: true,
            supportsRemittance: false,
            currency: 'USD',
            region: 'US',
            limits: {
              min: 10,
              max: 25000,
              dailyLimit: 50000,
              monthlyLimit: 200000
            },
            requirements: ['accountNumber', 'routingNumber'],
            processingTime: '1-3 business days',
            fees: {
              funding: '0.8%',
              remittance: 'Not supported'
            }
          },
          {
            name: 'Bank of America',
            code: 'BOA',
            type: 'us_bank',
            supportsFunding: true,
            supportsRemittance: false,
            currency: 'USD',
            region: 'US',
            limits: {
              min: 10,
              max: 20000,
              dailyLimit: 40000,
              monthlyLimit: 180000
            },
            requirements: ['accountNumber', 'routingNumber'],
            processingTime: '1-2 business days',
            fees: {
              funding: '0.9%',
              remittance: 'Not supported'
            }
          },
          {
            name: 'Wells Fargo',
            code: 'WELLS_FARGO',
            type: 'us_bank',
            supportsFunding: true,
            supportsRemittance: false,
            currency: 'USD',
            region: 'US',
            limits: {
              min: 10,
              max: 30000,
              dailyLimit: 60000,
              monthlyLimit: 250000
            },
            requirements: ['accountNumber', 'routingNumber'],
            processingTime: '1-3 business days',
            fees: {
              funding: '0.7%',
              remittance: 'Not supported'
            }
          },
          {
            name: 'Citibank',
            code: 'CITIBANK',
            type: 'us_bank',
            supportsFunding: true,
            supportsRemittance: false,
            currency: 'USD',
            region: 'US',
            limits: {
              min: 10,
              max: 35000,
              dailyLimit: 70000,
              monthlyLimit: 300000
            },
            requirements: ['accountNumber', 'routingNumber'],
            processingTime: '1-2 business days',
            fees: {
              funding: '0.6%',
              remittance: 'Not supported'
            }
          }
        ],
        cardProviders: [
          {
            name: 'Visa',
            code: 'VISA',
            type: 'us_credit_card',
            supportsFunding: true,
            supportsRemittance: false,
            currency: 'USD',
            region: 'US',
            limits: {
              min: 5,
              max: 5000,
              dailyLimit: 10000,
              monthlyLimit: 50000
            },
            requirements: ['cardNumber', 'expiryDate', 'cvv', 'billingAddress'],
            processingTime: 'Instant - 2 minutes',
            fees: {
              funding: '2.9%',
              remittance: 'Not supported'
            }
          },
          {
            name: 'Mastercard',
            code: 'MASTERCARD',
            type: 'us_credit_card',
            supportsFunding: true,
            supportsRemittance: false,
            currency: 'USD',
            region: 'US',
            limits: {
              min: 5,
              max: 6000,
              dailyLimit: 12000,
              monthlyLimit: 60000
            },
            requirements: ['cardNumber', 'expiryDate', 'cvv', 'billingAddress'],
            processingTime: 'Instant - 2 minutes',
            fees: {
              funding: '2.8%',
              remittance: 'Not supported'
            }
          },
          {
            name: 'American Express',
            code: 'AMEX',
            type: 'us_credit_card',
            supportsFunding: true,
            supportsRemittance: false,
            currency: 'USD',
            region: 'US',
            limits: {
              min: 10,
              max: 7500,
              dailyLimit: 15000,
              monthlyLimit: 75000
            },
            requirements: ['cardNumber', 'expiryDate', 'cvv', 'billingAddress'],
            processingTime: 'Instant - 3 minutes',
            fees: {
              funding: '3.2%',
              remittance: 'Not supported'
            }
          },
          {
            name: 'Discover',
            code: 'DISCOVER',
            type: 'us_credit_card',
            supportsFunding: true,
            supportsRemittance: false,
            currency: 'USD',
            region: 'US',
            limits: {
              min: 5,
              max: 4000,
              dailyLimit: 8000,
              monthlyLimit: 40000
            },
            requirements: ['cardNumber', 'expiryDate', 'cvv', 'billingAddress'],
            processingTime: 'Instant - 2 minutes',
            fees: {
              funding: '3.1%',
              remittance: 'Not supported'
            }
          }
        ],
        digitalWallets: [
          {
            name: 'PayPal',
            code: 'PAYPAL',
            type: 'digital_wallet',
            supportsFunding: true,
            supportsRemittance: false,
            currency: 'USD',
            region: 'US',
            limits: {
              min: 1,
              max: 10000,
              dailyLimit: 25000,
              monthlyLimit: 100000
            },
            requirements: ['paypalEmail'],
            processingTime: 'Instant - 1 minute',
            fees: {
              funding: '3.5%',
              remittance: 'Not supported'
            }
          },
          {
            name: 'Apple Pay',
            code: 'APPLE_PAY',
            type: 'digital_wallet',
            supportsFunding: true,
            supportsRemittance: false,
            currency: 'USD',
            region: 'US',
            limits: {
              min: 1,
              max: 3000,
              dailyLimit: 10000,
              monthlyLimit: 50000
            },
            requirements: ['touchId', 'faceId'],
            processingTime: 'Instant',
            fees: {
              funding: '2.5%',
              remittance: 'Not supported'
            }
          },
          {
            name: 'Google Pay',
            code: 'GOOGLE_PAY',
            type: 'digital_wallet',
            supportsFunding: true,
            supportsRemittance: false,
            currency: 'USD',
            region: 'US',
            limits: {
              min: 1,
              max: 2500,
              dailyLimit: 8000,
              monthlyLimit: 40000
            },
            requirements: ['fingerprint', 'pin'],
            processingTime: 'Instant',
            fees: {
              funding: '2.6%',
              remittance: 'Not supported'
            }
          }
        ]
      },
      // Ghana-based remittance providers (for sending money to Ghana)
      remittanceProviders: {
        mobileMoneyProviders: [
          {
            name: 'MTN Mobile Money',
            code: 'MTN',
            type: 'ghana_mobile_money',
            supportsFunding: false,
            supportsRemittance: true,
            currency: 'GHS',
            region: 'Ghana',
            limits: {
              min: 5,
              max: 20000,
              dailyLimit: 50000,
              monthlyLimit: 200000
            },
            requirements: ['receiverPhoneNumber', 'receiverName'],
            processingTime: '1-5 minutes',
            fees: {
              funding: 'Not supported',
              remittance: '1.5%'
            }
          },
          {
            name: 'Telecel Cash',
            code: 'TELECEL',
            type: 'ghana_mobile_money',
            supportsFunding: false,
            supportsRemittance: true,
            currency: 'GHS',
            region: 'Ghana',
            limits: {
              min: 5,
              max: 15000,
              dailyLimit: 40000,
              monthlyLimit: 150000
            },
            requirements: ['receiverPhoneNumber', 'receiverName'],
            processingTime: '1-5 minutes',
            fees: {
              funding: 'Not supported',
              remittance: '1.8%'
            }
          },
          {
            name: 'AirtelTigo Money',
            code: 'AIRTELTIGO',
            type: 'ghana_mobile_money',
            supportsFunding: false,
            supportsRemittance: true,
            currency: 'GHS',
            region: 'Ghana',
            limits: {
              min: 5,
              max: 12000,
              dailyLimit: 35000,
              monthlyLimit: 120000
            },
            requirements: ['receiverPhoneNumber', 'receiverName'],
            processingTime: '1-5 minutes',
            fees: {
              funding: 'Not supported',
              remittance: '2.0%'
            }
          }
        ],
        bankProviders: [
          {
            name: 'Ghana Commercial Bank',
            code: 'GCB',
            type: 'ghana_bank',
            supportsFunding: false,
            supportsRemittance: true,
            currency: 'GHS',
            region: 'Ghana',
            limits: {
              min: 20,
              max: 100000,
              dailyLimit: 500000,
              monthlyLimit: 2000000
            },
            requirements: ['receiverAccountNumber', 'receiverName', 'branchCode'],
            processingTime: '1-3 business days',
            fees: {
              funding: 'Not supported',
              remittance: '1.0%'
            }
          },
          {
            name: 'Ecobank Ghana',
            code: 'ECOBANK',
            type: 'ghana_bank',
            supportsFunding: false,
            supportsRemittance: true,
            currency: 'GHS',
            region: 'Ghana',
            limits: {
              min: 20,
              max: 75000,
              dailyLimit: 400000,
              monthlyLimit: 1500000
            },
            requirements: ['receiverAccountNumber', 'receiverName', 'branchCode'],
            processingTime: '1-2 business days',
            fees: {
              funding: 'Not supported',
              remittance: '1.2%'
            }
          },
          {
            name: 'Zenith Bank Ghana',
            code: 'ZENITH',
            type: 'ghana_bank',
            supportsFunding: false,
            supportsRemittance: true,
            currency: 'GHS',
            region: 'Ghana',
            limits: {
              min: 20,
              max: 80000,
              dailyLimit: 450000,
              monthlyLimit: 1800000
            },
            requirements: ['receiverAccountNumber', 'receiverName', 'branchCode'],
            processingTime: '1-2 business days',
            fees: {
              funding: 'Not supported',
              remittance: '1.1%'
            }
          },
          {
            name: 'United Bank for Africa Ghana',
            code: 'UBA',
            type: 'ghana_bank',
            supportsFunding: false,
            supportsRemittance: true,
            currency: 'GHS',
            region: 'Ghana',
            limits: {
              min: 20,
              max: 90000,
              dailyLimit: 500000,
              monthlyLimit: 2000000
            },
            requirements: ['receiverAccountNumber', 'receiverName', 'branchCode'],
            processingTime: '1-3 business days',
            fees: {
              funding: 'Not supported',
              remittance: '1.0%'
            }
          },
          {
            name: 'Stanbic Bank Ghana',
            code: 'STANBIC',
            type: 'ghana_bank',
            supportsFunding: false,
            supportsRemittance: true,
            currency: 'GHS',
            region: 'Ghana',
            limits: {
              min: 20,
              max: 85000,
              dailyLimit: 450000,
              monthlyLimit: 1800000
            },
            requirements: ['receiverAccountNumber', 'receiverName', 'branchCode'],
            processingTime: '1-2 business days',
            fees: {
              funding: 'Not supported',
              remittance: '1.1%'
            }
          },
          {
            name: 'Access Bank Ghana',
            code: 'ACCESS',
            type: 'ghana_bank',
            supportsFunding: false,
            supportsRemittance: true,
            currency: 'GHS',
            region: 'Ghana',
            limits: {
              min: 20,
              max: 70000,
              dailyLimit: 400000,
              monthlyLimit: 1500000
            },
            requirements: ['receiverAccountNumber', 'receiverName', 'branchCode'],
            processingTime: '1-3 business days',
            fees: {
              funding: 'Not supported',
              remittance: '1.2%'
            }
          },
          {
            name: 'Fidelity Bank Ghana',
            code: 'FIDELITY',
            type: 'ghana_bank',
            supportsFunding: false,
            supportsRemittance: true,
            currency: 'GHS',
            region: 'Ghana',
            limits: {
              min: 20,
              max: 65000,
              dailyLimit: 350000,
              monthlyLimit: 1400000
            },
            requirements: ['receiverAccountNumber', 'receiverName', 'branchCode'],
            processingTime: '1-2 business days',
            fees: {
              funding: 'Not supported',
              remittance: '1.3%'
            }
          }
        ]
      }
    };

    const summary = {
      total: providers.fundingProviders.bankProviders.length + 
             providers.fundingProviders.cardProviders.length + 
             providers.fundingProviders.digitalWallets.length +
             providers.remittanceProviders.mobileMoneyProviders.length +
             providers.remittanceProviders.bankProviders.length,
      fundingProvidersCount: providers.fundingProviders.bankProviders.length + 
                            providers.fundingProviders.cardProviders.length + 
                            providers.fundingProviders.digitalWallets.length,
      remittanceProvidersCount: providers.remittanceProviders.mobileMoneyProviders.length + 
                               providers.remittanceProviders.bankProviders.length,
      usBankCount: providers.fundingProviders.bankProviders.length,
      usCardCount: providers.fundingProviders.cardProviders.length,
      usDigitalWalletCount: providers.fundingProviders.digitalWallets.length,
      ghanaMobileMoneyCount: providers.remittanceProviders.mobileMoneyProviders.length,
      ghanaBankCount: providers.remittanceProviders.bankProviders.length,
      supportedCurrencies: ['USD', 'GHS'],
      regions: ['US', 'Ghana'],
      lastUpdated: new Date().toISOString()
    };

    res.json({
      success: true,
      data: providers,
      metadata: summary
    });
  } catch (error) {
    console.error('Error fetching providers:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch payment providers',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * @swagger
 * /payment/methods:
 *   get:
 *     summary: Get available payment methods with configuration
 *     tags: [Payment]
 *     responses:
 *       200:
 *         description: List of available payment methods
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   properties:
 *                     fundingMethods:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           method:
 *                             type: string
 *                             example: MOBILE_MONEY
 *                           displayName:
 *                             type: string
 *                             example: Mobile Money
 *                           description:
 *                             type: string
 *                             example: Fund your account using mobile money
 *                           supportedProviders:
 *                             type: array
 *                             items:
 *                               type: string
 *                             example: [MTN, TELECEL, AIRTELTIGO]
 *                           requirements:
 *                             type: array
 *                             items:
 *                               type: string
 *                             example: [phoneNumber]
 *                           processingTime:
 *                             type: string
 *                             example: 1-5 minutes
 */
router.get('/methods', async (req: Request, res: Response) => {
  try {
    const paymentMethods = {
      fundingMethods: [
        {
          method: 'US_BANK_TRANSFER',
          displayName: 'US Bank Account',
          description: 'Fund your account using your US bank account (ACH transfer)',
          icon: '🏦',
          supportedProviders: ['CHASE', 'BOA', 'WELLS_FARGO', 'CITIBANK'],
          requirements: ['accountNumber', 'routingNumber', 'accountHolderName'],
          processingTime: '1-3 business days',
          averageFee: '0.75%',
          minAmount: 10,
          maxAmount: 35000,
          currency: 'USD',
          isInstant: false,
          isAvailable: true,
          region: 'US'
        },
        {
          method: 'CREDIT_CARD',
          displayName: 'Credit/Debit Card',
          description: 'Fund your account instantly using your US credit or debit card',
          icon: '💳',
          supportedProviders: ['VISA', 'MASTERCARD', 'AMEX', 'DISCOVER'],
          requirements: ['cardNumber', 'expiryDate', 'cvv', 'billingAddress'],
          processingTime: 'Instant - 3 minutes',
          averageFee: '2.9%',
          minAmount: 5,
          maxAmount: 7500,
          currency: 'USD',
          isInstant: true,
          isAvailable: true,
          region: 'US'
        },
        {
          method: 'DIGITAL_WALLET',
          displayName: 'Digital Wallet',
          description: 'Fund your account using popular digital wallets',
          icon: '📱',
          supportedProviders: ['PAYPAL', 'APPLE_PAY', 'GOOGLE_PAY'],
          requirements: ['walletAuthentication'],
          processingTime: 'Instant - 1 minute',
          averageFee: '2.9%',
          minAmount: 1,
          maxAmount: 10000,
          currency: 'USD',
          isInstant: true,
          isAvailable: true,
          region: 'US'
        }
      ],
      remittanceMethods: [
        {
          method: 'GHANA_MOBILE_MONEY',
          displayName: 'Ghana Mobile Money',
          description: 'Send money directly to mobile money accounts in Ghana',
          icon: '📱',
          supportedProviders: ['MTN', 'TELECEL', 'AIRTELTIGO'],
          requirements: ['receiverPhoneNumber', 'receiverName'],
          processingTime: '1-5 minutes',
          averageFee: '1.8%',
          minAmount: 5,
          maxAmount: 20000,
          currency: 'GHS',
          isInstant: true,
          isAvailable: true,
          region: 'Ghana'
        },
        {
          method: 'GHANA_BANK_TRANSFER',
          displayName: 'Ghana Bank Transfer',
          description: 'Send money to bank accounts in Ghana',
          icon: '🏦',
          supportedProviders: ['GCB', 'ECOBANK', 'ZENITH', 'UBA', 'STANBIC', 'ACCESS', 'FIDELITY'],
          requirements: ['receiverAccountNumber', 'receiverName', 'bankCode', 'branchCode'],
          processingTime: '1-3 business days',
          averageFee: '1.1%',
          minAmount: 20,
          maxAmount: 100000,
          currency: 'GHS',
          isInstant: false,
          isAvailable: true,
          region: 'Ghana'
        }
      ]
    };

    const summary = {
      totalMethods: paymentMethods.fundingMethods.length + paymentMethods.remittanceMethods.length,
      fundingMethodsCount: paymentMethods.fundingMethods.length,
      remittanceMethodsCount: paymentMethods.remittanceMethods.length,
      instantMethods: [
        ...paymentMethods.fundingMethods.filter(m => m.isInstant),
        ...paymentMethods.remittanceMethods.filter(m => m.isInstant)
      ].length,
      supportedCurrencies: ['USD', 'GHS'],
      supportedRegions: ['US', 'Ghana'],
      useCase: 'US to Ghana remittances',
      lastUpdated: new Date().toISOString()
    };

    res.json({
      success: true,
      data: paymentMethods,
      metadata: summary
    });
  } catch (error) {
    console.error('Error fetching payment methods:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch payment methods',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * @swagger
 * /payment/providers/{code}:
 *   get:
 *     summary: Get detailed information about a specific provider
 *     tags: [Payment]
 *     parameters:
 *       - in: path
 *         name: code
 *         required: true
 *         schema:
 *           type: string
 *         description: Provider code (e.g., MTN, VISA, GCB)
 *     responses:
 *       200:
 *         description: Detailed provider information
 *       404:
 *         description: Provider not found
 */
router.get('/providers/:code', async (req: Request, res: Response) => {
  try {
    const { code } = req.params;
    const providerCode = code.toUpperCase();

    // Get all providers from the /providers endpoint logic
    const allProviders = [
      // US Bank Providers
      { name: 'Chase Bank', code: 'CHASE', type: 'us_bank', supportsFunding: true, supportsRemittance: false, currency: 'USD', region: 'US', limits: { min: 10, max: 25000, dailyLimit: 50000, monthlyLimit: 200000 }, requirements: ['accountNumber', 'routingNumber'], processingTime: '1-3 business days', fees: { funding: '0.8%', remittance: 'Not supported' } },
      { name: 'Bank of America', code: 'BOA', type: 'us_bank', supportsFunding: true, supportsRemittance: false, currency: 'USD', region: 'US', limits: { min: 10, max: 20000, dailyLimit: 40000, monthlyLimit: 180000 }, requirements: ['accountNumber', 'routingNumber'], processingTime: '1-2 business days', fees: { funding: '0.9%', remittance: 'Not supported' } },
      { name: 'Wells Fargo', code: 'WELLS_FARGO', type: 'us_bank', supportsFunding: true, supportsRemittance: false, currency: 'USD', region: 'US', limits: { min: 10, max: 30000, dailyLimit: 60000, monthlyLimit: 250000 }, requirements: ['accountNumber', 'routingNumber'], processingTime: '1-3 business days', fees: { funding: '0.7%', remittance: 'Not supported' } },
      { name: 'Citibank', code: 'CITIBANK', type: 'us_bank', supportsFunding: true, supportsRemittance: false, currency: 'USD', region: 'US', limits: { min: 10, max: 35000, dailyLimit: 70000, monthlyLimit: 300000 }, requirements: ['accountNumber', 'routingNumber'], processingTime: '1-2 business days', fees: { funding: '0.6%', remittance: 'Not supported' } },
      
      // US Cards
      { name: 'Visa', code: 'VISA', type: 'us_credit_card', supportsFunding: true, supportsRemittance: false, currency: 'USD', region: 'US', limits: { min: 5, max: 5000, dailyLimit: 10000, monthlyLimit: 50000 }, requirements: ['cardNumber', 'expiryDate', 'cvv', 'billingAddress'], processingTime: 'Instant - 2 minutes', fees: { funding: '2.9%', remittance: 'Not supported' } },
      { name: 'Mastercard', code: 'MASTERCARD', type: 'us_credit_card', supportsFunding: true, supportsRemittance: false, currency: 'USD', region: 'US', limits: { min: 5, max: 6000, dailyLimit: 12000, monthlyLimit: 60000 }, requirements: ['cardNumber', 'expiryDate', 'cvv', 'billingAddress'], processingTime: 'Instant - 2 minutes', fees: { funding: '2.8%', remittance: 'Not supported' } },
      { name: 'American Express', code: 'AMEX', type: 'us_credit_card', supportsFunding: true, supportsRemittance: false, currency: 'USD', region: 'US', limits: { min: 10, max: 7500, dailyLimit: 15000, monthlyLimit: 75000 }, requirements: ['cardNumber', 'expiryDate', 'cvv', 'billingAddress'], processingTime: 'Instant - 3 minutes', fees: { funding: '3.2%', remittance: 'Not supported' } },
      { name: 'Discover', code: 'DISCOVER', type: 'us_credit_card', supportsFunding: true, supportsRemittance: false, currency: 'USD', region: 'US', limits: { min: 5, max: 4000, dailyLimit: 8000, monthlyLimit: 40000 }, requirements: ['cardNumber', 'expiryDate', 'cvv', 'billingAddress'], processingTime: 'Instant - 2 minutes', fees: { funding: '3.1%', remittance: 'Not supported' } },
      
      // US Digital Wallets
      { name: 'PayPal', code: 'PAYPAL', type: 'digital_wallet', supportsFunding: true, supportsRemittance: false, currency: 'USD', region: 'US', limits: { min: 1, max: 10000, dailyLimit: 25000, monthlyLimit: 100000 }, requirements: ['paypalEmail'], processingTime: 'Instant - 1 minute', fees: { funding: '3.5%', remittance: 'Not supported' } },
      { name: 'Apple Pay', code: 'APPLE_PAY', type: 'digital_wallet', supportsFunding: true, supportsRemittance: false, currency: 'USD', region: 'US', limits: { min: 1, max: 3000, dailyLimit: 10000, monthlyLimit: 50000 }, requirements: ['touchId', 'faceId'], processingTime: 'Instant', fees: { funding: '2.5%', remittance: 'Not supported' } },
      { name: 'Google Pay', code: 'GOOGLE_PAY', type: 'digital_wallet', supportsFunding: true, supportsRemittance: false, currency: 'USD', region: 'US', limits: { min: 1, max: 2500, dailyLimit: 8000, monthlyLimit: 40000 }, requirements: ['fingerprint', 'pin'], processingTime: 'Instant', fees: { funding: '2.6%', remittance: 'Not supported' } },
      
      // Ghana Mobile Money
      { name: 'MTN Mobile Money', code: 'MTN', type: 'ghana_mobile_money', supportsFunding: false, supportsRemittance: true, currency: 'GHS', region: 'Ghana', limits: { min: 5, max: 20000, dailyLimit: 50000, monthlyLimit: 200000 }, requirements: ['receiverPhoneNumber', 'receiverName'], processingTime: '1-5 minutes', fees: { funding: 'Not supported', remittance: '1.5%' } },
      { name: 'Telecel Cash', code: 'TELECEL', type: 'ghana_mobile_money', supportsFunding: false, supportsRemittance: true, currency: 'GHS', region: 'Ghana', limits: { min: 5, max: 15000, dailyLimit: 40000, monthlyLimit: 150000 }, requirements: ['receiverPhoneNumber', 'receiverName'], processingTime: '1-5 minutes', fees: { funding: 'Not supported', remittance: '1.8%' } },
      { name: 'AirtelTigo Money', code: 'AIRTELTIGO', type: 'ghana_mobile_money', supportsFunding: false, supportsRemittance: true, currency: 'GHS', region: 'Ghana', limits: { min: 5, max: 12000, dailyLimit: 35000, monthlyLimit: 120000 }, requirements: ['receiverPhoneNumber', 'receiverName'], processingTime: '1-5 minutes', fees: { funding: 'Not supported', remittance: '2.0%' } },
      
      // Ghana Banks
      { name: 'Ghana Commercial Bank', code: 'GCB', type: 'ghana_bank', supportsFunding: false, supportsRemittance: true, currency: 'GHS', region: 'Ghana', limits: { min: 20, max: 100000, dailyLimit: 500000, monthlyLimit: 2000000 }, requirements: ['receiverAccountNumber', 'receiverName', 'branchCode'], processingTime: '1-3 business days', fees: { funding: 'Not supported', remittance: '1.0%' } },
      { name: 'Ecobank Ghana', code: 'ECOBANK', type: 'ghana_bank', supportsFunding: false, supportsRemittance: true, currency: 'GHS', region: 'Ghana', limits: { min: 20, max: 75000, dailyLimit: 400000, monthlyLimit: 1500000 }, requirements: ['receiverAccountNumber', 'receiverName', 'branchCode'], processingTime: '1-2 business days', fees: { funding: 'Not supported', remittance: '1.2%' } },
      { name: 'Zenith Bank Ghana', code: 'ZENITH', type: 'ghana_bank', supportsFunding: false, supportsRemittance: true, currency: 'GHS', region: 'Ghana', limits: { min: 20, max: 80000, dailyLimit: 450000, monthlyLimit: 1800000 }, requirements: ['receiverAccountNumber', 'receiverName', 'branchCode'], processingTime: '1-2 business days', fees: { funding: 'Not supported', remittance: '1.1%' } },
      { name: 'United Bank for Africa Ghana', code: 'UBA', type: 'ghana_bank', supportsFunding: false, supportsRemittance: true, currency: 'GHS', region: 'Ghana', limits: { min: 20, max: 90000, dailyLimit: 500000, monthlyLimit: 2000000 }, requirements: ['receiverAccountNumber', 'receiverName', 'branchCode'], processingTime: '1-3 business days', fees: { funding: 'Not supported', remittance: '1.0%' } },
      { name: 'Stanbic Bank Ghana', code: 'STANBIC', type: 'ghana_bank', supportsFunding: false, supportsRemittance: true, currency: 'GHS', region: 'Ghana', limits: { min: 20, max: 85000, dailyLimit: 450000, monthlyLimit: 1800000 }, requirements: ['receiverAccountNumber', 'receiverName', 'branchCode'], processingTime: '1-2 business days', fees: { funding: 'Not supported', remittance: '1.1%' } },
      { name: 'Access Bank Ghana', code: 'ACCESS', type: 'ghana_bank', supportsFunding: false, supportsRemittance: true, currency: 'GHS', region: 'Ghana', limits: { min: 20, max: 70000, dailyLimit: 400000, monthlyLimit: 1500000 }, requirements: ['receiverAccountNumber', 'receiverName', 'branchCode'], processingTime: '1-3 business days', fees: { funding: 'Not supported', remittance: '1.2%' } },
      { name: 'Fidelity Bank Ghana', code: 'FIDELITY', type: 'ghana_bank', supportsFunding: false, supportsRemittance: true, currency: 'GHS', region: 'Ghana', limits: { min: 20, max: 65000, dailyLimit: 350000, monthlyLimit: 1400000 }, requirements: ['receiverAccountNumber', 'receiverName', 'branchCode'], processingTime: '1-2 business days', fees: { funding: 'Not supported', remittance: '1.3%' } }
    ];

    const provider = allProviders.find(p => p.code === providerCode);

    if (!provider) {
      res.status(404).json({
        success: false,
        error: 'Provider not found',
        message: `No provider found with code: ${code}`
      });
      return;
    }

    // Add additional details for the specific provider
    const providerDetails = {
      ...provider,
      status: 'active',
      availability: {
        monday: { start: '00:00', end: '23:59' },
        tuesday: { start: '00:00', end: '23:59' },
        wednesday: { start: '00:00', end: '23:59' },
        thursday: { start: '00:00', end: '23:59' },
        friday: { start: '00:00', end: '23:59' },
        saturday: { start: '00:00', end: '23:59' },
        sunday: { start: '00:00', end: '23:59' }
      },
      maintenance: {
        scheduled: false,
        nextMaintenanceWindow: null
      },
      reliability: {
        uptime: '99.5%',
        averageResponseTime: provider.type === 'ghana_mobile_money' ? '15 seconds' : 
                           provider.type.includes('credit_card') ? '3 seconds' : 
                           provider.type === 'digital_wallet' ? '5 seconds' :
                           provider.type === 'us_bank' ? '4 hours' :
                           provider.type === 'ghana_bank' ? '6 hours' : '2 hours'
      }
    };

    res.json({
      success: true,
      data: providerDetails,
      metadata: {
        lastUpdated: new Date().toISOString(),
        requestId: uuidv4()
      }
    });
  } catch (error) {
    console.error('Error fetching provider details:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch provider details',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export default router;
