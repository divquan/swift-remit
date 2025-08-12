# Use official Node.js runtime as base image
FROM node:18-alpine AS base

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./
COPY tsconfig.json .


COPY prisma/ ./prisma/

RUN apk add --no-cache openssl3

# ========================
# Development stage
# ========================
FROM base AS dev

# Install all dependencies (including devDependencies) for build
RUN npm install

# Copy source code
COPY . .

# Expose port
EXPOSE 3002

# Start application
CMD ["npm", "run", "dev"]

# ========================
# Production stage
# ========================
FROM base AS prod

# Install dependencies
RUN npm ci

# Copy source code
COPY src/ ./src/

# Build TypeScript
RUN npm run build

# Remove devDependencies after build to reduce image size
RUN npm prune --production && rm -rf src/ tsconfig.json

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S orchestrator -u 1001

# Change ownership of the app directory
RUN chown -R orchestrator:nodejs /app
USER orchestrator

# Expose port
EXPOSE 3002

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3002/health', (res) => process.exit(res.statusCode === 200 ? 0 : 1))"

# Start application
CMD ["node", "dist/index.js"]
