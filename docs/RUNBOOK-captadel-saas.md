# RUNBOOK — Captain Adel SaaS (accounts, billing & quota on captadel.com)

> **Note (2026-06-13):** Captain Adel now lives in its own repo,
> **[`FlyGACA/Captain-Adel`](https://github.com/FlyGACA/Captain-Adel)**. The code referenced as
> `captadel/…` below now sits at that repo's root.

Stand up the pilot-subscription layer on captadel.com: a **separate Captadel
Firebase project** for accounts, Moyasar for billing, and a free daily quota with
a Pro unlimited tier. The code is already in `captadel/` and **ships dark** — with
none of the steps below done, the site is exactly as it was (free for everyone,
no sign-in, no paywall). Each step lights up one piece.

> **PDPL (load-bearing).** Real user questions and accounts are personal data and
> must be processed in-Kingdom. Put Firestore in **me-central2 (Dammam)** and keep
> the Cloud Run service in a KSA region (see `RUNBOOK-captadel-deploy.md`).

> **Architecture.** Billing lives **inside the Express service** (`captadel/src/billing/`),
> not in Cloud Functions. The browser only ever talks to Firebase **Auth**; plan
> and quota come from the service's `GET /v1/me` (Admin SDK). `firestore.rules`
> denies every direct client read/write. Deploy the Cloud Run service into the
> **same GCP project** as the Firebase project so `firebase-admin` uses ADC with
> zero config.

---

## 0. Where things are

| Piece | Path |
|---|---|
| Billing routes (checkout/confirm/webhook/cancel/renewals/account-delete/me/config) | `captadel/src/billing/routes.js` |
| Entitlement writer + pure cores | `captadel/src/billing/entitlements*.js`, `moyasar-core.js`, `tier-core.js` |
| Quota (Firestore) + calendar math | `captadel/src/quota/quota.js`, `quota-core.js` |
| Admin SDK singleton | `captadel/src/firebase.js` |
| Caller identity middleware (60s cache) | `captadel/src/middleware/auth.js` |
| Client auth / billing / account | `captadel/public/assets/js/{auth,billing,account}.js` |
| Web config (fill in step 1) | `captadel/public/assets/js/firebase-config.js` |
| Pricing section | `captadel/public/index.html` (`#pricing`), account page `account.html` |
| Firestore project files | `captadel/firebase.json`, `firestore.rules`, `.firebaserc` |
| Deploy | `captadel/deploy/deploy.sh`, `.github/workflows/deploy-captadel.yml` |

---

## 1. Create the Captadel Firebase project

This is a **new project**, separate from Fly GACA's `flygaca-app` — captadel.com
keeps its own user base and billing.

1. Firebase console → **Add project** (e.g. `captadel-app`). Update the id in
   `captadel/.firebaserc` if you choose a different one.
2. **Firestore Database** → Create → **Location `me-central2`** (PDPL — cannot be
   changed later). Production mode.
3. **Authentication** → Sign-in method → enable **Email/Password** and **Google**.
4. **Authentication → Settings → Authorized domains** → add `captadel.com`,
   `www.captadel.com` (and your Cloud Run `*.run.app` host for testing).
5. **Project settings → Your apps → Web app** → register an app, copy the config
   into `captadel/public/assets/js/firebase-config.js` (replace the
   `REPLACE_WITH_*` placeholders). The web API key is public by design.
6. **Firestore → TTL** → create a policy on collection `adelQuota`, field
   `expireAt`, so spent quota counters self-purge.

Commit the filled `firebase-config.js`. Once the placeholders are gone, the
account page shows real sign-in instead of the "accounts open soon" state.

### Deploy the deny-all rules

```bash
cd captadel
firebase deploy --only firestore:rules --project captadel-app
```

---

## 2. Point the Cloud Run service at this project

`firebase-admin` uses ADC, so the service must run **in the same GCP project** as
the Firebase project above.

```bash
gcloud config set project captadel-app
cd captadel && ./deploy/deploy.sh secrets     # re-create model secrets here
./deploy/deploy.sh                            # deploy (me-central2; me-central1 fallback)
```

Then map `captadel.com` (see `RUNBOOK-captadel-deploy.md §5`) and, if the service
URL changed, update `ADEL_API_URL` on the Fly GACA gateway so the embedded
flygaca.com chat still reaches the same brain.

> The service auto-detects the project from `GOOGLE_CLOUD_PROJECT` on Cloud Run.
> For local dev: `export FIREBASE_PROJECT_ID=captadel-app` and
> `gcloud auth application-default login`.

---

## 3. Moyasar

Payments run through **Moyasar** (Saudi PSP: mada, credit cards, Apple Pay,
STC Pay), mirroring Fly GACA. There is no Stripe. Moyasar has no subscription
object — "recurring" means the saved card **token** is re-charged by the
renewals route (§3d) before the entitlement expires.

**Merchant of record.** The Moyasar account must be registered to the operating
entity: **BDA Company International (شركة بدع الدولية)** — Saudi LLC,
CR 7030976893, VAT 311415259500003, Riyadh 12965. Prices shown on captadel.com
are SAR and VAT-inclusive; the public legal pages are `/terms` and `/privacy`
(served from `public/`), and the site footer discloses the entity + CR + VAT.
Confirm the Moyasar merchant profile carries the CR and the settlement IBAN.

### 3a. API keys → Secret Manager

Dashboard → Developers → API keys. The **secret** key authenticates our
server-to-server calls; the **publishable** key is public (served to the browser
via `GET /v1/config`) and is charge-only. Prices are SAR strings, not price IDs.

```bash
printf '%s' "sk_live_…" | gcloud secrets create MOYASAR_SECRET_KEY      --data-file=-
printf '%s' "pk_live_…" | gcloud secrets create MOYASAR_PUBLISHABLE_KEY --data-file=-
printf '%s' "35"        | gcloud secrets create MOYASAR_PRICE_MONTHLY_SAR --data-file=-
printf '%s' "299"       | gcloud secrets create MOYASAR_PRICE_ANNUAL_SAR  --data-file=-
```
Founding annual is SAR 299/yr (raise to 349 when ready). The static pricing copy
in `index.html` must match these numbers.

### 3b. Webhook

Dashboard → Developers → Webhooks → add endpoint
`https://captadel.com/v1/billing/webhook`, subscribe **`payment_paid`**
(optionally `payment_failed`), and set a **shared secret**:
```bash
printf '%s' "whsec_…" | gcloud secrets create MOYASAR_WEBHOOK_SECRET --data-file=-
```
> ⚠️ The webhook signature recipe (`verifyMoyasarSignature`, HMAC-SHA256 hex over
> the raw body vs the `x-moyasar-signature` header) has **not** been validated
> against live Moyasar docs — it is defence-in-depth only. The trusted
> fulfilment path is the server-side payment re-fetch in `settlePayment`. Fire a
> **dashboard test event** and confirm it verifies (200, not 400) before relying
> on the webhook; if the header/format differs, fix `moyasar-core.js` to match.

### 3c. Apple Pay

Dashboard → Apple Pay → add the domain, download the Merchant Domain Association
file, and drop it byte-for-byte at
`public/.well-known/apple-developer-merchantid-domain-association` (no
extension — see `public/.well-known/README.md`). The server already serves that
dotfile directory as `text/plain` (`src/server.js`); after deploy, verify before
you **Validate** → **Register**:

```bash
curl -i https://captadel.com/.well-known/apple-developer-merchantid-domain-association
# → 200, Content-Type: text/plain, body == the downloaded file
```

Requires an Apple Developer account + Merchant ID. The file is a public domain
token, not a secret. STC Pay needs no extra integration.

### 3d. Renewals (Cloud Scheduler)

Moyasar can't auto-renew, so a daily job charges due saved-card tokens:
```bash
printf '%s' "$(openssl rand -hex 32)" | gcloud secrets create CRON_SECRET --data-file=-
# then a Cloud Scheduler HTTP job, daily:
#   POST https://captadel.com/v1/billing/renewals/run
#   header  X-Cron-Key: <CRON_SECRET value>
```
The route 401s without the header. It charges `subscriptions/{uid}.amountHalalas`
(the price actually sold), extends the entitlement from its current expiry, and
walks past_due → canceled after 3 failed attempts.

### 3e. Deploy

Re-run `./deploy/deploy.sh` so the new secrets are wired. Checkout returns 503
until both `MOYASAR_SECRET_KEY` and the Firebase project are present; it returns
`price_unconfigured` until the SAR prices are set.

---

## 4. GitHub Actions deploy

The active workflow is `.github/workflows/deploy-captadel.yml` (push to main,
paths `captadel/**`; or manual `workflow_dispatch`). It is inert until configured.

1. Create a deployer service account in the Captadel project with roles
   `roles/run.admin`, `roles/cloudbuild.builds.editor`,
   `roles/iam.serviceAccountUser`, `roles/secretmanager.secretAccessor`. Mint a
   JSON key.
2. Repo → Settings → Secrets and variables → Actions:
   - **Secret** `GCP_SA_KEY` = the JSON key.
   - **Variables** `CAPTADEL_PROJECT_ID` = `captadel-app`, `CAPTADEL_REGION` =
     `me-central2` (or `me-central1`).
3. Push to main (touching `captadel/**`) or run the workflow manually. The health
   check asserts `/health` returns `status:ok`.

> **Upgrade path (keyless):** swap the SA key for Workload Identity Federation —
> add `permissions: { id-token: write }` and use `google-github-actions/auth@v2`
> with `workload_identity_provider` + `service_account`. Remove `GCP_SA_KEY` once
> WIF is verified.

---

## 5. Launch sequence

The layer ships **dark**. Bring it up deliberately:

1. **Dark (default):** deploy with `ADEL_LAUNCH_MODE=free`. Everyone is unmetered;
   sign-in works (once step 1 is done) but is optional; checkout 503s until
   Moyasar is wired. Good for soft-launching accounts without a paywall.
2. **Billing test:** with Moyasar **test keys**, run a checkout with the Moyasar
   test card `4111 1111 1111 1111`; confirm the return leg hits
   `POST /v1/billing/confirm`, `users/{uid}.entitlement.plan === 'pro'`, and the
   account page shows the Pro badge. "Turn off auto-renew" flips
   `subscriptions/{uid}.autoRenew` — access runs to `expiresAt`.
3. **Go live:** unset `ADEL_LAUNCH_MODE`, set the allowances, redeploy:
   ```bash
   ADEL_DAILY_FREE=5 ADEL_DAILY_ANON=5 ADEL_FREE_PERIOD=day \
   SITE_URL=https://captadel.com ./deploy/deploy.sh
   ```
   A free signed-in pilot now gets 5 cited questions/day; the 6th returns a 402
   with the bilingual upgrade nudge; Pro is unlimited (abuse limiter still on).

---

## 6. Rollback

- **Instant "everything free":** set `ADEL_LAUNCH_MODE=free` and redeploy — the
  quota goes dormant immediately, no code change.
- **Code:** roll back the Cloud Run revision
  (`gcloud run services update-traffic captadel --to-revisions REV=100 …`).
- **Billing only:** remove the `MOYASAR_*` secrets and redeploy — checkout 503s
  and the site reverts to its free-during-launch state; existing entitlements
  remain.

---

## 7. Verify (local)

```bash
cd captadel
npm run test:unit        # cores + the raw-body webhook signature test
npm run smoke            # loads with zero billing env (proves dark-launch safety)

# Live billing loop (Moyasar test mode):
export FIREBASE_PROJECT_ID=captadel-app
gcloud auth application-default login
export MOYASAR_SECRET_KEY=sk_test_…  MOYASAR_PUBLISHABLE_KEY=pk_test_…  \
       MOYASAR_WEBHOOK_SECRET=whsec_…  MOYASAR_PRICE_ANNUAL_SAR=299 \
       SITE_URL=http://localhost:8787
npm start &
# → sign up on /account.html, Go Pro → checkout.html, pay with the Moyasar test
#   card 4111 1111 1111 1111, watch the entitlement flip on return.

# Gateway contract unchanged (flygaca embed):
curl -s -XPOST localhost:8787/v1/chat -H 'X-Adel-Api-Key: …' \
  -H 'Content-Type: application/json' -d '{"message":"hi","product":"flygaca"}'
```

## 8. Account deletion

`POST /v1/account/delete` (Bearer-authed; 503 `account_unavailable` while Firebase
is dark) is the Apple 5.1.1(v) / PDPL erasure route. One call removes, in order:

1. `moyasarCustomers/{uid}` — the **saved card token** (first, so no future
   renewal can charge even if a later step fails),
2. `subscriptions/{uid}` — which also drops the uid out of the renewals cron query,
3. `users/{uid}` — profile + entitlement,
4. every `checkoutIntents` doc carrying the uid,
5. **tombstones** (does not delete) the uid's `moyasarPayments` markers — each doc's
   *existence* is the settle-once webhook-replay guard, so the doc stays but its
   `uid`/`checkoutId` are overwritten away,
6. best-effort sweeps the current-period `adelQuota` counters (older stamps hold no
   personal data beyond a count and TTL-expire on `expireAt` within 3/40 days),
7. deletes the **Firebase Auth user last** — a failed Firestore purge leaves the
   caller's token valid so the request can simply be retried (502 `delete_failed`).

Notes: the just-deleted user's ID token stays verifiable for up to ~1h (we don't
`checkRevoked` on the hot path), so a post-success retry answers `{ok:true}` via
the `auth/user-not-found` swallow. **Deletion is irreversible** — the rollback
lever in §6 restores code and pricing states, never deleted accounts.
