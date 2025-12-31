# Express Transcription Service - Complete Deployment Guide
## Based on AI Interview Backend (NestJS) 4-Phase Deployment

> **Source**: This guide consolidates lessons from the AI Interview Backend's complete deployment journey through 4 phases, plus all critical issues encountered during actual production deployment.

---

## 📚 Table of Contents

1. [Deployment Phases Overview](#deployment-phases-overview)
2. [Critical Production Issues (Must Read!)](#critical-production-issues)
3. [Phase 1: Security & Infrastructure](#phase-1-security--infrastructure)
4. [Phase 2: Cloud Run Compatibility](#phase-2-cloud-run-compatibility)
5. [Phase 3: Containerization](#phase-3-containerization)
6. [Phase 4: CI/CD Pipeline](#phase-4-cicd-pipeline)
7. [Express-Specific Implementation](#express-specific-implementation)
8. [Complete Deployment Checklist](#complete-deployment-checklist)

---

## Deployment Phases Overview

The AI Interview Backend was deployed in 4 structured phases:

| Phase | Focus | Deliverables |
|-------|-------|--------------|
| **Phase 1** | Security & Infrastructure | GCP Secret Manager, Environment config, CORS, Timing-safe comparisons |
| **Phase 2** | Cloud Run Compatibility | Health checks, Graceful shutdown, Security headers, Database optimization |
| **Phase 3** | Containerization | Multi-stage Dockerfile, Cloud Run YAML configs, Local docker-compose |
| **Phase 4** | CI/CD Pipeline | GitHub Actions workflows for PR checks, staging, and production |

**For your Express service**, follow the same structure but adapt for Express patterns.

---

## Critical Production Issues (Must Read!)

### 🚨 Issue #1: Secret Trailing Newlines (Most Common)

**Symptom**: `"MONGODB_URI" must be a valid uri` error despite correct URI format

**Root Cause**: Using `echo` to create secrets adds `\n` character
```bash
# ❌ WRONG - adds newline
echo "mongodb+srv://user:pass@host/db" | gcloud secrets create...
# Result: "mongodb+srv://user:pass@host/db\n"

# ✅ CORRECT
echo -n "mongodb+srv://user:pass@host/db" | gcloud secrets create...
```

**Detection**:
```bash
gcloud secrets versions access latest --secret="your-secret" | xxd | tail -1
# BAD:  00000090: ...30  0a     (ends with 0a = newline)
# GOOD: 00000090: ...30         (no 0a)
```

**Fix**:
```bash
# Get current value
VALUE=$(gcloud secrets versions access latest --secret="SECRET_NAME")
# Re-add without newline
echo -n "$VALUE" | gcloud secrets versions add SECRET_NAME --data-file=-
```

---

### 🚨 Issue #2: URI Scheme Validation

**Symptom**: Validation fails for `mongodb+srv://` and `rediss://` URIs

**Root Cause**: Node.js validators only accept standard schemes by default (`http`, `https`, `ftp`)

**NestJS Solution** (from our backend):
```typescript
// ❌ WRONG
MONGODB_URI: Joi.string().uri().required()

// ✅ CORRECT
MONGODB_URI: Joi.string().uri({ scheme: ['mongodb', 'mongodb+srv'] }).required()
REDIS_URL: Joi.string().uri({ scheme: ['redis', 'rediss'] }).required()
```

**Express Solutions**:

**Option A: Using Joi**
```javascript
const Joi = require('joi');

const envSchema = Joi.object({
  MONGODB_URI: Joi.string()
    .uri({ scheme: ['mongodb', 'mongodb+srv'] })
    .required(),
  REDIS_URL: Joi.string()
    .uri({ scheme: ['redis', 'rediss'] })
    .required(),
});

const { error, value } = envSchema.validate(process.env);
if (error) {
  console.error('Environment validation failed:', error.message);
  process.exit(1);
}
```

**Option B: Using validator.js**
```javascript
const validator = require('validator');

function validateMongoUri(uri) {
  return validator.isURL(uri, {
    protocols: ['mongodb', 'mongodb+srv'],
    require_protocol: true,
  });
}

function validateRedisUri(uri) {
  return validator.isURL(uri, {
    protocols: ['redis', 'rediss'],
    require_protocol: true,
  });
}
```

**Option C: Simple Regex**
```javascript
function validateUri(uri, schemes) {
  const regex = new RegExp(`^(${schemes.join('|')})://`);
  return regex.test(uri);
}

// Usage
if (!validateUri(process.env.MONGODB_URI, ['mongodb', 'mongodb+srv'])) {
  throw new Error('Invalid MongoDB URI');
}
```

---

### 🚨 Issue #3: Health Check Path Mismatches

**Symptom**: 404 errors on health probes, deployment timeout

**Root Cause**: Health probe paths in Cloud Run YAML don't match actual endpoint paths

**What Happened**:
```javascript
// Express app with API prefix
app.use('/api', routes);

// Health endpoint
router.get('/health/liveness', handler);

// Actual path: /api/health/liveness
// Cloud Run YAML had: /health/liveness  ❌
```

**Solution**:
```yaml
# cloud-run-staging.yaml
livenessProbe:
  httpGet:
    path: /api/health/liveness  # ✅ Must include full path
    port: 8080
```

**Critical**: Verify EXACT paths in:
1. Express route definitions
2. Cloud Run YAML files
3. Dockerfile HEALTHCHECK
4. Documentation

---

### 🚨 Issue #4: Docker Multi-Architecture on Mac

**Symptom**: `Container manifest type 'application/vnd.oci.image.index.v1+json' must support amd64/linux`

**Root Cause**: Mac (ARM64) builds multi-arch manifests by default

**Solution**:
```bash
# ❌ WRONG (on Mac)
docker build -t image:tag .

# ✅ CORRECT (always specify platform)
docker buildx build \
  --platform linux/amd64 \
  -t image:tag \
  --push .
```

**Note**: GitHub Actions runners are already amd64, so regular `docker build` works there.

---

### 🚨 Issue #5: Public Access Not Enabled

**Symptom**: 403 Forbidden on all requests after successful deployment

**Root Cause**: Cloud Run services are private by default

**Solution**:
```bash
# Must run after every deployment
gcloud run services add-iam-policy-binding SERVICE_NAME \
  --region=REGION \
  --member="allUsers" \
  --role="roles/run.invoker"
```

**Note**: The Cloud Run YAML `ingress: all` annotation does NOT grant public access!

---

### 🚨 Issue #6: Startup Probe Dependency Checks

**Symptom**: Deployment times out despite app starting

**Root Cause**: Startup probe checks dependencies (MongoDB/Redis) that may be slow to connect

**What Happened**:
```javascript
// ❌ BAD startup probe
app.get('/health/startup', async (req, res) => {
  await checkMongoDB();  // Can timeout!
  await checkRedis();    // Can timeout!
  res.json({ status: 'ok' });
});
```

**Solution**:
```javascript
// ✅ GOOD startup probe (simple)
app.get('/health/startup', (req, res) => {
  res.json({ status: 'ok' });
});

// ✅ GOOD readiness probe (checks dependencies)
app.get('/health/readiness', async (req, res) => {
  try {
    await checkMongoDB();
    await checkRedis();
    res.json({ status: 'ok', mongodb: 'up', redis: 'up' });
  } catch (error) {
    res.status(503).json({ status: 'error', error: error.message });
  }
});
```

**Cloud Run YAML**:
```yaml
startupProbe:
  httpGet:
    path: /api/health/startup  # Simple check
  failureThreshold: 30

readinessProbe:
  httpGet:
    path: /api/health/readiness  # Dependency checks
```

---

### 🚨 Issue #7: Service Account Secret Permissions

**Symptom**: `Permission denied` when accessing secrets

**Solution**:
```bash
# Grant Secret Manager access to service account
for secret in mongodb-uri redis-url jwt-secret; do
  gcloud secrets add-iam-policy-binding transcription-${secret}-staging \
    --member="serviceAccount:SERVICE_ACCOUNT@PROJECT.iam.gserviceaccount.com" \
    --role="roles/secretmanager.secretAccessor"
done
```

---

### 🚨 Issue #8: Dockerfile HEALTHCHECK Path Mismatch

**Symptom**: Docker health checks fail locally but work in Cloud Run

**Root Cause**: Dockerfile HEALTHCHECK uses wrong path

**Solution**:
```dockerfile
# ❌ WRONG
HEALTHCHECK CMD curl -f http://localhost:8080/health/liveness || exit 1

# ✅ CORRECT (match your actual path with /api prefix)
HEALTHCHECK CMD curl -f http://localhost:8080/api/health/liveness || exit 1

# Or using Node.js (no curl dependency needed)
HEALTHCHECK CMD node -e "require('http').get('http://localhost:8080/api/health/liveness', (r) => process.exit(r.statusCode === 200 ? 0 : 1))"
```

---

## Phase 1: Security & Infrastructure

### What to Implement

Based on the NestJS backend Phase 1, your Express service needs:

#### 1. GCP Secret Manager Integration

**Create**: `src/config/gcp-secrets.js`

```javascript
const { SecretManagerServiceClient } = require('@google-cloud/secret-manager');

class GcpSecretsManager {
  constructor() {
    this.client = null;
    this.cache = new Map();
    this.CACHE_TTL = 5 * 60 * 1000; // 5 minutes

    if (process.env.NODE_ENV === 'staging' || process.env.NODE_ENV === 'production') {
      this.client = new SecretManagerServiceClient();
      console.log(`GCP Secret Manager initialized for ${process.env.NODE_ENV}`);
    }
  }

  async getSecret(secretName, fallbackEnvVar) {
    // Local development: use env vars
    if (!this.client) {
      const envValue = process.env[fallbackEnvVar || secretName];
      if (!envValue) {
        throw new Error(`Environment variable ${fallbackEnvVar || secretName} not found`);
      }
      return envValue;
    }

    // Check cache
    const cached = this.cache.get(secretName);
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
      return cached.value;
    }

    try {
      const projectId = process.env.GCP_PROJECT_ID;
      const environment = process.env.NODE_ENV;
      const fullSecretName = `transcription-${secretName}-${environment}`;
      const secretPath = `projects/${projectId}/secrets/${fullSecretName}/versions/latest`;

      console.log(`Fetching secret: ${fullSecretName}`);

      const [version] = await this.client.accessSecretVersion({ name: secretPath });
      const secretValue = version.payload?.data?.toString();

      if (!secretValue) {
        throw new Error(`Secret ${fullSecretName} has no value`);
      }

      // Cache it
      this.cache.set(secretName, {
        value: secretValue,
        timestamp: Date.now(),
      });

      return secretValue;
    } catch (error) {
      console.error(`Failed to fetch secret ${secretName}:`, error.message);

      // Fallback to env var
      if (fallbackEnvVar && process.env[fallbackEnvVar]) {
        console.warn(`Using fallback environment variable ${fallbackEnvVar}`);
        return process.env[fallbackEnvVar];
      }

      throw error;
    }
  }

  clearCache() {
    this.cache.clear();
  }
}

module.exports = new GcpSecretsManager();
```

#### 2. Environment Configuration & Validation

**Create**: `src/config/environment.js`

```javascript
const Joi = require('joi');

function getEnvironment() {
  const env = process.env.NODE_ENV;
  if (['production', 'staging', 'local'].includes(env)) {
    return env;
  }
  return 'local';
}

function getValidationSchema() {
  const baseSchema = {
    NODE_ENV: Joi.string().valid('local', 'staging', 'production').default('local'),
    PORT: Joi.number().default(8080),
  };

  // Local - most things optional
  const localSchema = Joi.object({
    ...baseSchema,
    MONGODB_URI: Joi.string().uri({ scheme: ['mongodb', 'mongodb+srv'] }).optional(),
    REDIS_URL: Joi.string().uri({ scheme: ['redis', 'rediss'] }).optional(),
    JWT_SECRET: Joi.string().min(32).optional(),
    API_KEY: Joi.string().optional(),
  });

  // Staging - all required
  const stagingSchema = Joi.object({
    ...baseSchema,
    GCP_PROJECT_ID: Joi.string().required(),
    MONGODB_URI: Joi.string().uri({ scheme: ['mongodb', 'mongodb+srv'] }).required(),
    REDIS_URL: Joi.string().uri({ scheme: ['redis', 'rediss'] }).required(),
    JWT_SECRET: Joi.string().min(64).required(),
    API_KEY: Joi.string().min(32).required(),
  });

  // Production - same as staging
  const productionSchema = stagingSchema;

  const environment = getEnvironment();
  switch (environment) {
    case 'production':
      return productionSchema;
    case 'staging':
      return stagingSchema;
    case 'local':
    default:
      return localSchema;
  }
}

function validateEnvironment(config) {
  const schema = getValidationSchema();
  const result = schema.validate(config, {
    abortEarly: false,
    allowUnknown: true,
  });

  if (result.error) {
    const errors = result.error.details.map(d => d.message).join(', ');
    throw new Error(`Environment validation failed: ${errors}`);
  }

  return result.value;
}

module.exports = {
  getEnvironment,
  validateEnvironment,
};
```

#### 3. CORS Configuration

**In your main Express app**:

```javascript
const cors = require('cors');

function getAllowedOrigins() {
  const environment = process.env.NODE_ENV;

  // Custom origins from env var
  if (process.env.ALLOWED_ORIGINS) {
    return process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim());
  }

  const defaultOrigins = {
    local: [
      'http://localhost:8080',
      'http://localhost:5173',
      'http://localhost:5174',
    ],
    staging: [], // Mobile app only, or add your staging frontend
    production: [], // Mobile app only, or add your production frontend
  };

  return defaultOrigins[environment] || [];
}

// Apply CORS
app.use(cors({
  origin: getAllowedOrigins(),
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Accept'],
}));
```

#### 4. Timing-Safe API Key Comparison

```javascript
const crypto = require('crypto');

function timingSafeCompare(provided, expected) {
  const expectedBuffer = Buffer.from(expected);
  const providedBuffer = Buffer.from(provided);

  // Length check (not timing-safe, but necessary)
  if (expectedBuffer.length !== providedBuffer.length) {
    return false;
  }

  // Timing-safe comparison
  return crypto.timingSafeEqual(expectedBuffer, providedBuffer);
}

// Usage in middleware
function apiKeyAuth(req, res, next) {
  const providedKey = req.headers['x-api-key'];
  const expectedKey = process.env.API_KEY;

  if (!providedKey || !timingSafeCompare(providedKey, expectedKey)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  next();
}
```

---

## Phase 2: Cloud Run Compatibility

### What to Implement

#### 1. Health Check Endpoints

**Create**: `src/routes/health.js`

```javascript
const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const redis = require('../config/redis'); // Your Redis client

// Liveness - just check if app is alive
router.get('/liveness', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
  });
});

// Startup - simple check for container startup
router.get('/startup', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
  });
});

