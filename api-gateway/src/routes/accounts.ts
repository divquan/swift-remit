import { Router } from 'express';
import { AccountController } from '../controllers/AccountController';
import { authenticate } from '../middleware/auth';
import { createAccountValidation, fundAccountValidation, validate } from '../middleware/validation';

const router = Router();

/**
 * @swagger
 * tags:
 *   name: Accounts
 *   description: Account management operations
 */

// All account routes require authentication
router.use(authenticate);

// Create new account
router.post('/',
  createAccountValidation,
  validate,
  AccountController.createAccount
);

// Get account information
router.get('/:id', AccountController.getAccount);

// Get account balance
router.get('/:id/balance', AccountController.getBalance);

// List account transactions
router.get('/:id/transactions', AccountController.listTransactions);

// Fund account
router.post('/:id/fund', 
  fundAccountValidation,
  validate,
  AccountController.fundAccount
);

export default router;
