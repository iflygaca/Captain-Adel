# RUNBOOK — Deploy captadel.com (Captain Adel standalone)

> **Note (2026-06-13):** Captain Adel now lives in its own repo,
> **[`ay2m/Captain-Adel`](https://github.com/ay2m/Captain-Adel)**. Run these steps from
> that repo (its root is the former `captadel/`); a `captadel/…` path below maps to that root.
> Deploys now run from the repo's own `.github/workflows/deploy.yml` once `GCP_SA_KEY` is set.

Stand the Captain Adel service up on **captadel.com**: build the image, wire the
model/embeddings credentials, deploy to a Kingdom region, map the domain, and
connect the Fly GACA gateway. The one-command path is `captadel/deploy/deploy.sh`;
everything below explains what it does and the manual steps around it.

> **Accounts, billing & quota** (pilot subscriptions on captadel.com) are a
> separate layer with their own setup — a dedicated Captadel Firebase project,
> Moyasar, and the GitHub Actions deploy. See **`RUNBOOK-captadel-saas.md`**. That
> layer ships dark, so this deploy works unchanged whether or not it is set up.
> For `firebase-admin` to use ADC, deploy this service **into the same GCP project**
> as the Captadel Firebase project.

> **PDPL (load-bearing).** Real user questions are personal data and must be
> processed in-Kingdom. **me-central2 (Dammam) is the only Google Cloud region
> inside the Kingdom of Saudi Arabia**, and `deploy/deploy.sh` deploys there and
> nowhere else — it hard-fails if `REGION` is set to anything other than
> `me-central2`. me-central1 is Doha, **Qatar**, a different country; it is not
> an in-Kingdom option under any framing and there is no compliant fallback
> region to deploy to instead. Also host the ALLaM model in-Kingdom for
> production. Hugging Face endpoints (US/EU) are great for **dev + evals** but are
> outside the Kingdom — fine for the public GACAR corpus (embeddings), not for the
> chat model on real traffic.

---

## 0. Prerequisites (once)

```bash
gcloud --version                      # install the Google Cloud SDK if missing
gcloud auth login
gcloud config set project YOUR_PROJECT_ID
# billing must be ENABLED for Cloud Run:
gcloud billing projects describe "$(gcloud config get-value project)" --format='value(billingEnabled)'
gcloud services enable run.googleapis.com artifactregistry.googleapis.com \
                       cloudbuild.googleapis.com secretmanager.googleapis.com
```

What you need on hand:
- **`GEMINI_API_KEY`** — required. Captain Adel's English path + the groundedness judge.
- **`ADEL_API_KEY`** — a shared secret you invent; the Fly GACA gateway sends it so its
  server-to-server calls skip the browser rate-limiter. Required to wire step 6.
- **`ALLAM_BASE_URL` (+ `ALLAM_API_KEY`)** — optional now. The in-Kingdom Arabic voice
  (OpenAI-compatible `/v1`). Without it, Arabic still answers via Gemini.
- **`EMBEDDINGS_BASE_URL` (+ `EMBEDDINGS_API_KEY`)** — optional now. Cross-lingual dense
  recall (BGE-M3). Without it, retrieval is BM25-only. See `captadel/.env.example` for the
  Hugging Face recipe.

---

## 1. Store the secrets

Either create them by hand:
```bash
printf '%s' "YOUR_GEMINI_KEY" | gcloud secrets create GEMINI_API_KEY --data-file=-
printf '%s' "YOUR_ADEL_KEY"   | gcloud secrets create ADEL_API_KEY   --data-file=-
# optional, when ready:
printf '%s' "https://xxx.endpoints.huggingface.cloud/v1" | gcloud secrets create ALLAM_BASE_URL --data-file=-
printf '%s' "hf_xxx"          | gcloud secrets create ALLAM_API_KEY  --data-file=-
printf '%s' "https://yyy.endpoints.huggingface.cloud/v1" | gcloud secrets create EMBEDDINGS_BASE_URL --data-file=-
printf '%s' "hf_xxx"          | gcloud secrets create EMBEDDINGS_API_KEY --data-file=-
```

…or export them and let the script upsert:
```bash
export GEMINI_API_KEY=…  ADEL_API_KEY=…  ALLAM_BASE_URL=…  ALLAM_API_KEY=…
cd captadel && ./deploy/deploy.sh secrets
```
The deploy wires **only the secrets that exist**, so a Gemini-only first deploy is fine —
add the others later and re-run to light them up.

---

## 2. (Optional) Build the cross-lingual index — once

The dense index ships **inside the image** (it lives under `src/brain/`, picked up by the
Dockerfile's `COPY . .`). Build it before deploying, pointing at your embeddings endpoint:
```bash
cd captadel
EMBEDDINGS_BASE_URL="https://yyy.endpoints.huggingface.cloud/v1" \
EMBEDDINGS_API_KEY="hf_xxx" \
npm run build:embeddings        # writes src/brain/_embeddings.json.gz
```
Skip this for a BM25-only first deploy; run it and redeploy when your endpoint is ready.

---

## 3. Deploy

```bash
cd captadel
./deploy/deploy.sh                       # region is me-central2 (Dammam), enforced — see §7 if it's rejected
```
The script builds from source, wires the present secrets, sets
`MODEL_PROVIDER=auto` + `ARABIC_PROVIDER=allam`, runs `--min-instances 1` (keeps the BM25
index warm), and prints the service URL.

**Verify:**
```bash
curl -s https://captadel-xxxx.run.app/health      # {status:ok …; allam:true once ALLaM is wired}
```
Open the URL in a browser → the landing page should load **Arabic-first (RTL)**; the chat
should stream a cited answer.

---

## 4. (If you split the repo) source

`captadel/` is developed as a git subtree here and can be split to `FlyGACA/captadel`
(`RUNBOOK-captadel-extraction.md`). Deploy works the same from either repo — the script
only needs the `captadel/` tree with its `Dockerfile`.

---

## 5. Map captadel.com

**Option A — Cloud Run domain mapping:**
```bash
gcloud run domain-mappings create --service captadel --domain captadel.com --region me-central2
gcloud run domain-mappings create --service captadel --domain www.captadel.com --region me-central2
```
Then add the records it prints at your DNS host.

**Option B — Cloudflare in front (you already use Cloudflare):** add a `CNAME` for
`captadel.com` (and `www`) to the `run.app` host, proxied. Keep TLS = Full (strict).

Either way, `config.js` already allow-lists `captadel.com` / `www.captadel.com` for CORS.

---

## 6. Wire the Fly GACA gateway to the live service

So the embedded chat (flygaca.com) proxies to the same brain:
```bash
# on the chat Cloud Function (Firebase) — see RUNBOOK-captain-adel.md:
ADEL_API_URL = https://captadel.com          # or the run.app URL
ADEL_API_KEY = <the same value as the ADEL_API_KEY secret>
```
Redeploy the `chat` function. The gateway sends `X-Adel-Api-Key` server-to-server.

---

## 7. Troubleshooting

| Symptom | Fix |
|---|---|
| `LOCATION_POLICY_VIOLATED` / region rejected | Request me-central2 access/quota for this GCP project (Google Cloud console → IAM & Admin, or your account rep). There is no compliant fallback region — `deploy.sh` refuses any `REGION` other than `me-central2`, so the service cannot deploy until access is granted. |
| `/health` shows `allam:false` | `ALLAM_BASE_URL` secret missing/empty, or the endpoint is down — Arabic falls back to Gemini. |
| Arabic answers but weak/irrelevant sources | Cross-lingual recall is off — build the index (§2) + set `EMBEDDINGS_BASE_URL`, redeploy. |
| First request slow / times out | Cold start builds the BM25 index; `--min-instances 1` (default) keeps one warm. |
| Embedded flygaca chat errors | `ADEL_API_URL`/`ADEL_API_KEY` not set on the `chat` function (step 6). |

## 8. Rollback

```bash
gcloud run revisions list --service captadel --region me-central2
gcloud run services update-traffic captadel --region me-central2 --to-revisions REVISION=100
```

## 9. Pre-launch quality gate (run with your keys)

```bash
cd captadel
GEMINI_API_KEY=…                       npm run eval          # English path, keyword gate
GEMINI_API_KEY=… ALLAM_BASE_URL=…      npm run eval:allam    # Arabic path
GEMINI_API_KEY=… ALLAM_BASE_URL=…      npm run eval:parity   # Arabic must match/beat EN, no regression
```
Green here = safe to point traffic at it.
