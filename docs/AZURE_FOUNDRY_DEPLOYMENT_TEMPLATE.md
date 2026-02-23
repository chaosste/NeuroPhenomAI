# Azure + Foundry Deployment Template (Node Web App)

Use this template for each new app repo.

## 1) Azure Web App setup

1. Create Linux Web App (Node LTS).
2. In Web App -> **Configuration** -> **Application settings**, set:
   - `AZURE_OPENAI_ENDPOINT`
   - `AZURE_OPENAI_API_KEY`
   - `AZURE_OPENAI_DEPLOYMENT`
   - `AZURE_OPENAI_API_VERSION=2024-10-21`
3. Leave **Deployment slot setting** unchecked for these settings unless you use slots.
4. Ensure publishing credentials are enabled:
   - `basicPublishingCredentialsPolicies/scm = true`
   - `basicPublishingCredentialsPolicies/ftp = true`

## 2) GitHub repo secrets

Always set:

- `AZURE_WEBAPP_PUBLISH_PROFILE` (preferred path)

Optional OIDC path:

- `AZURE_CLIENT_ID`
- `AZURE_TENANT_ID`
- `AZURE_SUBSCRIPTION_ID`

## 3) GitHub repo variable

Optional but recommended:

- `AZURE_WEBAPP_HEALTHCHECK_URL=https://<your-default-hostname>/api/health`

This avoids hostname guessing in CI.

## 4) Workflow behavior (current)

- Build app
- Build production `node_modules`
- Package deploy artifact
- Deploy with publish profile if available
- Otherwise deploy with OIDC
- Run post-deploy health check with retries

## 5) Fast rollback

Use **Actions -> Build and deploy Node app to Azure Web App -> Run workflow** and set:

- `ref`: previous known-good commit SHA or tag
- optional `healthcheck_url`: explicit URL if needed

This redeploys a known-good revision without waiting for new code changes.

## 6) Troubleshooting

- If deploy says publish profile invalid:
  - re-enable SCM/FTP basic publishing credentials
  - refresh `AZURE_WEBAPP_PUBLISH_PROFILE` secret
- If app starts then stops:
  - check **Log stream -> Runtime** (not Platform)
  - verify server runtime/module format matches `package.json` (`type: module` vs CommonJS)
- If endpoint fails but app is running:
  - verify exact default hostname from Web App Overview.