// Readiness - check dependencies
router.get('/readiness', async (req, res) => {
  const checks = {
    mongodb: 'unknown',
    redis: 'unknown',
  };

  try {
    // Check MongoDB
    const mongoState = mongoose.connection.readyState;
    if (mongoState === 1) {
      await mongoose.connection.db.admin().ping();
      checks.mongodb = 'up';
    } else {
      checks.mongodb = 'down';
    }

    // Check Redis
    const redisPing = await redis.ping();
    checks.redis = redisPing === 'PONG' ? 'up' : 'down';

    // All healthy?
    if (checks.mongodb === 'up' && checks.redis === 'up') {
      return res.json({
        status: 'ok',
        checks,
      });
    }

    // Some unhealthy
    return res.status(503).json({
      status: 'degraded',
      checks,
    });
  } catch (error) {
    return res.status(503).json({
      status: 'error',
      error: error.message,
      checks,
    });
  }
});

// Comprehensive health check
router.get('/', async (req, res) => {
  // Same as readiness
  return router.readiness(req, res);
});

module.exports = router;
```

**Mount in app**:
```javascript
const healthRoutes = require('./routes/health');

// If using /api prefix
app.use('/api/health', healthRoutes);

// If no prefix
app.use('/health', healthRoutes);
```

#### 2. Graceful Shutdown

**In your main server file**:

```javascript
const express = require('express');
const mongoose = require('mongoose');
const redis = require('./config/redis');

