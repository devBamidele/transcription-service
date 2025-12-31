# Deployment Quick Start Guide

This is a condensed quick-reference guide. For complete details, see [TRANSCRIPTION-SERVICE-DEPLOYMENT-GUIDE.md](./TRANSCRIPTION-SERVICE-DEPLOYMENT-GUIDE.md).

## 📋 Prerequisites

- GCP Project with billing enabled
- `gcloud` CLI installed and authenticated
- Docker installed (with `buildx` for Mac users)
- Node.js 20+ installed
- GitHub repository with access to secrets

## 🚀 Quick Deployment Steps

### 1. Install Dependencies

```bash
npm install
```

### 2. Setup GCP Infrastructure

```bash
# Set your project
export PROJECT_ID="your-project-id"
export REGION="us-central1"

# Enable APIs (iamcredentials.googleapis.com is required for Workload Identity Federation)
gcloud services enable \
  run.googleapis.com \
  secretmanager.googleapis.com \
  artifactregistry.googleapis.com \
  iamcredentials.googleapis.com \
  --project=$PROJECT_ID

# Create Artifact Registry
gcloud artifacts repositories create transcription-service \
  --repository-format=docker \
  --location=$REGION \
  --project=$PROJECT_ID

# Create service accounts
gcloud iam service-accounts create transcription-svc-staging --project=$PROJECT_ID
gcloud iam service-accounts create transcription-svc-prod --project=$PROJECT_ID

# Grant IAM permissions to service accounts
# Staging
gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:transcription-svc-staging@${PROJECT_ID}.iam.gserviceaccount.com" \
  --role="roles/artifactregistry.writer"

gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:transcription-svc-staging@${PROJECT_ID}.iam.gserviceaccount.com" \
  --role="roles/run.admin"

gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:transcription-svc-staging@${PROJECT_ID}.iam.gserviceaccount.com" \
  --role="roles/iam.serviceAccountUser"

# Production
gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:transcription-svc-prod@${PROJECT_ID}.iam.gserviceaccount.com" \
  --role="roles/artifactregistry.writer"

gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:transcription-svc-prod@${PROJECT_ID}.iam.gserviceaccount.com" \
  --role="roles/run.admin"

gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:transcription-svc-prod@${PROJECT_ID}.iam.gserviceaccount.com" \
  --role="roles/iam.serviceAccountUser"
```

### 3. Create Secrets (⚠️ CRITICAL: Use `echo -n`!)

```bash
# Staging secrets (MUST use echo -n to prevent trailing newlines!)
echo -n "YOUR_LIVEKIT_API_KEY" | gcloud secrets create transcription-livekit-api-key-staging --data-file=- --project=$PROJECT_ID
echo -n "YOUR_LIVEKIT_API_SECRET" | gcloud secrets create transcription-livekit-api-secret-staging --data-file=- --project=$PROJECT_ID
echo -n "YOUR_DEEPGRAM_API_KEY" | gcloud secrets create transcription-deepgram-api-key-staging --data-file=- --project=$PROJECT_ID
echo -n "$(openssl rand -base64 48)" | gcloud secrets create transcription-jwt-secret-staging --data-file=- --project=$PROJECT_ID
echo -n "$(openssl rand -base64 32)" | gcloud secrets create transcription-backend-api-key-staging --data-file=- --project=$PROJECT_ID

# Production secrets (same pattern)
echo -n "YOUR_PROD_LIVEKIT_API_KEY" | gcloud secrets create transcription-livekit-api-key-production --data-file=- --project=$PROJECT_ID
echo -n "YOUR_PROD_LIVEKIT_API_SECRET" | gcloud secrets create transcription-livekit-api-secret-production --data-file=- --project=$PROJECT_ID
echo -n "YOUR_PROD_DEEPGRAM_API_KEY" | gcloud secrets create transcription-deepgram-api-key-production --data-file=- --project=$PROJECT_ID
echo -n "$(openssl rand -base64 64)" | gcloud secrets create transcription-jwt-secret-production --data-file=- --project=$PROJECT_ID
echo -n "$(openssl rand -base64 32)" | gcloud secrets create transcription-backend-api-key-production --data-file=- --project=$PROJECT_ID
```

