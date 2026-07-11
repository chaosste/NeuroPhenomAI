# AGENTS.md

## Cursor Cloud specific instructions

NeuroPhenom AI is a single-product **React 19 + TypeScript (Vite)** SPA for micro-phenomenology
interviews, with an optional Express production server (`server.js`). Package manager is **npm**
(Node 22, Volta-pinned in `package.json`). There is **no database** — sessions/settings persist in
the browser (`localStorage`/`sessionStorage`), so there are no backing services to boot.

Standard commands live in `package.json` scripts and the `README.md` "Quick start" — refer to those
rather than duplicating. Key durable/non-obvious notes:

- **Dev server:** `npm run dev` serves on port **8080**, host `0.0.0.0` (see `vite.config.ts`).
- **Build / type-check:** `npm run build` runs `tsc && vite build`. There is **no separate
  lint or test script** and no ESLint/test config — treat `npm run build` as the type-check/lint gate.
- **Production-style run:** `npm run build` then `npm start` (Express serves `dist/` on `PORT`,
  default **8080**). Because it also defaults to 8080, do not run `npm start` and `npm run dev`
  on the same port simultaneously — set `PORT` (e.g. `PORT=8090 npm start`) when the dev server is up.
  Health check: `GET /api/health`.
- **BYOK / AI features gated on a user key:** live interview, transcription, and analysis call the
  Google Gemini API using a key the user pastes into in-app **Settings** (stored client-side; no key
  is read from env for the UI). No Gemini key exists in this environment, so AI flows will fail with
  "Please add your Gemini API key in Settings" — the rest of the UI (home, settings, navigation,
  localStorage persistence) works fully without one. Full AI end-to-end testing requires a real
  Gemini API key entered in Settings.
- **CDN import map:** `index.html` loads React and other deps from `esm.sh` via an import map, so
  the browser needs egress to `esm.sh` (and `generativelanguage.googleapis.com` for Gemini). Vite dev
  still bundles locally; this mainly matters when opening the app in a browser.
- **Optional server AI (Azure OpenAI/Foundry `/api/*`)** is not called by the UI today; configure via
  `.env` (see `.env.example`) only if exercising that server path.