const app = express();

// ... middleware and routes ...

const server = app.listen(process.env.PORT || 8080, () => {
  console.log(`Server running on port ${process.env.PORT || 8080}`);
});

// Graceful shutdown
function gracefulShutdown(signal) {
  console.log(`${signal} received, closing server gracefully...`);

  server.close(async () => {
    console.log('HTTP server closed');

    try {
      // Close database connections
      await mongoose.connection.close(false);
      console.log('MongoDB connection closed');

      await redis.quit();
      console.log('Redis connection closed');

      console.log('Graceful shutdown complete');
      process.exit(0);
    } catch (error) {
      console.error('Error during shutdown:', error);
      process.exit(1);
    }
  });

  // Force shutdown after 30 seconds
  setTimeout(() => {
    console.error('Forced shutdown after timeout');
    process.exit(1);
  }, 30000);
}

// Listen for termination signals
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Handle unhandled rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});
```

#### 3. Security Headers (Helmet)

```javascript
const helmet = require('helmet');

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:', 'https:'],
    },
  },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true,
  },
  frameguard: {
    action: 'deny',
  },
}));
```

#### 4. MongoDB Connection Optimization

```javascript
const mongoose = require('mongoose');

mongoose.connect(process.env.MONGODB_URI, {
  // Cloud Run optimizations
  minPoolSize: 1,
  maxPoolSize: 10,
  socketTimeoutMS: 45000,
  serverSelectionTimeoutMS: 5000,
  retryWrites: true,
  retryReads: true,
});