### 4. Verify Secrets (NO TRAILING NEWLINES!)

```bash
# Check for trailing newlines (should NOT end with "0a")
for secret in \
  transcription-livekit-api-key-staging \
  transcription-deepgram-api-key-staging \
  transcription-jwt-secret-staging
do
  echo "Checking $secret..."
  gcloud secrets versions access latest --secret=$secret --project=$PROJECT_ID | xxd | tail -1
done
```

### 5. Grant Secret Access

```bash
# Staging
for secret in transcription-livekit-api-key-staging transcription-livekit-api-secret-staging transcription-deepgram-api-key-staging transcription-jwt-secret-staging transcription-backend-api-key-staging; do
  gcloud secrets add-iam-policy-binding $secret \
    --member="serviceAccount:transcription-svc-staging@${PROJECT_ID}.iam.gserviceaccount.com" \
    --role="roles/secretmanager.secretAccessor" \
    --project=$PROJECT_ID
done

# Production
for secret in transcription-livekit-api-key-production transcription-livekit-api-secret-production transcription-deepgram-api-key-production transcription-jwt-secret-production transcription-backend-api-key-production; do
  gcloud secrets add-iam-policy-binding $secret \
    --member="serviceAccount:transcription-svc-prod@${PROJECT_ID}.iam.gserviceaccount.com" \
    --role="roles/secretmanager.secretAccessor" \
    --project=$PROJECT_ID
done
```

### 6. Update Cloud Run YAML Files

```bash
# Replace placeholders in both YAML files
sed -i '' "s/PROJECT_ID/$PROJECT_ID/g" cloud-run-staging.yaml
sed -i '' "s/REGION/$REGION/g" cloud-run-staging.yaml
sed -i '' "s/PROJECT_ID/$PROJECT_ID/g" cloud-run-production.yaml
sed -i '' "s/REGION/$REGION/g" cloud-run-production.yaml

# Update BACKEND_URL in both files manually
```

### 7. Build & Test Locally

```bash
# Build TypeScript
npm run build

# Test locally with npm (runs on port 3001 by default)
npm start

# Test health endpoints (port 3001 for local npm)
curl http://localhost:3001/health/liveness
curl http://localhost:3001/health/readiness
curl http://localhost:3001/health/startup

# Build Docker image
docker build -t transcription-test .

# Test Docker container (use port 8081 to avoid conflicts with backend on 8080)
docker run -d --name test -p 8081:8080 \
  -e NODE_ENV=local \
  -e LIVEKIT_URL=$LIVEKIT_URL \
  -e LIVEKIT_API_KEY=$LIVEKIT_API_KEY \
  -e LIVEKIT_API_SECRET=$LIVEKIT_API_SECRET \
  -e DEEPGRAM_API_KEY=$DEEPGRAM_API_KEY \
  -e JWT_SECRET=$JWT_SECRET \
  -e BACKEND_URL=$BACKEND_URL \
  -e BACKEND_API_KEY=$BACKEND_API_KEY \
  transcription-test

# Wait and test Docker (container runs on internal 8080, exposed as 8081)
sleep 15
curl http://localhost:8081/health/liveness
docker ps  # Should show "healthy"
docker stop test && docker rm test
```

### 8. Deploy to Staging

```bash
# Build for Cloud Run (Mac users MUST specify platform!)
docker buildx build \
  --platform linux/amd64 \
  -t $REGION-docker.pkg.dev/$PROJECT_ID/transcription-service/app:staging-latest \
  --push \
  .

# Deploy to Cloud Run
gcloud run services replace cloud-run-staging.yaml \
  --region=$REGION \
  --project=$PROJECT_ID

# Enable public access
gcloud run services add-iam-policy-binding transcription-service-staging \
  --region=$REGION \
  --member="allUsers" \
  --role="roles/run.invoker" \
  --project=$PROJECT_ID

# Get URL and test
SERVICE_URL=$(gcloud run services describe transcription-service-staging \
  --region=$REGION \
  --format='value(status.url)' \
  --project=$PROJECT_ID)

echo "Service URL: $SERVICE_URL"
sleep 20
curl -f $SERVICE_URL/health/liveness
curl -f $SERVICE_URL/health/readiness
```

