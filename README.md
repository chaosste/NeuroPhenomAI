<div align="center">

# 🧠 NeuroPhenom AI

🎚️ High-Fidelity Clinical Interface for Neurophenomenology

**Live demo:** [neurophenomai.newpsychonaut.com](https://www.neurophenomai.newpsychonaut.com/)

<img src="Images/neurophenom-ai-report-quick.gif" width="800" alt="NeuroPhenom AI — microphenomenology interview and analysis platform" style="margin-bottom: 50px;" />

꩜ Map pre-reflective subjective experience through granular interview techniques.

<br>

<img src="Images/neurophenom-ai-confidentiality.gif" width="800" alt="NeuroPhenom AI — microphenomenology interview and analysis platform" style="margin-bottom: 50px;" />

🎙️ Use the trained AI research interviewer or record and transcribe.

<br>

<img src="Images/neurophenom-ai-codification.gif" width="800" alt="NeuroPhenom AI — microphenomenology interview and analysis platform" style="margin-bottom: 50px;" />

🧩 AI analyses and codifies each interview.

<br>

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](LICENSE)

</div>

---

## 💿 About

High-fidelity clinical interface for mapping pre-reflective subjective experience. The conversational AI is trained in granular microphenomenology interview techniques, on altered states of consciousness in particular. Codify and theme your subject data alongside NeuroPhenom AI's granular LLM engine. Analyse the micro-dynamics of lived moments through diachronic slicing and structural synthesis.

Featuring a stark black-and-white minimalist design, the interface stays out of the way and lets the phenomenological work take centre stage.

## 🗝️ Requirements

- Node.js 22 (Volta-pinned in `package.json`)
- Google Gemini API key (entered in the in-app Settings menu; stored in the browser session)
- Chrome recommended for live interview audio (Web Audio + Gemini Live). Select your USB microphone in Settings; prefer wired headphones during AI interviews.
- **Cloud Run demo clone** (exact AI Studio source): sibling repo [NeuroPhenomAI-Showcase](https://github.com/chaosste/NeuroPhenomAI-Showcase) — see [docs/HANDOFF_2026-07-10.md](docs/HANDOFF_2026-07-10.md). Gold applet: `https://neurophenom-ai-572556903588.us-west1.run.app/`. In-repo Cloud Run notes: [docs/CLOUD_RUN_SHOWCASE.md](docs/CLOUD_RUN_SHOWCASE.md).


## ✨ Features

- 🎙️ **Live Interview Sessions** — AI-guided microphenomenology interviews in real time
- 🎤 **Standalone Recorder** — Capture audio independently of the interview system
- 📊 **Analysis View** — Review and codify interview data with AI assistance
- 🔬 **Diachronic Slicing** — Temporal decomposition of experiential moments
- 🧩 **Structural Synthesis** — Map the architecture of subjective states
- ✅ **Consent Protocols** — Built-in consent management for ethical research practice
- 💾 **Local Storage** — Interviews saved locally for data sovereignty
- ⚙️ **Configurable** — Language, microphone device, AI voice, and interview mode settings
- 🖤 **Minimalist Design** — Clean black/white aesthetic focused on the work

## 🥪 Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19 + TypeScript, Vite |
| Client AI | Google Gemini API (BYOK via Settings) |
| Production server | Express (`server.js`) serving `dist/` |
| Optional server AI | Azure OpenAI / Foundry (`/api/*` — not used by the UI today) |
| Deployment | Azure App Service (primary); Cloud Run showcase (Gemini proxy) |

## 🏗️ Architecture

```
index.html → index.tsx → App.tsx
                           ├─ LiveInterviewSession  ─┐
                           ├─ AnalysisView          ├─→ services/geminiService (browser Gemini)
                           └─ StandaloneRecorder    ─┘

npm start → server.js → static dist/ + /api/health|/api/welcome|/api/analyze (Azure Foundry)
```

- **Today:** the React app talks to Gemini in the browser with your own API key (privacy-first BYOK).
- **Server Foundry routes** in `server.js` are ready for a future server-mediated path; the UI does not call them yet.
- Methodology baseline: [`docs/knowledge/core/NP_CANONICAL_SPEC.md`](docs/knowledge/core/NP_CANONICAL_SPEC.md)
- Public one-pager: [`docs/github-pages/index.html`](docs/github-pages/index.html)

## 🏎️ Quick start

```bash
git clone https://github.com/chaosste/NeuroPhenomAI.git
cd NeuroPhenomAI
npm install
npm run dev
```

1. Open the app (Vite defaults to `http://localhost:8080`).
2. Open **Settings** and paste your Google Gemini API key.
3. Start a live interview or use the standalone recorder.

Production-style local run (build + Express):

```bash
npm run build
npm start
```

Server env vars (optional Azure Foundry, rate limits) are documented in [`.env.example`](.env.example).

## 🦞 Workflow Protocol

Use the worktree/branch protocol in:
- [`docs/WORKTREE_WORKFLOW_PROTOCOL.md`](docs/WORKTREE_WORKFLOW_PROTOCOL.md)

Operational canon:
- <https://github.com/chaosste/ops-playbooks>

## 🧦 Related Projects

> 💡 **Like NeuroPhenom AI? You'll love [MicroPhenom AI](https://github.com/chaosste/MicroPhenom-AI)** — the vanilla edition for granular reports on wider lived experience.

> 𓂀 For psychedelic trip report interviews with theatrical deity-themed voices, see [Anubis](https://github.com/chaosste/Anubis).

## ⬇ Disclaimer

NeuroPhenom AI is a research tool for exploring subjective experience. It does not provide medical, psychological, or therapeutic advice. It is not a substitute for professional support.

---

<div align="center">

**Built by [Steve Beale](https://newpsychonaut.com)**

[newpsychonaut.com](https://newpsychonaut.com)

© 2026 Stephen Beale. MIT License.

</div>