mongoose.connection.on('connected', () => {
  console.log('MongoDB connected');
});

mongoose.connection.on('error', (err) => {
  console.error('MongoDB error:', err);
});
```

---

## Phase 3: Containerization

### Dockerfile (Multi-Stage for Express)

**Create**: `Dockerfile`

```dockerfile
# ============================================
# STAGE 1: Dependencies
# ============================================
FROM node:20-alpine AS dependencies

WORKDIR /app

COPY package*.json ./

RUN npm ci --only=production && \
    npm cache clean --force

# ============================================
# STAGE 2: Production
# ============================================
FROM node:20-alpine

# Install dumb-init for signal handling
RUN apk add --no-cache dumb-init

WORKDIR /app

# Set environment
ENV NODE_ENV=production
ENV PORT=8080

# Copy production dependencies
COPY --from=dependencies /app/node_modules ./node_modules

# Copy source code
COPY . .

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S expressjs -u 1001 && \
    chown -R expressjs:nodejs /app

USER expressjs

EXPOSE 8080

# Health check (adjust path to match your setup)
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "require('http').get('http://localhost:8080/api/health/liveness', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

ENTRYPOINT ["dumb-init", "--"]

CMD ["node", "server.js"]
```

### .dockerignore

**Create**: `.dockerignore`

```
node_modules
npm-debug.log
.env
.env.*
.git
.gitignore
*.md
.vscode
.idea
coverage
.nyc_output
test
tests
__tests__
*.test.js
*.spec.js
.DS_Store
Dockerfile
docker-compose.yml
.dockerignore
```

### Cloud Run Staging Configuration

**Create**: `cloud-run-staging.yaml`

```yaml
apiVersion: serving.knative.dev/v1
kind: Service
metadata:
  name: transcription-service-staging
  labels:
    app: transcription-service
    environment: staging
  annotations:
    run.googleapis.com/ingress: all
    run.googleapis.com/ingress-status: all
