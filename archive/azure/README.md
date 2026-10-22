# Archived Azure Deployment Assets

This archive preserves legacy configuration and deployment scripts previously used for Azure App Service and Azure OpenAI Foundry deployments:

- `server.js`: Legacy Express proxy server for Azure OpenAI Foundry. (Replaced by `server.ts` running the modern `@google/genai` architecture).
- `workflows/azure_webapp_workflow.yml`: GitHub Actions CI/CD deployment workflow targeting Azure Web Apps.
- `workflows/azure_webapp_rollback.yml`: Automated rollback workflow for Azure Web Apps.
- `workflows/post_deploy_smoke.yml`: Azure Web App endpoint smoke verification tests.
- `docs/AZURE_FOUNDRY_DEPLOYMENT_TEMPLATE.md`: Legacy setup instructions for Azure AI Foundry models.
- `docs/AZURE_CLOUDRUN_SHOWCASE_STRATEGY_2026-02-25.md`: Historic dual-cloud notes.
- `config/domain-onboard.template.env`: Azure custom domain verification identifiers.

### Active Deployment Target
The active deployment architecture is **Google Cloud Run**, configured via `Dockerfile`, `cloudbuild.yaml`, and `.github/workflows/cloud_run_showcase.yml`.
