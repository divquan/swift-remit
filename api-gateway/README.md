# SwiftRemit API Gateway

The main entry point for all client requests to the SwiftRemit platform. Handles authentication, validation, routing, and provides a clean public API interface.

## 🏗️ Architecture

The API Gateway serves as the front door to our distributed payment system:

- **Authentication & Authorization** - JWT-based auth with secure token management
- **Request Validation** - Comprehensive input validation and sanitization  
- **Rate Limiting** - Protects against abuse and ensures fair usage
- **Idempotency** - Prevents duplicate transactions with idempotency keys
- **Async Processing** - Long-running operations queued via Redis
- **Real-time Reads** - Direct database queries for balances and status
- **API Documentation** - Auto-generated Swagger/OpenAPI docs

## 🚀 Features

### Core Endpoints

#### Authentication & User Management
- `POST /api/v1/auth/signup` - Register new user
- `POST /api/v1/auth/login` - Authenticate & get JWT token

#### Account & Balance Management  
- `POST /api/v1/accounts` - Create new account (linked to TigerBeetle)
- `GET /api/v1/accounts/:id` - Get account information
- `GET /api/v1/accounts/:id/balance` - Get real-time balance
- `GET /api/v1/accounts/:id/transactions` - List transaction history

#### Remittance Operations
- `POST /api/v1/remittance/send` - Initiate money transfer (idempotent)
- `GET /api/v1/remittance/status/:id` - Check transfer status
- `POST /api/v1/remittance/refund` - Process refunds
- `POST /api/v1/remittance/reverse` - Reverse pending transactions

#### Payment Provider Webhooks
- `POST /api/v1/webhook/payment/:provider` - Receive provider updates
- `POST /api/v1/webhook/fx-rate` - Update exchange rates

#### System Monitoring
- `GET /health` - Service health check
- `GET /metrics` - Prometheus-compatible metrics
- `POST /api/v1/reconcile` - Trigger ledger reconciliation
- `GET /docs` - Interactive API documentation

## 🛠️ Technology Stack

- **Runtime**: Node.js 18+ with TypeScript
- **Framework**: Express.js with security middleware
- **Database**: PostgreSQL with Prisma ORM  
- **Financial Ledger**: TigerBeetle integration
- **Queue**: Redis for async job processing
- **Validation**: Joi + express-validator
- **Security**: JWT, HMAC webhooks, rate limiting, CORS
- **Documentation**: Swagger/OpenAPI 3.0
- **Monitoring**: Prometheus metrics, structured logging

## 📋 Prerequisites

- Node.js 18+
- PostgreSQL 14+
- Redis 6+
- TigerBeetle ledger service

## 🚀 Quick Start

### 1. Install Dependencies
```bash
npm install
```

### 2. Environment Setup
```bash
cp .env.example .env
# Edit .env with your configuration
```

### 3. Database Setup
```bash
# Generate Prisma client
npm run prisma:generate

# Run migrations
npm run prisma:migrate
```

### 4. Development
```bash
# Start in development mode with hot reload
npm run dev

# Build for production
npm run build

# Start production server
npm start
```

### 5. Testing
```bash
# Run tests
npm test

# Run tests in watch mode
npm run test:watch
```

## 🐳 Docker

### Build Image
```bash
docker build -t swiftremit-api-gateway .
```

### Run Container
```bash
docker run -p 3000:3000 \
  -e DATABASE_URL="postgresql://..." \
  -e REDIS_HOST="redis" \
  -e JWT_SECRET="your-secret" \
  swiftremit-api-gateway
```

### Docker Compose
```bash
# Start all services
docker-compose up -d

# View logs
docker-compose logs -f api-gateway
```

## 🔧 Configuration

Key environment variables:

```bash
# Server
NODE_ENV=development
PORT=3000

# Database  
DATABASE_URL=postgresql://user:password@localhost:5432/swiftremit

# JWT Authentication
JWT_SECRET=your-super-secret-jwt-key
JWT_EXPIRES_IN=24h

# Redis Queue
REDIS_HOST=localhost
REDIS_PORT=6379

# TigerBeetle Ledger
TIGERBEETLE_HOST=localhost
TIGERBEETLE_PORT=3001

# External Services
ORCHESTRATOR_URL=http://localhost:3002
PAYMENT_GATEWAY_URL=http://localhost:3003
AUDIT_LOGGER_URL=http://localhost:3004

# Security
WEBHOOK_SECRET=your-webhook-secret-key

# Rate Limiting
RATE_LIMIT_WINDOW_MS=900000  # 15 minutes
RATE_LIMIT_MAX_REQUESTS=100
```

## 📚 API Documentation

Interactive API documentation is available at:
- **Development**: http://localhost:3000/docs
- **Production**: https://api.swiftremit.com/docs

The API follows RESTful conventions with:
- Consistent JSON responses
- HTTP status codes
- Request/response validation
- Comprehensive error handling
- Pagination for list endpoints

## 🔐 Security Features

- **JWT Authentication** - Stateless token-based auth
- **Rate Limiting** - Per-endpoint and global limits
- **Input Validation** - Joi schemas + express-validator
- **CORS Protection** - Configurable origins
- **Helmet Security** - Security headers
- **HMAC Webhooks** - Verified webhook signatures
- **Request ID Tracking** - For audit trails
- **SQL Injection Prevention** - Prisma ORM protection

## 🔄 Async Processing Flow

1. **Client Request** → API Gateway validates & stores
2. **Job Queuing** → Redis queue for Orchestrator
3. **Immediate Response** → Status endpoint for tracking
4. **Background Processing** → Orchestrator handles logic
5. **Webhook Updates** → Payment provider callbacks
6. **Final Settlement** → TigerBeetle ledger updates

## 📊 Monitoring & Observability

### Health Checks
- Database connectivity
- Redis availability  
- TigerBeetle service status
- Overall system health

### Metrics (Prometheus)
- Request rates and latency
- Error rates by endpoint
- Queue depths
- Transaction volumes
- Active connections

### Logging
- Structured JSON logs
- Request/response tracking
- Error stack traces
- Audit trail events

## 🤝 Integration with Other Services

### Orchestrator
- Queues remittance jobs
- Receives status updates
- Handles retry logic

### Payment Gateway
- Provider selection
- Transaction processing
- Webhook handling

### Audit Logger
- Event streaming
- Compliance logs
- Audit trails

### TigerBeetle
- Account creation
- Balance queries
- Transfer posting

## 🧪 Testing

```bash
# Unit tests
npm run test:unit

# Integration tests  
npm run test:integration

# E2E tests
npm run test:e2e

# Coverage report
npm run test:coverage
```

## 🚀 Deployment

### Production Checklist
- [ ] Environment variables configured
- [ ] Database migrations applied
- [ ] Redis cluster setup
- [ ] TLS certificates installed
- [ ] Monitoring alerts configured
- [ ] Backup procedures tested

### Scaling Considerations
- Horizontal scaling with load balancer
- Redis cluster for queue reliability
- Database read replicas
- CDN for static assets
- Container orchestration (Kubernetes)

## 📝 Contributing

1. Fork the repository
2. Create feature branch (`git checkout -b feature/amazing-feature`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing-feature`)
5. Open Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

Built with ❤️ by the SwiftRemit Team
