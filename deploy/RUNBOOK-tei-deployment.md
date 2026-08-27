# TEI Deployment Runbook (KSA Cloud Run)

**Purpose:** Deploy Text Embeddings Inference (TEI) for query embedding in-Kingdom (PDPL compliant).

**Architecture:** Two-system design
- **Corpus embedding** (public data, no region constraint): HF Jobs → binary index (cached locally)
- **Query embedding** (personal data, MUST be in-Kingdom): Cloud Run TEI in me-central2 (KSA)

---

## Prerequisites

- Google Cloud project: `captadel-app`
- gcloud CLI configured with appropriate credentials
- Docker installed locally (for building the image)
- Service account with Cloud Run deploy permissions

---

## Deployment Steps

### 1. Build and push the TEI image

```bash
# Build the image
docker build -f deploy/Dockerfile-tei -t captadel-embeddings:latest .

# Tag for Google Artifact Registry (if using GCR)
docker tag captadel-embeddings:latest \
  gcr.io/captadel-app/captadel-embeddings:latest

# Push to GCR
docker push gcr.io/captadel-app/captadel-embeddings:latest
```

### 2. Deploy to Cloud Run (me-central2, KSA region)

```bash
gcloud run deploy captadel-embeddings \
  --image gcr.io/captadel-app/captadel-embeddings:latest \
  --region me-central2 \
  --memory 4Gi \
  --cpu 2 \
  --timeout 60s \
  --no-allow-unauthenticated \
  --service-account captadel-tei@captadel-app.iam.gserviceaccount.com \
  --set-env-vars MODEL_ID=Qwen/Qwen3-Embedding-0.6B,QUANTIZE=bfloat16 \
  --project captadel-app
```

### 3. Get the service URL

```bash
gcloud run services describe captadel-embeddings \
  --region me-central2 \
  --project captadel-app \
  --format='value(status.url)'
```

Output will be something like:
```
https://captadel-embeddings-XXXXXX.run.app
```

### 4. Configure authentication

Create a service account for the main service to call TEI:

```bash
# Create service account
gcloud iam service-accounts create captadel-api \
  --project captadel-app \
  --display-name="Captain Adel API (calls TEI)"

# Grant Cloud Run Invoke permission on TEI service
gcloud run services add-iam-policy-binding captadel-embeddings \
  --region me-central2 \
  --member=serviceAccount:captadel-api@captadel-app.iam.gserviceaccount.com \
  --role=roles/run.invoker \
  --project captadel-app
```

### 5. Set environment variables in the main service

```bash
# In Cloud Run deployment of the main captadel service, set:
EMBEDDINGS_QUERY_BASE_URL=https://captadel-embeddings-XXXXXX.run.app/v1

# Optional: set both endpoints if using HF Jobs for corpus build
EMBEDDINGS_BUILD_BASE_URL=https://huggingface.co/api/models/flygaca/CaptAdel
```

### 6. Verify deployment

```bash
# Test the TEI endpoint with a sample embedding request
curl -X POST https://captadel-embeddings-XXXXXX.run.app/v1/embeddings \
  -H "Content-Type: application/json" \
  -d '{
    "model": "Qwen/Qwen3-Embedding-0.6B",
    "input": ["What is the minimum cruise altitude?"]
  }' \
  --oauth2-bearer $(gcloud auth print-access-token)
```

---

## Monitoring

### Logs

```bash
gcloud run logs read captadel-embeddings \
  --region me-central2 \
  --project captadel-app \
  --limit=50
```

### Metrics

```bash
gcloud monitoring dashboards create \
  --config-from-file=deploy/tei-dashboard.json \
  --project captadel-app
```

---

## Troubleshooting

### Service won't start

Check logs for OOM (out-of-memory) errors. TEI + Qwen3-Embedding-0.6B needs ~4Gi:

```bash
gcloud run logs read captadel-embeddings --region me-central2 --limit=100
```

### High latency

- Check CPU allocation (2+ vCPU recommended)
- Monitor batch queue depth in logs

### Quota/Rate limits

TEI has built-in rate limiting. Set appropriate values:
- `MAX_CLIENT_BATCH_SIZE=32` (requests per batch)
- `MAX_BATCH_TOKENS=8192` (tokens per batch)

---

## Rollback

```bash
# Deploy previous image revision
gcloud run deploy captadel-embeddings \
  --image gcr.io/captadel-app/captadel-embeddings:PREVIOUS_TAG \
  --region me-central2 \
  --project captadel-app
```

---

## Cost Estimation

- **vCPU:** 2 × $0.000016667 per second ≈ $10/month at 50% utilization
- **Memory:** 4Gi × $0.000001667 per GB-second ≈ $20/month at 50% utilization
- **Requests:** First 2M free; $0.40 per 1M after

**Estimated:** $30–50/month for production traffic.

---

## References

- [TEI Documentation](https://huggingface.co/docs/text-embeddings-inference/en/index)
- [Cloud Run Deployment Guide](https://cloud.google.com/run/docs/deploying)
- [PDPL Compliance](https://www.captadel.com/privacy) — must run in-Kingdom