### 9. Deploy to Production

```bash
# Build for Cloud Run (Mac users MUST specify platform!)
docker buildx build \
  --platform linux/amd64 \
  -t $REGION-docker.pkg.dev/$PROJECT_ID/transcription-service/app:production-latest \
  --push \
  .

# Deploy to Cloud Run
gcloud run services replace cloud-run-production.yaml \
  --region=$REGION \
  --project=$PROJECT_ID

# Enable public access
gcloud run services add-iam-policy-binding transcription-service-production \
  --region=$REGION \
  --member="allUsers" \
  --role="roles/run.invoker" \
  --project=$PROJECT_ID

# Get URL and test
SERVICE_URL=$(gcloud run services describe transcription-service-production \
  --region=$REGION \
  --format='value(status.url)' \
  --project=$PROJECT_ID)

echo "Service URL: $SERVICE_URL"
sleep 20
curl -f $SERVICE_URL/health/liveness
curl -f $SERVICE_URL/health/readiness
```

### 10. Setup CI/CD (GitHub Actions)

1. Setup Workload Identity Federation (see instructions below)
2. Add GitHub Secrets:
   - `GCP_WORKLOAD_IDENTITY_PROVIDER`
   - `GCP_SERVICE_ACCOUNT_STAGING`: `transcription-svc-staging@rehears3-trans-svc.iam.gserviceaccount.com`
   - `GCP_SERVICE_ACCOUNT_PRODUCTION`: `transcription-svc-prod@rehears3-trans-svc.iam.gserviceaccount.com`
3. Workflow files already have correct `PROJECT_ID: rehears3-trans-svc`
4. Push to `staging` or `main` branch

#### Workload Identity Federation Setup

```bash
# Set your variables
export PROJECT_ID="rehears3-trans-svc"
export GITHUB_REPO="YOUR_GITHUB_USERNAME/transcription-service"  # Replace with your username

# Get project number
export PROJECT_NUMBER=$(gcloud projects describe $PROJECT_ID --format='value(projectNumber)')

# Create workload identity pool
gcloud iam workload-identity-pools create github-actions-pool \
  --project="$PROJECT_ID" \
  --location="global" \
  --display-name="GitHub Actions Pool"

# Create OIDC provider for GitHub
gcloud iam workload-identity-pools providers create-oidc "github-provider" \
  --project="$PROJECT_ID" \
  --location="global" \
  --workload-identity-pool="github-actions-pool" \
  --display-name="GitHub Provider" \
  --attribute-mapping="google.subject=assertion.sub,attribute.actor=assertion.actor,attribute.repository=assertion.repository,attribute.repository_owner=assertion.repository_owner" \
  --issuer-uri="https://token.actions.githubusercontent.com"

# Get the workload identity pool ID
export WORKLOAD_IDENTITY_POOL_ID=$(gcloud iam workload-identity-pools describe github-actions-pool \
  --project="$PROJECT_ID" \
  --location="global" \
  --format="value(name)")

# Allow GitHub Actions to impersonate staging service account
gcloud iam service-accounts add-iam-policy-binding "transcription-svc-staging@${PROJECT_ID}.iam.gserviceaccount.com" \
  --project="$PROJECT_ID" \
  --role="roles/iam.workloadIdentityUser" \
  --member="principalSet://iam.googleapis.com/${WORKLOAD_IDENTITY_POOL_ID}/attribute.repository/${GITHUB_REPO}"

# Allow GitHub Actions to impersonate production service account
gcloud iam service-accounts add-iam-policy-binding "transcription-svc-prod@${PROJECT_ID}.iam.gserviceaccount.com" \
  --project="$PROJECT_ID" \
  --role="roles/iam.workloadIdentityUser" \
  --member="principalSet://iam.googleapis.com/${WORKLOAD_IDENTITY_POOL_ID}/attribute.repository/${GITHUB_REPO}"

# Get the Workload Identity Provider Resource Name (for GitHub Secrets)
gcloud iam workload-identity-pools providers describe "github-provider" \
  --project="$PROJECT_ID" \
  --location="global" \
  --workload-identity-pool="github-actions-pool" \
  --format="value(name)"
```

