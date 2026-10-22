# Security Policy

## Supported versions

Security fixes are applied to the latest release on `main` (currently `1.3.x` per `package.json`). Older tags are not patched.

## Reporting a vulnerability

Please report security issues privately — do not open a public GitHub issue for vulnerabilities.

- Email: **steve@newpsychonaut.com**
- Or use [GitHub private vulnerability reporting](https://github.com/chaosste/NeuroPhenomAI/security/advisories/new) if available on the repo

You can expect an acknowledgement within a few days. If the report is accepted, we will coordinate a fix and disclosure timeline. If declined, we will explain why.

## Trust model (short)

- **Server-Side AI:** The application uses a full-stack Express server (`server.ts`) proxying Gemini SDK calls securely on the backend. The API key is managed via server environment variables (`GEMINI_API_KEY`) and never exposed to the client bundle.
- **Interview data:** Sessions and recordings are persisted locally in the browser's IndexedDB vault for complete data sovereignty.
- **Deployment:** Google Cloud Run containerized deployment via `Dockerfile` and `cloudbuild.yaml`.
- **Secrets:** Never commit `.env` files or API keys. See [`.env.example`](.env.example) for environment variable names.
