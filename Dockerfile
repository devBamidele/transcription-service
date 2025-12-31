# ============================================
# STAGE 1: Build TypeScript
# ============================================
FROM node:20-slim AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY tsconfig.json ./

# Install ALL dependencies (including devDependencies for build)
RUN npm ci

# Copy source code
COPY src ./src

# Build TypeScript to JavaScript
RUN npm run build

# ============================================
# STAGE 2: Production Dependencies
# ============================================
FROM node:20-slim AS dependencies

WORKDIR /app

COPY package*.json ./

# Install ONLY production dependencies
RUN npm ci --only=production && \
    npm cache clean --force

# ============================================
# STAGE 3: Production Runtime
# ============================================
FROM node:20-slim

# Install dumb-init and curl for proper signal handling and health checks
RUN apt-get update && \
    apt-get install -y --no-install-recommends dumb-init curl && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Set environment
ENV NODE_ENV=production
ENV PORT=8080

# Copy production dependencies
COPY --from=dependencies /app/node_modules ./node_modules

# Copy built JavaScript from builder
COPY --from=builder /app/dist ./dist

# Copy package.json for metadata
COPY package*.json ./

# Create non-root user (Debian syntax)
RUN groupadd --gid 1001 nodejs && \
    useradd --uid 1001 --gid nodejs --shell /bin/bash --create-home expressjs && \
    chown -R expressjs:nodejs /app

USER expressjs

EXPOSE 8080

# Health check - NO /api prefix (routes are mounted directly)
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "require('http').get('http://localhost:8080/health/liveness', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Use dumb-init for proper signal handling
ENTRYPOINT ["dumb-init", "--"]

CMD ["node", "dist/server.js"]
