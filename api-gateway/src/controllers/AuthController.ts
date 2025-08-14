import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import prisma from '../config/database';
import { config } from '../config';
import { ApiResponse, CreateUserRequest, LoginRequest, AuthTokenPayload } from '../types';

export class AuthController {
  /**
   * @swagger
   * /auth/signup:
   *   post:
   *     summary: Register a new user
   *     tags: [Authentication]
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required:
   *               - email
   *               - password
   *               - firstName
   *               - lastName
   *             properties:
   *               email:
   *                 type: string
   *                 format: email
   *               password:
   *                 type: string
   *                 minLength: 8
   *               firstName:
   *                 type: string
   *               lastName:
   *                 type: string
   *               phoneNumber:
   *                 type: string
   *               countryCode:
   *                 type: string
   *                 length: 2
   *     responses:
   *       201:
   *         description: User created successfully
   *       400:
   *         description: Validation error
   *       409:
   *         description: User already exists
   */
  static async signup(req: Request, res: Response) {
    try {
      const { email, password, firstName, lastName, phoneNumber, countryCode }: CreateUserRequest = req.body;
      
      // Check if user already exists
      const existingUser = await prisma.users.findUnique({
        where: { email }
      });
      
      if (existingUser) {
        const response: ApiResponse = {
          success: false,
          message: 'User with this email already exists',
          timestamp: new Date().toISOString(),
          requestId: req.headers['x-request-id'] as string
        };
        return res.status(409).json(response);
      }
      
      // Hash password
      const hashedPassword = await bcrypt.hash(password, config.security.bcryptRounds);
      
      // Create user
      const user = await prisma.users.create({
        data: {
          id: uuidv4(),
          email,
          password: hashedPassword,
          firstName,
          lastName,
          phoneNumber,
          countryCode: countryCode || 'GH'
        },
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          phoneNumber: true,
          countryCode: true,
          kycStatus: true,
          createdAt: true
        }
      });
      
      const response: ApiResponse = {
        success: true,
        message: 'User created successfully',
        data: user,
        timestamp: new Date().toISOString(),
        requestId: req.headers['x-request-id'] as string
      };
      
      return res.status(201).json(response);
    } catch (error) {
      console.error('Signup error:', error);
      
      const response: ApiResponse = {
        success: false,
        message: 'Failed to create user',
        error: config.server.env === 'development' ? (error as Error).message : undefined,
        timestamp: new Date().toISOString(),
        requestId: req.headers['x-request-id'] as string
      };
      
      return res.status(500).json(response);
    }
  }

  /**
   * @swagger
   * /auth/login:
   *   post:
   *     summary: Authenticate user and get JWT token
   *     tags: [Authentication]
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required:
   *               - email
   *               - password
   *             properties:
   *               email:
   *                 type: string
   *                 format: email
   *               password:
   *                 type: string
   *     responses:
   *       200:
   *         description: Login successful
   *       401:
   *         description: Invalid credentials
   */
  static async login(req: Request, res: Response) {
    try {
      const { email, password }: LoginRequest = req.body;
      
      // Find user
      const user = await prisma.users.findUnique({
        where: { email },
        select: {
          id: true,
          email: true,
          password: true,
          firstName: true,
          lastName: true,
          isActive: true,
          kycStatus: true
        }
      });
      
      if (!user || !user.isActive) {
        const response: ApiResponse = {
          success: false,
          message: 'Invalid credentials',
          timestamp: new Date().toISOString(),
          requestId: req.headers['x-request-id'] as string
        };
        return res.status(401).json(response);
      }
      
      // Verify password
      const isValidPassword = await bcrypt.compare(password, user.password);
      
      if (!isValidPassword) {
        const response: ApiResponse = {
          success: false,
          message: 'Invalid credentials',
          timestamp: new Date().toISOString(),
          requestId: req.headers['x-request-id'] as string
        };
        return res.status(401).json(response);
      }
      
      // Update last login
      await prisma.users.update({
        where: { id: user.id },
        data: { lastLoginAt: new Date() }
      });
      
      // Generate JWT
      const tokenPayload = {
        userId: user.id,
        email: user.email,
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + (24 * 60 * 60) // 24 hours
      };
      
      const token = jwt.sign(tokenPayload, config.jwt.secret);
      
      const response: ApiResponse = {
        success: true,
        message: 'Login successful',
        data: {
          user: {
            id: user.id,
            email: user.email,
            firstName: user.firstName,
            lastName: user.lastName,
            kycStatus: user.kycStatus
          },
          token,
          expiresIn: config.jwt.expiresIn
        },
        timestamp: new Date().toISOString(),
        requestId: req.headers['x-request-id'] as string
      };
      
      return res.json(response);
    } catch (error) {
      console.error('Login error:', error);
      
      const response: ApiResponse = {
        success: false,
        message: 'Login failed',
        error: config.server.env === 'development' ? (error as Error).message : undefined,
        timestamp: new Date().toISOString(),
        requestId: req.headers['x-request-id'] as string
      };
      
      return res.status(500).json(response);
    }
  }
}
