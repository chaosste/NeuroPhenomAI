# Context Budget Guide

Use these limits to keep prompt quality stable:

- Interview system prompt: 600 to 1,000 words.
- Analysis task prompt: 350 to 800 words.
- Combined runtime policy and instructions: <= 2,500 words.

If you need new behavior:

1. Add exactly one new rule.
2. Test output quality on 3 transcripts.
3. Keep the rule only if it measurably improves consistency.

Anti-patterns:

- Stacking entire papers into runtime prompts.
- Repeating overlapping rules in multiple places.
- Expanding style instructions without behavior-level benefit.
