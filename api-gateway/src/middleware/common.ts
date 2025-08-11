import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import rateLimit from 'express-rate-limit';
import { config } from '../config';

// Request ID middleware
export const requestId = (req: Request, res: Response, next: NextFunction) => {
  req.headers['x-request-id'] = req.headers['x-request-id'] || crypto.randomUUID();
  res.setHeader('x-request-id', req.headers['x-request-id']);
  next();
};

// Rate limiting
export const createRateLimit = (options?: {
  windowMs?: number;
  maxRequests?: number;
  message?: string;
}) => {
  return rateLimit({
    windowMs: options?.windowMs || config.rateLimit.windowMs,
    max: options?.maxRequests || config.rateLimit.maxRequests,
    message: {
      success: false,
      message: options?.message || 'Too many requests, please try again later',
      timestamp: new Date().toISOString(),
    },
    standardHeaders: true,
    legacyHeaders: false,
  });
};

// CORS configuration
export const corsOptions = {
  origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
    // Allow requests with no origin (mobile apps, postman, etc.)
    if (!origin) return callback(null, true);
    
    // In production, you'd check against allowed origins
    if (config.server.env === 'development') {
      return callback(null, true);
    }
    
    // Add your production domains here
    const allowedOrigins = ['https://swiftremit.com', 'https://app.swiftremit.com'];
    
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    
    return callback(new Error('Not allowed by CORS'), false);
  },
  credentials: true,
  optionsSuccessStatus: 200,
};

// Error handling middleware
export const errorHandler = (err: Error, req: Request, res: Response, next: NextFunction) => {
  console.error('Error:', err);
  
  const isDevelopment = config.server.env === 'development';
  
  res.status(500).json({
    success: false,
    message: 'Internal server error',
    error: isDevelopment ? err.message : undefined,
    stack: isDevelopment ? err.stack : undefined,
    timestamp: new Date().toISOString(),
    requestId: req.headers['x-request-id'] || 'unknown'
  });
};

// 404 handler
export const notFoundHandler = (req: Request, res: Response) => {
  res.status(404).json({
    success: false,
    message: `Route ${req.method} ${req.path} not found`,
    timestamp: new Date().toISOString(),
    requestId: req.headers['x-request-id'] || 'unknown'
  });
};
