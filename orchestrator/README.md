# SwiftRemit Orchestrator Service

The Orchestrator service manages remittance workflows and transaction states using PostgreSQL as the ledger system. It implements ACID transactions, idempotency, and retry logic to ensure reliable financial operations.

## Features

### Core Functionality
- **ACID Transaction Management**: Uses PostgreSQL transactions with row-level locking for consistency
- **Double-Entry Bookkeeping**: Implements proper debit/credit accounting in the `Transaction` model  
- **Idempotency**: Prevents duplicate processing using idempotency keys
- **Retry Logic**: Exponential backoff for failed operations
- **Audit Trail**: Comprehensive logging of all financial operations

### Queue-Based Processing
- **Redis-backed Queues**: Uses Bull Queue for reliable job processing
- **Concurrent Processing**: Configurable concurrency for high throughput
- **Dead Letter Handling**: Failed jobs are properly handled and logged
- **Job Prioritization**: Support for priority-based processing

### Payment Provider Integration
- **Async Payment Processing**: Non-blocking external API calls
- **Callback Handling**: Webhook support for payment status updates
- **Failure Recovery**: Automatic reversal of failed payments
- **Provider Abstraction**: Pluggable payment provider interface

## Architecture

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────────┐
│   API Gateway   │───▶│ Redis Queue      │───▶│   Orchestrator      │
└─────────────────┘    └──────────────────┘    └─────────────────────┘
                                                           │
                       ┌──────────────────┐              │
                       │ Payment Provider │◀─────────────┘
                       └──────────────────┘
                                                           │
                       ┌──────────────────┐              │
                       │   PostgreSQL     │◀─────────────┘
                       │    (Ledger)      │
                       └──────────────────┘
                                                           │
                       ┌──────────────────┐              │
                       │  Audit Logger    │◀─────────────┘
                       └──────────────────┘
```

## Database Schema

### Key Models
- **Account**: Tracks user balances with DECIMAL precision
- **Remittance**: Manages payment request lifecycle
- **Transaction**: Implements double-entry bookkeeping
- **AuditLog**: Records all financial operations

### Transaction Flow
1. **Debit Sender**: Remove amount + fee from sender's account
2. **Credit Receiver**: Add amount to receiver's account (if internal)
3. **Record Fee**: Create fee transaction
4. **Update Balances**: Atomic balance updates within DB transaction
5. **Call Provider**: Async external payment processing
6. **Handle Result**: Update status based on provider response

## API Endpoints

### Health & Monitoring
- `GET /health` - Service health check
- `GET /stats` - Queue statistics and metrics
- `GET /remittance/:id` - Get remittance status

### Operations  
- `POST /webhook/payment-callback` - Payment provider webhooks
- `POST /retry/:queueType/:jobId` - Manual job retry

## Environment Configuration

```bash
# Database
DATABASE_URL="postgresql://username:password@localhost:5432/swiftremit"

# Redis
REDIS_URL="redis://localhost:6379"

# External Services
MOCK_PAYMENT_PROVIDER_URL="http://localhost:3003"
AUDIT_LOGGER_URL="http://localhost:3004"

# Processing Configuration
QUEUE_CONCURRENCY=5
MAX_RETRIES=3
RETRY_DELAY_MS=1000

# Timeouts
PAYMENT_TIMEOUT_MS=30000
DB_TRANSACTION_TIMEOUT_MS=10000
```

## Development

### Prerequisites
- Node.js 18+
- PostgreSQL 13+
- Redis 6+

### Setup
```bash
# Install dependencies
npm install

# Setup environment
cp .env.example .env

# Generate Prisma client
npx prisma generate

# Run migrations
npx prisma migrate dev

# Start development server
npm run dev
```

### Building
```bash
# Build TypeScript
npm run build

# Run production
npm start
```

## Docker

```bash
# Build image
docker build -t swiftremit-orchestrator .

# Run container
docker run -p 3002:3002 \
  -e DATABASE_URL="postgresql://..." \
  -e REDIS_URL="redis://..." \
  swiftremit-orchestrator
```

## Key Design Decisions

### 1. PostgreSQL as Ledger
- **ACID Compliance**: Ensures financial data consistency
- **Row-Level Locking**: Prevents race conditions on balance updates
- **Decimal Precision**: Accurate financial calculations
- **Transaction Isolation**: Serializable isolation for critical operations

### 2. Queue-Based Architecture
- **Reliability**: Redis persistence ensures no job loss
- **Scalability**: Horizontal scaling with multiple workers
- **Monitoring**: Built-in job tracking and metrics
- **Error Handling**: Dead letter queues for failed jobs

### 3. Idempotency Implementation
- **Unique Keys**: Each remittance has a unique idempotency key
- **Duplicate Detection**: Prevents double processing
- **State Tracking**: Clear status progression (PENDING → PROCESSING → COMPLETED/FAILED)

### 4. Error Handling Strategy
- **Graceful Degradation**: Service continues operating during provider outages
- **Automatic Reversal**: Failed payments are automatically refunded
- **Comprehensive Logging**: All operations tracked for debugging
- **Circuit Breaker**: Future enhancement for provider resilience

## Testing

```bash
# Run unit tests
npm test

# Run integration tests
npm run test:integration

# Run with coverage
npm run test:coverage
```

## Monitoring & Observability

### Metrics Exposed
- Queue depths and processing rates
- Transaction processing times
- Error rates by type
- Balance update frequencies

### Logging
- Structured JSON logging
- Request/response correlation IDs
- Financial operation audit trail
- Performance metrics

### Health Checks
- Database connectivity
- Redis connectivity  
- External service availability
- Queue worker status

## Security Considerations

- **Input Validation**: All job data validated before processing
- **SQL Injection Prevention**: Parameterized queries via Prisma
- **Audit Trail**: Immutable log of all financial operations
- **Error Masking**: Sensitive data not exposed in error messages

## Future Enhancements

1. **Distributed Locking**: For multi-instance deployments
2. **Circuit Breaker**: Enhanced provider resilience
3. **Event Sourcing**: Complete transaction history reconstruction
4. **Real-time Monitoring**: WebSocket-based status updates
5. **Advanced Retry**: Provider-specific retry strategies
