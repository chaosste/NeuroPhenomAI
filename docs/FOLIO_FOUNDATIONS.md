# Folio Foundations (NeuroPhenom, Facilitator, MicroPhenom, Anubis)

This note captures shared architecture patterns that can be reused across the app portfolio.

## Shared foundations to standardize

1. `settings` contract:
   - language
   - privacyContract
   - increasedSensitivityMode
   - persistLocalData
   - provider credentials
2. API reliability baseline:
   - `/api/health` no-store
   - per-endpoint rate limits
   - structured error JSON
3. transcript lifecycle:
   - capture -> normalize speaker labels -> analyze -> codify -> export protocol package
4. codification baseline:
   - AI codebook suggestions as seeds
   - human-in-the-loop annotation edits
   - JSON protocol export for interoperability
5. security baseline:
   - never persist provider API keys to localStorage
   - optional encrypted local archives

## Cross-over modules to extract

1. Prompt policy module
   - canonical NP/MicroPhenom conduct rules
   - provider-specific wrappers (Gemini/OpenAI/Hume/Vertex)
2. Analysis schema module
   - shared JSON schema for summary/takeaways/modalities/diachronic/synchronic/codebook
3. UI module
   - shared transcript view + annotation panel + export controls
4. Ops module
   - deploy runner, domain onboarding, health check scripts

## Multi-agentic opportunities

1. Interview Agent
   - conducts elicitation using contract-aware pacing rules.
2. Analysis Agent
   - transforms transcript into structured NP output.
3. Codification Agent
   - proposes codebook and maps fragments to candidate labels.
4. QA Agent
   - checks output against protocol quality gates (no over-interpretation, evidence linked).
5. Deployment Agent
   - executes CI/CD + domain validation workflow.

## Recommended rollout order for reuse

1. unify settings + prompt policy
2. unify analysis schema and endpoint contract
3. unify codification/export surfaces
4. unify ops/deploy runbooks

