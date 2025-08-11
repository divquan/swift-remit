# Use Node.js 18 LTS Alpine for smaller image size
FROM node:18-alpine

# Set working directory
WORKDIR /app


# Copy package files
COPY package*.json ./
COPY tsconfig.json ./

COPY prisma/ ./prisma/

# install openssl
RUN apk add --no-cache openssl3  
# Install all dependencies (including dev) for build
RUN npm ci

# Copy source code
COPY src/ ./src/

# Build TypeScript
RUN npm run build

# Remove development dependencies and source files to reduce image size
RUN npm prune --production && rm -rf src/ tsconfig.json

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S swiftremit -u 1001

# Change ownership of the app directory
RUN chown -R swiftremit:nodejs /app
USER swiftremit

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health', (res) => process.exit(res.statusCode === 200 ? 0 : 1))"

# Start the application
CMD ["node", "dist/index.js"]
