import { Request, Response, NextFunction } from 'express';
import { body, validationResult } from 'express-validator';
import { ApiResponse } from '../types';

export const validate = (req: Request, res: Response, next: NextFunction) => {
  const errors = validationResult(req);
  
  if (!errors.isEmpty()) {
    const response: ApiResponse = {
      success: false,
      message: 'Validation failed',
      error: errors.array().map((err: any) => `${err.path || err.param || 'field'}: ${err.msg}`).join(', '),
      timestamp: new Date().toISOString(),
      requestId: req.headers['x-request-id'] as string || 'unknown'
    };
    
    return res.status(400).json(response);
  }
  
  return next();
};

// Auth validation rules
export const signupValidation = [
  body('email').isEmail().normalizeEmail(),
  body('password').isLength({ min: 8 }).matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/),
  body('firstName').isLength({ min: 2, max: 50 }).trim(),
  body('lastName').isLength({ min: 2, max: 50 }).trim(),
  body('phoneNumber').optional().isMobilePhone('any'),
  body('countryCode').optional().isLength({ min: 2, max: 2 })
];

export const loginValidation = [
  body('email').isEmail().normalizeEmail(),
  body('password').isLength({ min: 1 })
];

// Account validation rules
export const createAccountValidation = [
  body('accountType').isIn(['PERSONAL', 'BUSINESS', 'MERCHANT']),
  body('currency').isLength({ min: 3, max: 3 }).isUppercase()
];

// Remittance validation rules
export const sendRemittanceValidation = [
  body('receiverDetails.firstName').isLength({ min: 2, max: 50 }).trim(),
  body('receiverDetails.lastName').isLength({ min: 2, max: 50 }).trim(),
  body('receiverDetails.country').isLength({ min: 2, max: 2 }),
  body('receiverDetails.email').optional().isEmail().normalizeEmail(),
  body('receiverDetails.phoneNumber').optional().isMobilePhone('any'),
  body('amount').isFloat({ min: 0.01 }),
  body('currency').isLength({ min: 3, max: 3 }).isUppercase(),
  body('convertedCurrency').optional().isLength({ min: 3, max: 3 }).isUppercase()
];

export const refundValidation = [
  body('remittanceId').isUUID(),
  body('reason').isLength({ min: 10, max: 500 }).trim(),
  body('amount').optional().isFloat({ min: 0.01 })
];

export const reverseValidation = [
  body('remittanceId').isUUID(),
  body('reason').isLength({ min: 10, max: 500 }).trim()
];
