# Google Cloud Run Deployment Guide

Primary production deployment guide for NeuroPhenom AI on Google Cloud Run with server-side Gemini AI integration (`gemini-3.8-flash`, `gemini-3.8-live`, and `gemini-3.5-transcribe`).

## Overview

The containerized deployment on Google Cloud Run provides:

1. **Secure API Key Management:** `GEMINI_API_KEY` is maintained via Secret Manager and accessed purely server-side.
2. **WebSocket Support:** Native WebSocket proxying on `/live` for low-latency conversational audio.
3. **Scale-to-Zero Efficiency:** Instant scale-to-zero when idle, minimizing runtime costs (`min-instances=0`).
4. **Health Check Probing:** `/api/health` endpoint responding with system status and latency verification.

## Deployment Setup

### 1. Build & Deploy via Cloud Build

```bash
PROJECT=microphenom-ai
REGION=us-west1
SECRET=gemini-api-key

# Submit Cloud Build to compile container image and deploy to Cloud Run
gcloud builds submit \
  --project="$PROJECT" \
  --config=cloudbuild.yaml \
  --substitutions=COMMIT_SHA="$(git rev-parse HEAD)" \
  .
```

### 2. Manual `gcloud run deploy` (Direct Container)

```bash
# Build local docker image
docker build -t gcr.io/$PROJECT/neurophenom-ai:latest .

# Push image
docker push gcr.io/$PROJECT/neurophenom-ai:latest

# Deploy to Cloud Run
gcloud run deploy neurophenom-ai \
  --image=gcr.io/$PROJECT/neurophenom-ai:latest \
  --project="$PROJECT" \
  --region="$REGION" \
  --platform=managed \
  --allow-unauthenticated \
  --set-secrets=GEMINI_API_KEY=gemini-api-key:latest \
  --port=8080
```

## Continuous Deployment via GitHub Actions

Workflow: [`.github/workflows/cloud_run_showcase.yml`](../.github/workflows/cloud_run_showcase.yml)

Required GitHub Repository Secrets:

| Secret | Purpose |
|--------|---------|
| `GCP_WORKLOAD_IDENTITY_PROVIDER` | Workload Identity Federation provider ID |
| `GCP_SERVICE_ACCOUNT` | Service Account email with Cloud Run Admin & Cloud Build Editor permissions |

## Health Check & Verification

Once deployed, query the health probe endpoint:

```bash
URL="$(gcloud run services describe neurophenom-ai --project=$PROJECT --region=$REGION --format='value(status.url)')"
curl -s "${URL}/api/health"
```
Expected response:
```json
{
  "ok": true,
  "status": "healthy",
  "service": "neurophenom-ai",
  "version": "1.4.0",
  "platform": "google-cloud-run"
}
```
