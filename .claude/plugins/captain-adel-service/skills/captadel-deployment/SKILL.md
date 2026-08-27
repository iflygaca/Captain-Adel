---
name: captadel-deployment
description: The procedure for shipping a revision — the gate exactly as CI runs it, image and sizing constraints, secrets, region, the hand-maintained CSP, and what is deliberately outside the workflows. Use before a deploy, when changing CI, env or secrets, and when the health check or deploy gate fails.
---

# Shipping a revision

Role context belongs to the `deploy-runner` agent. This is the procedure.

Deploying is mechanical. The risk is everything around it — secrets, region,
sizing, and the gate that is supposed to stop a bad revision.

## Run the gate before you do anything else

```bash
npm run smoke && npm run smoke:frontend && npm run test:unit && npm run eval:dry
```

That is `deploy.yml`'s gate verbatim. `ci.yml`'s `build` job runs
`smoke` + `smoke:frontend` + `test:coverage` + `eval:dry`, then a **report-only**
`npm audit --omit=dev`. The **live** `npm run eval` is a separate
weekly/dispatch job gated on `GEMINI_API_KEY` — it is not in the push path, so a
green PR has not exercised a real model call.

`eval:dry` checks structure without keys. It is not a substitute for the live
eval, and an agent that could not run the live one must say so rather than let
the dry run stand in.

## The image, and the one number you cannot lower

`node:20-slim`, `npm ci --omit=dev`, port **8787**, **≥2 GiB RAM**. The BM25
index is resident in memory — sizing below 2 GiB is how the service starts
OOM-killing under load. Hybrid retrieval (`EMBEDDINGS_BASE_URL` + the dense
index) adds ~190 MB resident on top.

`MIN_INSTANCES=1` keeps one warm so the index stays resident; `MAX_INSTANCES=10`.
The Dockerfile is at the repo root — `deploy/docker-compose.yml` is local only.

## Region

`deploy/deploy.sh` deploys to `me-central2` (Dammam) and refuses any other
`REGION` value — the script exits before touching `gcloud` if you set it to
anything else. This is deliberate, not a default that can be overridden: Doha
(`me-central1`) is in Qatar, a different country, so it can never satisfy
PDPL's in-Kingdom requirement, whatever a runbook or comment elsewhere claims.

If `gcloud` rejects `me-central2` for a project (`LOCATION_POLICY_VIOLATED`),
that is a quota/allowlist request to Google — never a reason to point `REGION`
somewhere else. The service cannot deploy until access is granted.

## Secrets

- **No secrets in code, ever.** All config comes from env; `.env` is gitignored
  and `.env.example` holds **placeholders only** — `GEMINI_API_KEY=` is blank
  there and stays blank.
- `deploy/deploy.sh secrets` creates/updates Secret Manager entries from env
  vars, then exits.
- Name every environment variable or secret your change newly requires. A
  revision that needs an unset variable fails at runtime, not at the gate.

## Things that break quietly

- **Route ordering is load-bearing.** The billing webhook mounts
  `express.raw` **before** the global `express.json`. Reordering the mounts
  breaks signature verification on a path no unit test covers.
- **The CSP is tight and hand-maintained** in `src/server.js`. Any new
  third-party asset needs an explicit edit. The deliberate exceptions are
  gstatic / apis.google.com (Firebase Auth) and cdn / api.moyasar.com (card
  entry and 3-D Secure).
- **Fail-open quota.** Any Firestore error allows the request. A deploy change
  must never turn a metering dependency into an availability dependency.
- **Firestore is blanket-deny.** The browser never opens it directly.

## What is deliberately outside the workflows

`landing/` (Vite + React, EN + `/ar/`) is served by the Cloudflare Worker
`captadel` and deployed **by hand via wrangler**, on purpose. It is in neither
workflow. The runbook is `landing/README.md`. Don't wire it into CI as a
"fix" — that is a decision, not an oversight.

## Before you hand back

Run the gate, then say plainly whether you actually deployed. **A green gate is
not a deployed revision**, and `deploy.yml` health-checks `/health` after the
push — quote that result if you have it, or say you don't.
