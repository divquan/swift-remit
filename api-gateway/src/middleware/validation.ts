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
      requestId: (req.headers['x-request-id'] as string) || 'unknown'
    };

    return res.status(400).json(response);
  }

  return next();
};

// ======================
// Auth validation rules
// ======================
export const signupValidation = [
  body('email')
    .isEmail().withMessage('Please enter a valid email address.')
    .normalizeEmail(),

  body('password')
    .isLength({ min: 8 }).withMessage('Password must be at least 8 characters long.')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])/)
    .withMessage('Password must include an uppercase letter, lowercase letter, number, and special character.'),

  body('firstName')
    .isLength({ min: 2, max: 50 }).withMessage('First name must be between 2 and 50 characters.')
    .trim(),

  body('lastName')
    .isLength({ min: 2, max: 50 }).withMessage('Last name must be between 2 and 50 characters.')
    .trim(),

  body('phoneNumber')
    .optional()
    .isMobilePhone('any').withMessage('Please enter a valid phone number.'),

  body('countryCode')
    .optional()
    .isLength({ min: 2, max: 3 }).withMessage('Country code must be 2 or 3 characters.')
];

export const loginValidation = [
  body('email')
    .isEmail().withMessage('Please enter a valid email address.')
    .normalizeEmail(),

  body('password')
    .isLength({ min: 1 }).withMessage('Password is required.')
];

// ======================
// Account validation rules
// ======================
export const createAccountValidation = [
  body('accountType')
    .isIn(['PERSONAL', 'BUSINESS', 'MERCHANT'])
    .withMessage('Account type must be PERSONAL, BUSINESS, or MERCHANT.'),

  body('currency')
    .isLength({ min: 3, max: 3 }).withMessage('Currency must be a 3-letter ISO code.')
    .isUppercase().withMessage('Currency must be in uppercase.')
];

// ======================
// Remittance validation rules
// ======================
export const sendRemittanceValidation = [
  body('receiverDetails.firstName')
    .isLength({ min: 2, max: 50 }).withMessage('Receiver first name must be between 2 and 50 characters.')
    .trim(),

  body('receiverDetails.lastName')
    .isLength({ min: 2, max: 50 }).withMessage('Receiver last name must be between 2 and 50 characters.')
    .trim(),

  body('receiverDetails.country')
    .isLength({ min: 2, max: 2 }).withMessage('Country must be a 2-letter ISO code.'),

  body('receiverDetails.email')
    .optional()
    .isEmail().withMessage('Please enter a valid email address.')
    .normalizeEmail(),

  body('receiverDetails.phoneNumber')
    .optional()
    .isMobilePhone('any').withMessage('Please enter a valid phone number.'),

  body('amount')
    .isFloat({ min: 0.01 }).withMessage('Amount must be greater than 0.'),

  body('currency')
    .isLength({ min: 3, max: 3 }).withMessage('Currency must be a 3-letter ISO code.')
    .isUppercase().withMessage('Currency must be in uppercase.'),

  body('convertedCurrency')
    .optional()
    .isLength({ min: 3, max: 3 }).withMessage('Converted currency must be a 3-letter ISO code.')
    .isUppercase().withMessage('Converted currency must be in uppercase.')
];

// ======================
// Refund validation rules
// ======================
export const refundValidation = [
  body('remittanceId')
    .isUUID().withMessage('Remittance ID must be a valid UUID.'),

  body('reason')
    .isLength({ min: 10, max: 500 }).withMessage('Reason must be between 10 and 500 characters.')
    .trim(),

  body('amount')
    .optional()
    .isFloat({ min: 0.01 }).withMessage('Refund amount must be greater than 0.')
];

// ======================
// Reverse validation rules
// ======================
export const reverseValidation = [
  body('remittanceId')
    .isUUID().withMessage('Remittance ID must be a valid UUID.'),

  body('reason')
    .isLength({ min: 10, max: 500 }).withMessage('Reason must be between 10 and 500 characters.')
    .trim()
];
