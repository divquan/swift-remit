import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/auth';
import { ApiResponse } from '../types';
import { config } from '../config';

const router = Router();

/**
 * @swagger
 * tags:
 *   name: Exchange Rates
 *   description: Currency exchange rate operations
 */

/**
 * @swagger
 * /exchange-rates:
 *   get:
 *     summary: Get current exchange rates
 *     tags: [Exchange Rates]
 *     parameters:
 *       - in: query
 *         name: from
 *         schema:
 *           type: string
 *         description: Source currency (e.g., USD, EUR)
 *       - in: query
 *         name: to
 *         schema:
 *           type: string
 *         description: Target currency (e.g., GHS)
 *     responses:
 *       200:
 *         description: Current exchange rates
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
 *                     rates:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           fromCurrency:
 *                             type: string
 *                             example: USD
 *                           toCurrency:
 *                             type: string
 *                             example: GHS
 *                           rate:
 *                             type: number
 *                             example: 12.45
 *                           inverseRate:
 *                             type: number
 *                             example: 0.08032
 *                           validUntil:
 *                             type: string
 *                             format: date-time
 *                           spread:
 *                             type: number
 *                             description: Markup percentage
 *                             example: 2.5
 *                           lastUpdated:
 *                             type: string
 *                             format: date-time
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const { from, to } = req.query;

    // Get current exchange rates (in real implementation, fetch from FX provider)
    const currentRates = [
      {
        fromCurrency: 'USD',
        toCurrency: 'GHS',
        rate: 12.45,
        inverseRate: 0.08032,
        midMarketRate: 12.25, // Interbank rate
        spread: 1.63, // Our markup percentage
        validUntil: new Date(Date.now() + 10 * 60 * 1000).toISOString(), // Valid for 10 minutes
        lastUpdated: new Date().toISOString(),
        source: 'Bank of Ghana',
        confidence: 'high'
      },
      {
        fromCurrency: 'EUR',
        toCurrency: 'GHS',
        rate: 13.67,
        inverseRate: 0.07315,
        midMarketRate: 13.45,
        spread: 1.63,
        validUntil: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
        lastUpdated: new Date().toISOString(),
        source: 'European Central Bank',
        confidence: 'high'
      },
      {
        fromCurrency: 'GBP',
        toCurrency: 'GHS',
        rate: 15.82,
        inverseRate: 0.06321,
        midMarketRate: 15.55,
        spread: 1.74,
        validUntil: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
        lastUpdated: new Date().toISOString(),
        source: 'Bank of England',
        confidence: 'high'
      }
    ];

    // Filter rates based on query parameters
    let filteredRates = currentRates;
    if (from && to) {
      filteredRates = currentRates.filter(rate => 
        rate.fromCurrency === from.toString().toUpperCase() && 
        rate.toCurrency === to.toString().toUpperCase()
      );
    } else if (from) {
      filteredRates = currentRates.filter(rate => 
        rate.fromCurrency === from.toString().toUpperCase()
      );
    } else if (to) {
      filteredRates = currentRates.filter(rate => 
        rate.toCurrency === to.toString().toUpperCase()
      );
    }

    const response: ApiResponse = {
      success: true,
      message: 'Exchange rates retrieved successfully',
      data: {
        rates: filteredRates,
        disclaimer: 'Rates are indicative and may change. Final rate applied at transaction time.',
        rateValidityPeriod: '10 minutes',
        nextUpdate: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
        metadata: {
          totalRates: filteredRates.length,
          supportedCurrencies: {
            source: ['USD', 'EUR', 'GBP'],
            target: ['GHS']
          },
          rateProvider: 'SwiftRemit FX Engine',
          lastRefresh: new Date().toISOString()
        }
      },
      timestamp: new Date().toISOString(),
      requestId: req.headers['x-request-id'] as string || 'unknown'
    };

    return res.json(response);
  } catch (error) {
    console.error('Exchange rates error:', error);
    
    const response: ApiResponse = {
      success: false,
      message: 'Failed to fetch exchange rates',
      error: config.server.env === 'development' ? (error as Error).message : undefined,
      timestamp: new Date().toISOString(),
      requestId: req.headers['x-request-id'] as string || 'unknown'
    };
    
    return res.status(500).json(response);
  }
});

/**
 * @swagger
 * /exchange-rates/history:
 *   get:
 *     summary: Get exchange rate history for charts
 *     tags: [Exchange Rates]
 *     parameters:
 *       - in: query
 *         name: from
 *         required: true
 *         schema:
 *           type: string
 *         description: Source currency (e.g., USD)
 *       - in: query
 *         name: to
 *         required: true
 *         schema:
 *           type: string
 *         description: Target currency (e.g., GHS)
 *       - in: query
 *         name: period
 *         schema:
 *           type: string
 *           enum: [1d, 7d, 30d, 90d, 1y]
 *           default: 7d
 *         description: Historical period
 *       - in: query
 *         name: interval
 *         schema:
 *           type: string
 *           enum: [hourly, daily, weekly]
 *           default: daily
 *         description: Data point interval
 *     responses:
 *       200:
 *         description: Exchange rate history
 */
