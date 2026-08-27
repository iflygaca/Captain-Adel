---
name: pdpl-learner-data
description: The procedure for touching learner data — the Firestore collections, the ordered erasure path and why payment markers are tombstoned, fail-open quota, and how to state residency honestly. Use when adding a collection or field, changing the delete path or quota, or writing anything about where data lives.
---

# Touching learner data

Role context belongs to the `deploy-runner` and `corpus-data` agents. This is
the procedure for the personal-data half.

## What is stored, and where

Firestore is **blanket-deny** (`firestore.rules`) — the browser never opens it
directly; the Admin SDK bypasses rules server-side. The collections:

| Collection | Holds |
| --- | --- |
| `users/{uid}` | Profile + entitlement |
| `subscriptions/{uid}` | Subscription state; drives the renewals cron query |
| `moyasarCustomers/{uid}` | The saved card token — the most sensitive doc |
| `checkoutIntents/{uuid}` | Keyed by uuid, carries `uid` |
| `moyasarPayments/{paymentId}` | The settle-once idempotency marker |
| `adelQuota/{stamp}__{key}` | Counters; uid appears **only in the doc id** |

Collect nothing beyond what a feature needs. No passport, address, biometrics,
voice recordings or face data — and instructor–learner conversations are never
recorded; interactions are text-only event markers.

## The erasure path is ordered, and the order is the design

`POST /v1/account/delete` (`src/billing/routes.js`) runs seven steps in a
deliberate sequence. If you add a uid-keyed collection, add it here **in the
same change**, and keep the ordering intact:

1. **`moyasarCustomers`** first — removing the card token guarantees no future
   renewal can charge even if a later step fails.
2. **`subscriptions`** — drops the uid out of the renewals cron query.
3. **`users`** — profile and entitlement.
4. **`checkoutIntents`** — query-delete by `uid`.
5. **`moyasarPayments`** — **overwritten, never deleted.** The doc's *existence*
   is the replay guard; its `uid` is the personal data. It is set to
   `{ tombstone: true, deletedAt }` so `create()` still fails. Deleting it would
   let a replayed webhook re-grant an entitlement to a dead uid.
6. **`adelQuota`** — both period stamps swept, so an `ADEL_FREE_PERIOD` flip
   cannot strand a live counter. Best-effort; stragglers TTL out via `expireAt`.
7. **The Auth user, last** — `user-not-found` counts as success, since the old
   ID token verifies for up to ~1h and this is a retry after success.

The whole handler is **idempotent**: missing-doc deletes are no-ops and queries
come back empty on retry. Keep it that way — a non-idempotent step makes the
purge unretryable, which is the one failure mode that leaves personal data
behind.

## Fail-open is deliberate — do not "fix" it

`src/quota/quota.js` returns `{ ok: true }` from its `catch`, and `peek()` falls
open to the full allowance. **Any Firestore error allows the request.** This is
the rule that stops a metering dependency becoming an availability dependency: a
Firestore outage must not take the instructor offline. Never convert a quota
error into a denial.

## Residency, stated honestly

This is the claim most likely to be written wrongly, so state it precisely:

- **The service** deploys to Cloud Run in `me-central2` (Dammam) —
  `deploy/deploy.sh` defaults `REGION=me-central2`.
- **The English chat path does not stay in the Kingdom.** `MODEL_PROVIDER`
  defaults to `gemini`, which calls Google's Gemini Developer API through
  `@google/genai` — a global endpoint with no region pinning in this repo.
- **The Arabic path** routes to ALLaM only when `ALLAM_BASE_URL` is set, and it
  defaults to empty. Whether that endpoint is in-Kingdom is a hosting fact this
  repo cannot attest to.

So: **never assert in-Kingdom processing of chat as present fact.** `CLAUDE.md`
records external inference as a documented open risk, and that is the accurate
posture. Copy, comments and docs must match it.

> `deploy/deploy.sh` **enforces** `me-central2` and refuses to deploy to
> `me-central1` (Doha, Qatar) — see the `captadel-deployment` skill. Don't
> reopen that as a config knob; the region check is intentionally hard-coded,
> not a default.

## Before you hand back

```bash
npm run smoke && npm run smoke:frontend && npm run test:unit && npm run eval:dry
```

Name every new field or collection that holds personal data, and show its
erasure path. A new uid-keyed store without a delete step is an incomplete
change, not a follow-up.
