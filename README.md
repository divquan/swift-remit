# Swift Remit

Monorepo for the Swift Remit payments platform. This repository contains multiple services used to handle payments, remittances, audit logging, orchestrator workflows, and an API gateway.

## Repository layout

Top-level services and key files:

- `api-gateway/` — Express API gateway that fronts the platform.
  - `src/` — TypeScript source code (controllers, routes, middleware, services).
  - `prisma/` — Prisma schema and migrations.
  - `Dockerfile`, `package.json`, `tsconfig.json`
- `audit-logger/` — Service that writes audit logs.
  - `src/` — Audit controller and services.
  - `prisma/` — Prisma schema and migrations.
- `orchestrator/` — Background worker/orchestrator for remittance workflows.
  - `src/` — workers, services, and queue handling.
  - `prisma/` — schema and migrations.
- `payment-gateway/` — Payment provider integrations and gateway code.

Other root files

- `docker-compose.yml` — Local compose setup to run the full stack (Postgres, Kafka, Redis, services).
- `prometheus.yml` — Prometheus scrape configuration.
- `CENTRAL_ACCOUNTS_SYSTEM.md`, `INTEGRATION_ANALYSIS.md` — design and analysis documentation.
- `test-*.sh` — convenience scripts for running integration or component tests.

## Quick start (local, Docker Compose)

Prerequisites

- Docker & Docker Compose
- Node.js (for local dev within each service)
- `pnpm`/`npm`/`yarn` depending on which package manager you prefer

Run the full stack

1. Copy or create any required `.env` files for services (see each service's README if present).
2. Start the stack:

```bash
docker compose up --build
```

3. Watch logs for service readiness. API gateway typically listens on port 3000 (check `api-gateway/package.json` and `src/index.ts`).

## Development (per-service)

Each service is a separate Node.js + TypeScript project. Typical workflow:

1. cd into the service directory, install dependencies:

```bash
cd api-gateway
npm install
# or pnpm install
```

2. Start in dev mode (if available):

```bash
npm run dev
```

3. Run TypeScript build or tests as needed:

```bash
npm run build
npm test
```

## Database migrations

Several services use Prisma with migrations in `*/prisma/migrations`.

To run migrations for a specific service (example for `api-gateway`):

```bash
cd api-gateway
npx prisma migrate deploy
# or for local development
npx prisma migrate dev --name init
```

Note: Ensure the `DATABASE_URL` environment variable points to your Postgres instance.

## Useful scripts

- `docker-compose.yml` — start all services and infra for local integration testing.
- `test-orchestrator.sh`, `test-central-accounts.sh`, `test-orchestrator-basic.sh` — provided test scripts; run them from repo root.

## Observability

- `prometheus.yml` included for scraping service metrics.
- Services may expose Prometheus metrics endpoints; check each service's `src/config`.

## Kafka / Redis

The project uses Kafka for async messaging and Redis for caching/locks (see `src/services` in services that use them). When running via Docker Compose, those services are included.

## Contributing

- Follow the repository style: TypeScript, Prisma, and Node.js tooling.
- Run linters and tests in each service before opening a PR.

## Troubleshooting

- If migrations fail: confirm `DATABASE_URL` and that Postgres is reachable.
- If Kafka connections fail: ensure the Kafka broker container is running and advertised listeners are reachable from services.

## Next steps / TODOs

- Add per-service READMEs with environment variable examples and specific port numbers.
- Add API reference or auto-generated Swagger docs for the gateway.

---

If you want, I can:

- Add per-service `README.md` files with exact env examples.
- Generate a root `.env.example` and per-service env templates.
- Extract the API documentation from `api-gateway` source and add a Swagger section.

Tell me which follow-up you'd like and I'll implement it.