spec:
  template:
    metadata:
      annotations:
        autoscaling.knative.dev/minScale: '0'
        autoscaling.knative.dev/maxScale: '10'
    spec:
      containerConcurrency: 80
      timeoutSeconds: 300
      serviceAccountName: transcription-service-staging@PROJECT_ID.iam.gserviceaccount.com

      containers:
        - name: backend
          image: REGION-docker.pkg.dev/PROJECT_ID/transcription-service/backend:staging-v1

          ports:
            - name: http1
              containerPort: 8080

          resources:
            limits:
              cpu: '1'
              memory: 1Gi

          env:
            - name: NODE_ENV
              value: staging
            - name: GCP_PROJECT_ID
              value: PROJECT_ID

            # Secrets from Secret Manager
            - name: MONGODB_URI
              valueFrom:
                secretKeyRef:
                  name: transcription-mongodb-uri-staging
                  key: latest
            - name: REDIS_URL
              valueFrom:
                secretKeyRef:
                  name: transcription-redis-url-staging
                  key: latest
            - name: JWT_SECRET
              valueFrom:
                secretKeyRef:
                  name: transcription-jwt-secret-staging
                  key: latest
            - name: API_KEY
              valueFrom:
                secretKeyRef:
                  name: transcription-api-key-staging
                  key: latest

          # IMPORTANT: Adjust paths to match your actual endpoints
          livenessProbe:
            httpGet:
              path: /api/health/liveness
              port: 8080
            periodSeconds: 10
            timeoutSeconds: 5
            failureThreshold: 3

          startupProbe:
            httpGet:
              path: /api/health/startup
              port: 8080
            periodSeconds: 10
            timeoutSeconds: 5
            failureThreshold: 30

  traffic:
    - percent: 100
      latestRevision: true
