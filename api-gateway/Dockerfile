# ========================
# Base stage
# ========================
FROM node:18-alpine AS base
WORKDIR /app
COPY package*.json ./
COPY tsconfig.json ./
COPY prisma/ ./prisma/
RUN apk add --no-cache openssl3

# ========================
# Development stage
# ========================
FROM base AS dev
RUN npm install
COPY . .
EXPOSE 3000
CMD ["npm", "run", "dev"]

# ========================
# Production stage
# ========================
FROM base AS prod
RUN npm ci
COPY src/ ./src/
RUN npm run build
RUN npm prune --production && rm -rf src/ tsconfig.json
RUN addgroup -g 1001 -S nodejs && \
    adduser -S swiftremit -u 1001
RUN chown -R swiftremit:nodejs /app
USER swiftremit
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health', (res) => process.exit(res.statusCode === 200 ? 0 : 1))"
CMD ["node", "dist/index.js"]