router.get('/history', async (req: Request, res: Response) => {
  try {
    const { from, to, period = '7d', interval = 'daily' } = req.query;

    if (!from || !to) {
      const response: ApiResponse = {
        success: false,
        message: 'Both from and to currencies are required',
        timestamp: new Date().toISOString(),
        requestId: req.headers['x-request-id'] as string || 'unknown'
      };
      return res.status(400).json(response);
    }

    // Generate sample historical data (in real implementation, fetch from database/FX provider)
    const generateHistoricalRates = (fromCur: string, toCur: string, periodStr: string) => {
      const baseRate = fromCur === 'USD' ? 12.25 : fromCur === 'EUR' ? 13.45 : 15.55;
      const days = periodStr === '1d' ? 1 : periodStr === '7d' ? 7 : periodStr === '30d' ? 30 : periodStr === '90d' ? 90 : 365;
      const points = interval === 'hourly' ? Math.min(days * 24, 168) : interval === 'daily' ? days : Math.ceil(days / 7);
      
      const history = [];
      const now = new Date();
      
      for (let i = points - 1; i >= 0; i--) {
        const date = new Date(now);
        if (interval === 'hourly') {
          date.setHours(date.getHours() - i);
        } else if (interval === 'daily') {
          date.setDate(date.getDate() - i);
        } else {
          date.setDate(date.getDate() - (i * 7));
        }
        
        // Add some realistic fluctuation
        const fluctuation = (Math.random() - 0.5) * 0.5; // ±0.25 range
        const rate = baseRate + fluctuation;
        
        history.push({
          timestamp: date.toISOString(),
          date: date.toISOString().split('T')[0],
          rate: Number(rate.toFixed(4)),
          high: Number((rate + Math.random() * 0.1).toFixed(4)),
          low: Number((rate - Math.random() * 0.1).toFixed(4)),
          volume: Math.floor(Math.random() * 1000000) + 500000, // Simulated volume
          change: i === points - 1 ? 0 : Number(((rate - baseRate) / baseRate * 100).toFixed(2))
        });
      }
      
      return history;
    };

    const historicalRates = generateHistoricalRates(
      from.toString().toUpperCase(), 
      to.toString().toUpperCase(), 
      period.toString()
    );

    // Calculate statistics
    const rates = historicalRates.map(h => h.rate);
    const minRate = Math.min(...rates);
    const maxRate = Math.max(...rates);
    const avgRate = rates.reduce((a, b) => a + b, 0) / rates.length;
    const currentRate = rates[rates.length - 1];
    const previousRate = rates[rates.length - 2] || currentRate;
    const changePercent = ((currentRate - previousRate) / previousRate) * 100;

    const response: ApiResponse = {
      success: true,
      message: 'Exchange rate history retrieved successfully',
      data: {
        fromCurrency: from.toString().toUpperCase(),
        toCurrency: to.toString().toUpperCase(),
        period: period.toString(),
        interval: interval.toString(),
        history: historicalRates,
        statistics: {
          current: Number(currentRate.toFixed(4)),
          previous: Number(previousRate.toFixed(4)),
          change: Number(changePercent.toFixed(2)),
          changeDirection: changePercent >= 0 ? 'up' : 'down',
          min: Number(minRate.toFixed(4)),
          max: Number(maxRate.toFixed(4)),
          average: Number(avgRate.toFixed(4)),
          volatility: Number((((maxRate - minRate) / avgRate) * 100).toFixed(2))
        },
        metadata: {
          dataPoints: historicalRates.length,
          timeRange: {
            from: historicalRates[0]?.timestamp,
            to: historicalRates[historicalRates.length - 1]?.timestamp
          },
          source: 'SwiftRemit Historical Data',
          lastUpdated: new Date().toISOString()
        }
      },
      timestamp: new Date().toISOString(),
      requestId: req.headers['x-request-id'] as string || 'unknown'
    };

    return res.json(response);
  } catch (error) {
    console.error('Exchange rate history error:', error);
    
    const response: ApiResponse = {
      success: false,
      message: 'Failed to fetch exchange rate history',
      error: config.server.env === 'development' ? (error as Error).message : undefined,
      timestamp: new Date().toISOString(),
      requestId: req.headers['x-request-id'] as string || 'unknown'
    };
    
    return res.status(500).json(response);
  }
});