```

### Cloud Run Production Configuration

**Create**: `cloud-run-production.yaml`

```yaml
apiVersion: serving.knative.dev/v1
kind: Service
metadata:
  name: transcription-service-production
  labels:
    app: transcription-service
    environment: production
  annotations:
    run.googleapis.com/ingress: all
    run.googleapis.com/ingress-status: all
spec:
  template:
    metadata:
      annotations:
        autoscaling.knative.dev/minScale: '1'
        autoscaling.knative.dev/maxScale: '100'
        run.googleapis.com/cpu-throttling: 'false'
    spec:
      containerConcurrency: 80
      timeoutSeconds: 300
      serviceAccountName: transcription-service-production@PROJECT_ID.iam.gserviceaccount.com

      containers:
        - name: backend
          image: REGION-docker.pkg.dev/PROJECT_ID/transcription-service/backend:production-latest

          ports:
            - name: http1
              containerPort: 8080

          resources:
            limits:
              cpu: '2'
              memory: 2Gi

          env:
            - name: NODE_ENV
              value: production
            - name: GCP_PROJECT_ID
              value: PROJECT_ID

            # Production secrets
            - name: MONGODB_URI
              valueFrom:
                secretKeyRef:
                  name: transcription-mongodb-uri-production
                  key: latest
            - name: REDIS_URL
              valueFrom:
                secretKeyRef:
                  name: transcription-redis-url-production
                  key: latest
            - name: JWT_SECRET
              valueFrom:
                secretKeyRef:
                  name: transcription-jwt-secret-production
                  key: latest
            - name: API_KEY
              valueFrom:
                secretKeyRef:
                  name: transcription-api-key-production
                  key: latest

          livenessProbe:
            httpGet:
              path: /api/health/liveness
              port: 8080
            initialDelaySeconds: 10
            periodSeconds: 10
            timeoutSeconds: 5
            failureThreshold: 3

          startupProbe:
            httpGet:
              path: /api/health/startup
              port: 8080
            initialDelaySeconds: 0
            periodSeconds: 10
            timeoutSeconds: 5
            failureThreshold: 30

  traffic:
    - percent: 100
      latestRevision: true
```

---

## Phase 4: CI/CD Pipeline

### GitHub Actions - PR Checks

**Create**: `.github/workflows/pr-checks.yml`

```yaml
name: PR Quality Checks

on:
  pull_request:
    branches: [main, staging]

jobs:
  lint:
    name: Lint Code
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
      - run: npm ci
      - run: npm run lint

  test:
    name: Run Tests
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
      - run: npm ci
      - run: npm test

  security:
    name: Security Audit
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - run: npm audit --audit-level=moderate
        continue-on-error: true

  build:
    name: Build Check
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
      - run: npm ci
      - run: npm run build  # If you have a build step
```

### GitHub Actions - Staging Deploy

**Create**: `.github/workflows/deploy-staging.yml`

```yaml
name: Deploy to Staging

on:
  push:
    branches: [staging]
  workflow_dispatch:

env:
  GCP_PROJECT_ID: your-project-id
  GCP_REGION: us-central1
  SERVICE_NAME: transcription-service-staging
  REGISTRY: us-central1-docker.pkg.dev
  REPOSITORY: transcription-service

