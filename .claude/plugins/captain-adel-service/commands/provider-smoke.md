---
description: One-turn connectivity check against a configured provider endpoint
argument-hint: [allam|jais|generic]
allowed-tools:
  - Bash
  - Read
  - Grep
---

Before any eval, confirm the endpoint is actually reachable and speaking the
shape the factory expects.

```bash
npm run provider:smoke     # generic, uses the configured provider
npm run allam:smoke
npm run jais:smoke
```

Every provider is **OFF until its `<NAME>_BASE_URL` is set** — a smoke failure
is usually missing config, not a broken endpoint. Check, in order:

1. `<NAME>_BASE_URL`, `<NAME>_MODEL`, `<NAME>_API_KEY` for the provider you are
   smoking.
2. `MODEL_PROVIDER` / `ARABIC_PROVIDER` — routing only reaches an Arabic
   provider when the Arabic character ratio clears ~0.4 after Latin aviation
   acronyms are stripped, so an English test prompt will not exercise it.
3. `ADEL_GEMINI_TIMEOUT_MS` (default 60000) if the failure is a timeout rather
   than a refusal.

Every Arabic provider is a thin module over `src/brain/providers/openai-compatible.js`;
if the wire shape is wrong, fix it in the factory rather than in one provider.

Report the provider, the model string the endpoint reported, and the raw
failure if it failed. Never paste a key into the transcript or into
`.env.example`.
