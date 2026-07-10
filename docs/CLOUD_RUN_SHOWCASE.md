# Cloud Run Showcase Deploy

Demo / showcase path for NeuroPhenomAI on Google Cloud Run with a **server-side Gemini Live proxy** (same pattern as the working AI Studio applet).

Production public traffic stays on **Azure App Service**.

## Why this exists

The AI Studio Cloud Run service (`neurophenom-ai` in `us-west1`) works well for demos because:

1. Gemini API key stays on the server
2. HTTP + WebSocket traffic is proxied via `/api-proxy`
3. The browser does not need a user-entered API key

This repo now supports the same model when built with `VITE_SHOWCASE_MODE=true` and `GEMINI_API_KEY` set on Cloud Run.

## One-time GCP setup

```bash
PROJECT=microphenom-ai
REGION=us-west1
SECRET=gemini-api-key

# Ensure secret exists (already present in this project as gemini-api-key)
# echo -n "$GEMINI_API_KEY" | gcloud secrets create "$SECRET" --project="$PROJECT" --data-file=-

# Artifact Registry repo (Cloud Build config expects this path)
gcloud artifacts repositories create cloud-run-source-deploy \
  --project="$PROJECT" \
  --repository-format=docker \
  --location="$REGION" \
  --quiet || true

# Deploy once from a local checkout
gcloud builds submit --project="$PROJECT" --config=cloudbuild.yaml \
  --substitutions=COMMIT_SHA="$(git rev-parse HEAD)" .
```

Service name: **`neurophenom-ai-showcase`** (does not overwrite the AI Studio applet `neurophenom-ai`).

## GitHub Actions CD

Workflow: [`.github/workflows/cloud_run_showcase.yml`](../.github/workflows/cloud_run_showcase.yml)

Required repo secrets:

| Secret | Purpose |
|--------|---------|
| `GCP_WORKLOAD_IDENTITY_PROVIDER` | WIF provider for GitHub → GCP |
| `GCP_SERVICE_ACCOUNT` | Deployer SA email |

Until WIF is configured, use the local `gcloud builds submit` command above, or `workflow_dispatch` after secrets exist.

## Demo URL

After deploy:

```bash
gcloud run services describe neurophenom-ai-showcase \
  --project=microphenom-ai --region=us-west1 \
  --format='value(status.url)'
```

Optional: map `showcase.neurophenomai.newpsychonaut.com` → that URL (keep `www` on Azure).

## Cost guardrails

- `min-instances=0`, `max-instances=2`
- Prefer short demo windows
- Budget alerts on `microphenom-ai`