The last command outputs the provider path - copy this for the `GCP_WORKLOAD_IDENTITY_PROVIDER` GitHub secret.

## ⚠️ Critical Reminders

### Secret Creation
- ✅ **ALWAYS** use `echo -n` (prevents trailing newlines)
- ❌ **NEVER** use plain `echo` (adds `\n` character)
- ✅ Verify with `xxd` - should NOT end with `0a`

### Health Check Paths
- ✅ Paths are `/health/liveness`, `/health/readiness`, `/health/startup`
- ❌ NO `/api` prefix (routes mounted directly)
- ✅ Match across: Express routes, Cloud Run YAML, Dockerfile HEALTHCHECK

### Docker Platform (Mac Users)
- ✅ **MUST** use `--platform linux/amd64` when building on Mac
- ❌ Don't skip platform flag or deployment will fail
- ✅ GitHub Actions don't need this (already amd64)

### Public Access
- ✅ Run `add-iam-policy-binding` after EVERY deployment
- ❌ Cloud Run YAML `ingress: all` does NOT grant public access
- ✅ Verify: `curl https://SERVICE_URL/health`

## 📁 Files Created

**Configuration:**
- `src/config/gcp-secrets.ts` - Secret Manager client
- `src/config/environment.ts` - Environment validation
- `src/routes/health.ts` - Health check endpoints
- `src/middleware/cors.ts` - CORS config
- `src/middleware/security.ts` - Security headers
- `src/middleware/apiKey.ts` - API key validation

**Docker:**
- `Dockerfile` - Multi-stage TypeScript build
- `.dockerignore` - Build exclusions
- `docker-compose.yml` - Local testing
- `cloud-run-staging.yaml` - Staging config
- `cloud-run-production.yaml` - Production config

**CI/CD:**
- `.github/workflows/pr-checks.yml` - PR validation
- `.github/workflows/deploy-staging.yml` - Staging deployment
- `.github/workflows/deploy-production.yml` - Production deployment

**Updated:**
- `src/config/index.ts` - Added Secret Manager integration
- `src/server.ts` - Added middleware, health routes, graceful shutdown
- `package.json` - Added dependencies

## 🔧 Common Commands

```bash
# View logs
gcloud run services logs tail transcription-service-staging --region=$REGION

# Update deployment
gcloud run services replace cloud-run-staging.yaml --region=$REGION

# Rollback
gcloud run services update-traffic transcription-service-staging \
  --to-revisions=REVISION_NAME=100 \
  --region=$REGION

# List revisions
gcloud run revisions list --service=transcription-service-staging --region=$REGION
```

## 🆘 Troubleshooting

**"LIVEKIT_URL must be a valid uri"**
→ Check validation schema supports `wss://` scheme

**404 on health checks**
→ Verify paths in Cloud Run YAML match `/health/liveness` (no `/api` prefix)

**Permission denied on secrets**
→ Grant service account `roles/secretmanager.secretAccessor`

**403 after deployment**
→ Run `add-iam-policy-binding` to enable public access

**Docker architecture error**
→ Use `--platform linux/amd64` on Mac

**Validation errors on secrets**
→ Check for trailing newlines with `xxd`, recreate with `echo -n`

## 📚 Full Documentation

See [TRANSCRIPTION-SERVICE-DEPLOYMENT-GUIDE.md](./TRANSCRIPTION-SERVICE-DEPLOYMENT-GUIDE.md) for:
- Complete phase-by-phase implementation details
- All 8 critical issues and solutions
- Detailed troubleshooting guide
- Rollback procedures
- Security best practices
