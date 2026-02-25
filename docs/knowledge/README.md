# NeuroPhenom Knowledge Pack

This folder is the canonical research/context pack for model behavior, interview protocol, and codification quality.

## Folder layout

- `core/`: distilled runtime guidance used for model/system prompts and analysis policy.
- `sources/`: selected core source documents copied from your desktop corpus.
- `reference/`: full secondary library for deep research and future iterations.

## Strategy (how much is too much)

Use this budget for runtime prompts and model instructions:

1. Core runtime guidance target: 1,200 to 2,500 words.
2. Hard upper bound before drift/noise risk: 3,000 words.
3. If more detail is needed, keep details in `reference/` and fold only tested deltas into `core/`.

## Recommended workflow

1. Keep interview and analysis logic anchored to `core/NP_CANONICAL_SPEC.md`.
2. When adding findings from new papers, update `core/CHANGELOG.md` with one-line rationale.
3. Treat `sources/` and `reference/` as evidence base, not direct runtime prompt payload.

## Current runtime source set

- Training Guide - Neurophenomenological Interview
- Privacy contract
- Psychedelic NP framework
- Why Your Trip Report is a Scientific Treasure
- phenom ai prompt
