FROM node:18-alpine AS base

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY tsconfig.json .
COPY prisma/ ./prisma/

# Install dependencies and setup Prisma
RUN apk add --no-cache openssl3

# Development stage
FROM base AS dev
RUN npm install
COPY . .
EXPOSE 3004
CMD ["npm", "run", "dev"]

# Production stage
FROM base AS prod
RUN npm ci --only=production
COPY . .
RUN npm run build
EXPOSE 3004
CMD ["npm", "start"]