jobs:
  lint:
    name: Lint
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
      - run: npm ci
      - run: npm run lint

  test:
    name: Test
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
      - run: npm ci
      - run: npm test

  deploy:
    name: Build & Deploy
    runs-on: ubuntu-latest
    needs: [lint, test]

    permissions:
      contents: read
      id-token: write

    steps:
      - uses: actions/checkout@v4

      - name: Authenticate to GCP
        uses: google-github-actions/auth@v2
        with:
          workload_identity_provider: ${{ secrets.GCP_WORKLOAD_IDENTITY_PROVIDER }}
          service_account: ${{ secrets.GCP_SERVICE_ACCOUNT }}

      - name: Set up Cloud SDK
        uses: google-github-actions/setup-gcloud@v2

      - name: Configure Docker
        run: gcloud auth configure-docker ${{ env.REGISTRY }}

      - name: Build Docker image
        run: |
          docker build \
            -t ${{ env.REGISTRY }}/${{ env.GCP_PROJECT_ID }}/${{ env.REPOSITORY }}/backend:staging-${{ github.sha }} \
            -t ${{ env.REGISTRY }}/${{ env.GCP_PROJECT_ID }}/${{ env.REPOSITORY }}/backend:staging-latest \
            .

      - name: Push Docker image
        run: |
          docker push ${{ env.REGISTRY }}/${{ env.GCP_PROJECT_ID }}/${{ env.REPOSITORY }}/backend:staging-${{ github.sha }}
          docker push ${{ env.REGISTRY }}/${{ env.GCP_PROJECT_ID }}/${{ env.REPOSITORY }}/backend:staging-latest

      - name: Deploy to Cloud Run
        run: |
          gcloud run deploy ${{ env.SERVICE_NAME }} \
            --image=${{ env.REGISTRY }}/${{ env.GCP_PROJECT_ID }}/${{ env.REPOSITORY }}/backend:staging-${{ github.sha }} \
            --region=${{ env.GCP_REGION }} \
            --platform=managed \
            --allow-unauthenticated

      - name: Get service URL
        id: get-url
        run: |
          SERVICE_URL=$(gcloud run services describe ${{ env.SERVICE_NAME }} \
            --region=${{ env.GCP_REGION }} \
            --format='value(status.url)')
          echo "SERVICE_URL=$SERVICE_URL" >> $GITHUB_OUTPUT

      - name: Health check
        run: |
          sleep 15
          curl -f ${{ steps.get-url.outputs.SERVICE_URL }}/api/health/liveness || exit 1
```

### GitHub Actions - Production Deploy

**Create**: `.github/workflows/deploy-production.yml`

```yaml
name: Deploy to Production

on:
  push:
    branches: [main]
  workflow_dispatch:

env:
  GCP_PROJECT_ID: your-project-id
  GCP_REGION: us-central1
  SERVICE_NAME: transcription-service-production
  REGISTRY: us-central1-docker.pkg.dev
  REPOSITORY: transcription-service

jobs:
  lint:
    name: Lint
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
      - run: npm ci
      - run: npm run lint

  test:
    name: Test
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
      - run: npm ci
      - run: npm test

  security:
    name: Security Audit
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - run: npm audit --audit-level=high

  build-and-push:
    name: Build & Push
    runs-on: ubuntu-latest
    needs: [lint, test, security]

    permissions:
      contents: read
      id-token: write

    outputs:
      image_tag: ${{ steps.meta.outputs.image_tag }}

    steps:
      - uses: actions/checkout@v4

      - name: Set image metadata
        id: meta
        run: |
          IMAGE_TAG=production-${{ github.sha }}
          echo "image_tag=$IMAGE_TAG" >> $GITHUB_OUTPUT

      - name: Authenticate to GCP
        uses: google-github-actions/auth@v2
        with:
          workload_identity_provider: ${{ secrets.GCP_WORKLOAD_IDENTITY_PROVIDER }}
          service_account: ${{ secrets.GCP_SERVICE_ACCOUNT }}

      - name: Set up Cloud SDK
        uses: google-github-actions/setup-gcloud@v2

      - name: Configure Docker
        run: gcloud auth configure-docker ${{ env.REGISTRY }}

      - name: Build Docker image
        run: |
          docker build \
            -t ${{ env.REGISTRY }}/${{ env.GCP_PROJECT_ID }}/${{ env.REPOSITORY }}/backend:${{ steps.meta.outputs.image_tag }} \
            -t ${{ env.REGISTRY }}/${{ env.GCP_PROJECT_ID }}/${{ env.REPOSITORY }}/backend:production-latest \
            .

      - name: Push Docker image
        run: |
          docker push ${{ env.REGISTRY }}/${{ env.GCP_PROJECT_ID }}/${{ env.REPOSITORY }}/backend:${{ steps.meta.outputs.image_tag }}
          docker push ${{ env.REGISTRY }}/${{ env.GCP_PROJECT_ID }}/${{ env.REPOSITORY }}/backend:production-latest

  deploy:
    name: Deploy to Cloud Run
    runs-on: ubuntu-latest
    needs: [build-and-push]
    environment:
      name: production

    permissions:
      contents: read
      id-token: write

    steps:
      - uses: actions/checkout@v4

      - name: Authenticate to GCP
        uses: google-github-actions/auth@v2
        with:
          workload_identity_provider: ${{ secrets.GCP_WORKLOAD_IDENTITY_PROVIDER }}
          service_account: ${{ secrets.GCP_SERVICE_ACCOUNT }}

      - name: Set up Cloud SDK
        uses: google-github-actions/setup-gcloud@v2

      - name: Deploy to Cloud Run
        run: |
          gcloud run deploy ${{ env.SERVICE_NAME }} \
            --image=${{ env.REGISTRY }}/${{ env.GCP_PROJECT_ID }}/${{ env.REPOSITORY }}/backend:${{ needs.build-and-push.outputs.image_tag }} \
            --region=${{ env.GCP_REGION }} \
            --platform=managed \
            --allow-unauthenticated

      - name: Verify deployment
        run: |
          SERVICE_URL=$(gcloud run services describe ${{ env.SERVICE_NAME }} \
            --region=${{ env.GCP_REGION }} \
            --format='value(status.url)')

          sleep 30
          curl -f $SERVICE_URL/api/health/liveness || exit 1
          curl -f $SERVICE_URL/api/health/readiness || exit 1
