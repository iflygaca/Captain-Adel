#!/usr/bin/env bash
# ============================================================================
# Captain Adel — one-command Cloud Run deploy for captadel.com.
#
# Builds the standalone service image (Dockerfile, CPU-only) and deploys it to a
# KSA region. Reads the model/embeddings credentials from Secret Manager, wiring
# only the secrets that actually exist — so a Gemini-only first deploy works, and
# ALLaM + cross-lingual embeddings light up the moment you add their secrets and
# re-run. PDPL: real user questions are personal data — keep this in a Kingdom
# region, and host ALLaM in-Kingdom for production (see RUNBOOK-captadel-deploy.md).
#
# Usage:
#   ./deploy/deploy.sh                 # deploy with current gcloud project
#   REGION=me-central1 ./deploy/deploy.sh
#   ./deploy/deploy.sh secrets         # create/update secrets from env vars, then exit
#
# Tunables (env, with defaults):
#   SERVICE=captadel  REGION=me-central2  MEMORY=2Gi  CPU=2
#   MIN_INSTANCES=1   MAX_INSTANCES=10    MODEL_PROVIDER=auto  ARABIC_PROVIDER=allam
# ============================================================================
set -euo pipefail

cd "$(dirname "$0")/.."            # -> captadel/ (where the Dockerfile lives)

SERVICE="${SERVICE:-captadel}"
REGION="${REGION:-me-central2}"   # Dammam (target). Fall back: REGION=me-central1 (Doha).
MEMORY="${MEMORY:-2Gi}"   # hybrid retrieval (EMBEDDINGS_BASE_URL + dense index) adds ~190 MB resident — keep ≥1Gi, 2Gi is safe
CPU="${CPU:-2}"
MIN_INSTANCES="${MIN_INSTANCES:-1}"   # keep one warm so the BM25 index stays resident
MAX_INSTANCES="${MAX_INSTANCES:-10}"
MODEL_PROVIDER="${MODEL_PROVIDER:-auto}"
ARABIC_PROVIDER="${ARABIC_PROVIDER:-allam}"

# Every secret the service can consume. Required ones are checked below; the rest
# are wired only if present, so the deploy degrades gracefully. The STRIPE_*
# secrets power the SaaS layer (accounts/billing); without them billing endpoints
# return 503 and the site shows its "free during launch" state.
ALL_SECRETS=(GEMINI_API_KEY ADEL_API_KEY ALLAM_BASE_URL ALLAM_API_KEY \
             EMBEDDINGS_BASE_URL EMBEDDINGS_API_KEY RERANK_BASE_URL RERANK_API_KEY \
             STRIPE_SECRET_KEY STRIPE_WEBHOOK_SECRET STRIPE_PRICE_MONTHLY STRIPE_PRICE_ANNUAL)
REQUIRED_SECRETS=(GEMINI_API_KEY)

say()  { printf '\033[1;36m▸ %s\033[0m\n' "$*"; }
warn() { printf '\033[1;33m! %s\033[0m\n' "$*"; }
die()  { printf '\033[1;31m✗ %s\033[0m\n' "$*" >&2; exit 1; }

command -v gcloud >/dev/null || die "gcloud not found. Install the Google Cloud SDK first."
PROJECT="$(gcloud config get-value project 2>/dev/null || true)"
[ -n "$PROJECT" ] && [ "$PROJECT" != "(unset)" ] || die "No project set. Run: gcloud config set project YOUR_PROJECT_ID"

secret_exists() { gcloud secrets describe "$1" >/dev/null 2>&1; }

# Upsert a secret from a same-named environment variable (used by `secrets` mode).
upsert_secret() {
  local name="$1"; local val="${!name:-}"
  [ -n "$val" ] || return 0
  if secret_exists "$name"; then
    printf '%s' "$val" | gcloud secrets versions add "$name" --data-file=- >/dev/null
    say "updated secret $name"
  else
    printf '%s' "$val" | gcloud secrets create "$name" --data-file=- >/dev/null
    say "created secret $name"
  fi
}