/**
 * @swagger
 * /exchange-rates/{from}/{to}:
 *   get:
 *     summary: Get specific currency pair rate
 *     tags: [Exchange Rates]
 *     parameters:
 *       - in: path
 *         name: from
 *         required: true
 *         schema:
 *           type: string
 *         description: Source currency
 *       - in: path
 *         name: to
 *         required: true
 *         schema:
 *           type: string
 *         description: Target currency
 *     responses:
 *       200:
 *         description: Specific currency pair rate
 */
router.get('/:from/:to', async (req: Request, res: Response) => {
  try {
    const { from, to } = req.params;

    // Get specific currency pair rate
    const rateMap: { [key: string]: number } = {
      'USD_GHS': 12.45,
      'EUR_GHS': 13.67,
      'GBP_GHS': 15.82,
      'GHS_USD': 0.08032,
      'GHS_EUR': 0.07315,
      'GHS_GBP': 0.06321
    };

    const pairKey = `${from.toUpperCase()}_${to.toUpperCase()}`;
    const rate = rateMap[pairKey];

    if (!rate) {
      const response: ApiResponse = {
        success: false,
        message: `Exchange rate not available for ${from.toUpperCase()} to ${to.toUpperCase()}`,
        timestamp: new Date().toISOString(),
        requestId: req.headers['x-request-id'] as string || 'unknown'
      };
      return res.status(404).json(response);
    }

    const response: ApiResponse = {
      success: true,
      message: 'Exchange rate retrieved successfully',
      data: {
        fromCurrency: from.toUpperCase(),
        toCurrency: to.toUpperCase(),
        rate: rate,
        inverseRate: Number((1 / rate).toFixed(6)),
        validUntil: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
        lastUpdated: new Date().toISOString(),
        spread: 1.63,
        rateType: 'real-time'
      },
      timestamp: new Date().toISOString(),
      requestId: req.headers['x-request-id'] as string || 'unknown'
    };

    return res.json(response);
  } catch (error) {
    console.error('Specific rate error:', error);
    
    const response: ApiResponse = {
      success: false,
      message: 'Failed to fetch exchange rate',
      error: config.server.env === 'development' ? (error as Error).message : undefined,
      timestamp: new Date().toISOString(),
      requestId: req.headers['x-request-id'] as string || 'unknown'
    };
    
    return res.status(500).json(response);
  }
});

export default router;
