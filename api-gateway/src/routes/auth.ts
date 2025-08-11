import { Router } from 'express';
import { AuthController } from '../controllers/AuthController';
import { signupValidation, loginValidation, validate } from '../middleware/validation';
import { createRateLimit } from '../middleware/common';

const router = Router();

// Rate limiting for auth endpoints
const authRateLimit = createRateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  maxRequests: 10, // 10 attempts per window
  message: 'Too many authentication attempts, please try again later'
});

/**
 * @swagger
 * components:
 *   securitySchemes:
 *     bearerAuth:
 *       type: http
 *       scheme: bearer
 *       bearerFormat: JWT
 */

/**
 * @swagger
 * tags:
 *   name: Authentication
 *   description: User authentication and authorization
 */

// User registration
router.post('/signup', 
  authRateLimit,
  signupValidation,
  validate,
  AuthController.signup
);

// User login
router.post('/login',
  authRateLimit,
  loginValidation,
  validate,
  AuthController.login
);

export default router;