```

---

## Complete Deployment Checklist

### Pre-Deployment

- [ ] All code follows 4-phase structure
- [ ] Environment validation uses custom URI schemes
- [ ] Health endpoints implemented (liveness, readiness, startup)
- [ ] Graceful shutdown implemented
- [ ] Security headers (Helmet) configured
- [ ] CORS properly configured
- [ ] Timing-safe API key comparison
- [ ] GCP Secret Manager integration added

### GCP Setup

- [ ] Service accounts created (staging, production)
- [ ] Artifact Registry repository created
- [ ] All secrets created with `echo -n` (no trailing newlines)
- [ ] Service accounts granted Secret Manager access
- [ ] Workload Identity Federation configured

### Configuration Files

- [ ] Dockerfile created and tested
- [ ] .dockerignore created
- [ ] cloud-run-staging.yaml created with correct paths
- [ ] cloud-run-production.yaml created with correct paths
- [ ] GitHub Actions workflows created
- [ ] Health probe paths verified across all files

### Secret Verification

- [ ] Run `xxd` check on ALL secrets
- [ ] No trailing `0a` characters
- [ ] MongoDB URI format: `mongodb+srv://...`
- [ ] Redis URL format: `rediss://...`
- [ ] All secret names follow convention

### Local Testing

- [ ] Docker build succeeds: `docker build -t test .`
- [ ] Container runs: `docker run -p 8080:8080 test`
- [ ] Health endpoints accessible: `curl localhost:8080/api/health/liveness`
- [ ] Dockerfile HEALTHCHECK works: `docker ps` shows "healthy"

### Deployment

- [ ] Build with correct platform: `docker buildx build --platform linux/amd64`
- [ ] Push to Artifact Registry
- [ ] Deploy to Cloud Run
- [ ] Enable public access: `gcloud run services add-iam-policy-binding`
- [ ] Test health endpoints on live URL
- [ ] Check logs for any errors

### Post-Deployment

- [ ] Verify MongoDB connection
- [ ] Verify Redis connection
- [ ] Test API endpoints
- [ ] Monitor Cloud Run metrics
- [ ] Set up alerts (error rate, latency)

---

## Quick Command Reference

```bash
# Secret creation (with -n!)
echo -n "value" | gcloud secrets create NAME --data-file=-

# Secret verification
gcloud secrets versions access latest --secret=NAME | xxd | tail -1

# Build for Cloud Run (Mac)
docker buildx build --platform linux/amd64 -t IMAGE --push .

# Deploy
gcloud run services replace cloud-run-staging.yaml --region=REGION

# Enable public access
gcloud run services add-iam-policy-binding SERVICE \
  --region=REGION --member="allUsers" --role="roles/run.invoker"

# Test
curl https://SERVICE-URL/api/health/liveness
curl https://SERVICE-URL/api/health/readiness

# Logs
gcloud run services logs tail SERVICE --region=REGION
```

---

**Generated**: December 2025
**Source**: AI Interview Backend 4-Phase Deployment + Production Experience
**Target**: Express Transcription Service
