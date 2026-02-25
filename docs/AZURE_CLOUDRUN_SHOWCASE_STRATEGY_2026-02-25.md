# Azure + Cloud Run Showcase Strategy (2026-02-25)

## 1) Canonical Naming Convention

Use `*ai` as the public/canonical product identity across domains, health payloads, and local storage keys.

| Product | Canonical ID | Canonical Public Host | Current Azure App Service |
|---|---|---|---|
| NeuroPhenom | `neurophenomai` | `www.neurophenomai.newpsychonaut.com` | `neurophenom-finesse` |
| MicroPhenom | `microphenomai` | `www.microphenomai.newpsychonaut.com` | `microphenom` |
| Facilitator | `facilitatorai` | `www.facilitatorai.newpsychonaut.com` | `facilitator-ai` |
| Anubis | `anubisai` | `www.anubisai.newpsychonaut.com` (target) | `anubis-ai` (target) |

Notes:
- Keep existing Azure app names where already provisioned to avoid migration downtime.
- Normalize runtime/service IDs and browser storage keys to canonical IDs with fallback reads from legacy keys.

## 2) Default Runtime Policy

- Default production runtime: **Azure App Service** for all public traffic.
- Realtime/voice default: **Azure OpenAI Realtime** where already integrated.
- Gemini/Cloud Run stays available as a **showcase mode** only.

## 3) Cloud Run Showcase Mode (Cost-Controlled)

- Use explicit mode switch:
  - `SHOWCASE_MODE=false` (default)
  - `SHOWCASE_MODE=true` (manual opt-in only)
- Restrict showcase usage:
  - Time-window limited demos (for example 2-hour blocks).
  - Low max instances (for example `--max-instances=1`).
  - Concurrency cap per instance.
  - Request timeout caps.
  - Hard monthly budget alerts on GCP billing.
- Route strategy:
  - Main DNS points to Azure.
  - Optional `-showcase` subdomain points to Cloud Run during demos only.

## 4) Anubis on Azure Plan

Anubis differs architecturally (client-heavy Gemini Live). Recommended rollout:

1. Provision Azure App Service `anubis-ai` (Linux, Node LTS).
2. Add server endpoint parity (`/api/health` minimum, optional `/api/realtime/client-secret` if moving to Azure Realtime path).
3. Add GitHub Actions deploy workflow using publish profile (same hardened pattern as Neuro).
4. Add Cloudflare host `www.anubisai.newpsychonaut.com` -> Azure app hostname.
5. Keep Gemini Live path as selectable provider for showcase sessions.

## 5) Voice Quick Wins

- Anubis: keep English language output but strengthen accent steering via persona instructions (Egyptian/Levantine accented English with intelligibility constraints).
- Facilitator: set base instruction to fluent English with a gentle non-native inflection (clear diction).
- Keep voice labels explicit in settings so accent intent is obvious to testers.

## 6) Operational Guardrails

- Standardize health payload:
  - `status`/`ok`
  - `service` canonical ID (`*ai`)
  - `realtimeConfigured` where relevant
- Apply same secret shape across repos:
  - `AZURE_WEBAPP_PUBLISH_PROFILE`
  - `AZURE_OPENAI_*`
  - optional `GEMINI_API_KEY` for showcase mode only
- Add one checklist per repo:
  - DNS -> app mapping
  - TLS binding
  - workflow green deploy
  - `/api/health` validation
