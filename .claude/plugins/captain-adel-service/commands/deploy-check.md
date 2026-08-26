---
description: Pre-deploy checklist for the Cloud Run service — gate, secrets, region, health
allowed-tools:
  - Bash
  - Read
  - Grep
  - Glob
---

Walk this before running `deploy/deploy.sh` or merging to `main` (which deploys
via `deploy.yml` when `GCP_SA_KEY` is set).

1. **The gate**, exactly as CI runs it:
   `npm run smoke && npm run smoke:frontend && npm run test:unit && npm run eval:dry`.
2. **Secrets**: every var the change needs exists in Secret Manager, and none of
   them exists in the repo. `.env.example` holds placeholders only — confirm no
   live value was added to it in this diff.
3. **Region**: Cloud Run in a KSA region (me-central2, me-central1 fallback).
   PDPL means the chat model runs in-Kingdom for production; HF/US/EU endpoints
   are dev and eval only.
4. **Resources**: ≥2 GiB RAM. The BM25 index is resident — an under-provisioned
   revision dies under load rather than at startup.
5. **Surface diffs**: if `public/*.html` changed, `smoke:frontend` must be green
   — the `.disclaimer-strip` and `.site-nav` are hand-duplicated across all
   eight pages and an edit to one is an edit to all eight. If a third-party
   asset was added, the hand-maintained CSP in `src/server.js` needs an explicit
   entry.
6. **Contract**: if `/v1/chat`'s response shape changed, `X-Adel-Api-Version`
   bumps only on a breaking change — and `contracts/flygaca-family.json` is
   owned by `ay2m/FlyGACA` for the `chat` block, so a shape change is a
   three-repo PR, not a local edit.
7. **After deploy**: `/health` must answer, and a real question in **both**
   languages must come back with a citation. The landing app is separate — it
   deploys by hand via wrangler (`landing/README.md`), not by this pipeline.

Report each item as done / not applicable / blocked. Never claim a deploy
happened that you did not perform.