if [ "${1:-}" = "secrets" ]; then
  say "Creating/updating Secret Manager secrets from environment variables…"
  for s in "${ALL_SECRETS[@]}"; do upsert_secret "$s"; done
  say "Done. Re-run without 'secrets' to deploy."
  exit 0
fi

# --- preflight -------------------------------------------------------------
say "Project: $PROJECT   Service: $SERVICE   Region: $REGION"

for s in "${REQUIRED_SECRETS[@]}"; do
  secret_exists "$s" || die "Required secret '$s' is missing. Create it with:
    printf '%s' \"YOUR_KEY\" | gcloud secrets create $s --data-file=-
  (or export the vars and run: ./deploy/deploy.sh secrets)"
done

# Build the --set-secrets list from whatever exists.
SECRET_ARGS=""
for s in "${ALL_SECRETS[@]}"; do
  if secret_exists "$s"; then SECRET_ARGS+="${SECRET_ARGS:+,}${s}=${s}:latest"; fi
done
say "Wiring secrets: ${SECRET_ARGS//,/ }"

if ! secret_exists ALLAM_BASE_URL; then
  warn "ALLAM_BASE_URL not set → Arabic answers fall back to Gemini (still Arabic, but not in-Kingdom)."
fi
if ! secret_exists EMBEDDINGS_BASE_URL; then
  warn "EMBEDDINGS_BASE_URL not set → retrieval is BM25-only (no cross-lingual dense recall)."
  warn "To enable later: build the index once (npm run build:embeddings) and add the secret, then re-run."
fi

ENV_ARGS="MODEL_PROVIDER=${MODEL_PROVIDER},ARABIC_PROVIDER=${ARABIC_PROVIDER}"
[ -n "${ADEL_MAX_SOURCES:-}" ] && ENV_ARGS+=",ADEL_MAX_SOURCES=${ADEL_MAX_SOURCES}"

# SaaS layer (non-secret) env. Ship dark with ADEL_LAUNCH_MODE=free; flip to
# metered by unsetting it and setting the daily allowances. SITE_URL must be the
# public origin so Stripe redirects land back on captadel.com.
[ -n "${ADEL_LAUNCH_MODE:-}" ] && ENV_ARGS+=",ADEL_LAUNCH_MODE=${ADEL_LAUNCH_MODE}"
[ -n "${ADEL_DAILY_FREE:-}" ]  && ENV_ARGS+=",ADEL_DAILY_FREE=${ADEL_DAILY_FREE}"
[ -n "${ADEL_DAILY_ANON:-}" ]  && ENV_ARGS+=",ADEL_DAILY_ANON=${ADEL_DAILY_ANON}"
[ -n "${ADEL_FREE_PERIOD:-}" ] && ENV_ARGS+=",ADEL_FREE_PERIOD=${ADEL_FREE_PERIOD}"
[ -n "${SITE_URL:-}" ]         && ENV_ARGS+=",SITE_URL=${SITE_URL}"

# --- deploy ----------------------------------------------------------------
say "Deploying to Cloud Run (this builds the image from source)…"
gcloud run deploy "$SERVICE" \
  --source . \
  --region "$REGION" \
  --platform managed \
  --allow-unauthenticated \
  --port 8787 \
  --memory "$MEMORY" \
  --cpu "$CPU" \
  --min-instances "$MIN_INSTANCES" \
  --max-instances "$MAX_INSTANCES" \
  --set-secrets "$SECRET_ARGS" \
  --set-env-vars "$ENV_ARGS" \
  || die "Deploy failed. If the region was rejected, retry with REGION=me-central1 ./deploy/deploy.sh"

URL="$(gcloud run services describe "$SERVICE" --region "$REGION" --format='value(status.url)')"
say "Deployed: $URL"
say "Health check:  curl -s $URL/health   (expect status:ok; allam:true once ALLaM is wired)"
say "Next: map captadel.com (see office/RUNBOOK-captadel-deploy.md §5) and set ADEL_API_URL on the Fly GACA gateway."
