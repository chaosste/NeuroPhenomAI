# Security Policy

## Supported versions

Security fixes are applied to the latest release on `main` (currently `1.3.x` per `package.json`). Older tags are not patched.

## Reporting a vulnerability

Please report security issues privately — do not open a public GitHub issue for vulnerabilities.

- Email: **steve@newpsychonaut.com**
- Or use [GitHub private vulnerability reporting](https://github.com/chaosste/NeuroPhenomAI/security/advisories/new) if available on the repo

You can expect an acknowledgement within a few days. If the report is accepted, we will coordinate a fix and disclosure timeline. If declined, we will explain why.

## Trust model (short)

- **Client AI (default):** Users supply their own Google Gemini API key in Settings. The key is kept in browser session storage for the session; it is not sent to this project's server.
- **Interview data:** Sessions and recordings are persisted locally in the browser for data sovereignty.
- **Production server:** `server.js` serves the static build and optional Azure OpenAI / Foundry routes (`/api/welcome`, `/api/analyze`). Those routes require `AZURE_OPENAI_*` env vars and are rate-limited. The React UI does not call them today.
- **Secrets:** Never commit `.env` files or API keys. See [`.env.example`](.env.example) for server variable names only.
