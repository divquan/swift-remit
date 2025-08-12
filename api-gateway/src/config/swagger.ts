import swaggerJsdoc from 'swagger-jsdoc';
import { config } from '../config';

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'SwiftRemit API Gateway',
      version: '1.0.0',
      description: 'A resilient, distributed e-payment and remittance platform API',
      contact: {
        name: 'SwiftRemit Team',
        email: 'api@swiftremit.com',
        url: 'https://swiftremit.com'
      },
      license: {
        name: 'MIT',
        url: 'https://opensource.org/licenses/MIT'
      }
    },
    servers: [
      {
        url: `http://localhost:${config.server.port}`,
        description: 'Development server'
      },
      {
        url: 'https://api.swiftremit.com',
        description: 'Production server'
      }
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT'
        }
      },
      schemas: {
        User: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            email: { type: 'string', format: 'email' },
            firstName: { type: 'string' },
            lastName: { type: 'string' },
            phoneNumber: { type: 'string' },
            countryCode: { type: 'string', length: 2 },
            kycStatus: { 
              type: 'string', 
              enum: ['PENDING', 'VERIFIED', 'REJECTED', 'EXPIRED'] 
            },
            createdAt: { type: 'string', format: 'date-time' }
          }
        },
        Account: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            userId: { type: 'string' },
            accountType: { type: 'string' },
            currency: { type: 'string' },
            balance: { type: 'number' },
            status: { type: 'string' },
            createdAt: { type: 'string', format: 'date-time' }
          }
        },
        Remittance: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            idempotencyKey: { type: 'string' },
            senderAccountId: { type: 'string', format: 'uuid' },
            receiverAccountId: { type: 'string', format: 'uuid' },
            receiverDetails: { 
              type: 'object',
              properties: {
                firstName: { type: 'string' },
                lastName: { type: 'string' },
                email: { type: 'string', format: 'email' },
                phoneNumber: { type: 'string' },
                country: { type: 'string', length: 2 },
                accountNumber: { type: 'string' },
                bankCode: { type: 'string' }
              }
            },
            amount: { type: 'number', format: 'decimal' },
            currency: { type: 'string', length: 3 },
            exchangeRate: { type: 'number', format: 'decimal' },
            convertedAmount: { type: 'number', format: 'decimal' },
            convertedCurrency: { type: 'string', length: 3 },
            fee: { type: 'number', format: 'decimal' },
            status: { 
              type: 'string', 
              enum: ['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'CANCELLED', 'REFUNDED'] 
            },
            paymentProvider: { type: 'string' },
            providerTxnId: { type: 'string' },
            createdAt: { type: 'string', format: 'date-time' },
            completedAt: { type: 'string', format: 'date-time' }
          }
        },
        ApiResponse: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            message: { type: 'string' },
            data: { type: 'object' },
            error: { type: 'string' },
            timestamp: { type: 'string', format: 'date-time' },
            requestId: { type: 'string' }
          }
        },
        Error: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: false },
            message: { type: 'string' },
            error: { type: 'string' },
            timestamp: { type: 'string', format: 'date-time' },
            requestId: { type: 'string' }
          }
        }
      },
      responses: {
        UnauthorizedError: {
          description: 'Access token is missing or invalid',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/Error' }
            }
          }
        },
        ValidationError: {
          description: 'Validation error in request',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/Error' }
            }
          }
        },
        NotFoundError: {
          description: 'Resource not found',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/Error' }
            }
          }
        },
        InternalServerError: {
          description: 'Internal server error',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/Error' }
            }
          }
        }
      }
    },
    tags: [
      {
        name: 'Authentication',
        description: 'User authentication and authorization'
      },
      {
        name: 'Accounts',
        description: 'Account management operations'
      },
      {
        name: 'Remittance',
        description: 'Money transfer operations'
      },
      {
        name: 'Webhooks',
        description: 'Webhook endpoints for external integrations'
      },
      {
        name: 'Admin',
        description: 'Administrative and monitoring endpoints'
      }
    ]
  },
  apis: [
    './src/routes/*.ts',
    './src/controllers/*.ts'
  ]
};

export const swaggerSpec = swaggerJsdoc(options);
