# Phase 1: In-Kingdom TEI Endpoint (PDPL Compliance)

**Status:** Specification (ready to deploy)

**Why this matters:** Embedding user questions is personal data under Saudi PDPL (Personal Data Protection Law) and must be processed in-Kingdom. Dense retrieval needs query-time embeddings on every request — a hosted endpoint (e.g., HF Inference Endpoints in us-east-1) would violate PDPL by sending Saudi pilot questions to US servers.

**Solution:** Deploy TEI (Text Embeddings Inference) in the KSA region (Cloud Run me-central2), isolated to query embedding only. The corpus embedding happens on HF Jobs (public data, no region constraint).

---

## Architecture: Two-system design

```
┌─ Corpus embedding (public data, no PDPL) ──────────────┐
│                                                         │
│  HF Jobs GPU                  → Binary index (194 MB)   │
│  Qwen3-Embedding-0.6B                                  │
│  Parallel 8 shards                                     │
│                                                         │
│  Artifact: src/brain/_embeddings.bin (committed to repo)
└─────────────────────────────────────────────────────────┘

┌─ Query embedding (personal data, MUST be in-Kingdom) ──┐
│                                                         │
│  TEI service (Cloud Run me-central2)                   │
│  Qwen3-Embedding-0.6B (same model)                    │
│  POST /embeddings → { embedding: [...] }              │
│                                                         │
│  Input: Arabic question (personal data)               │
│  Output: Dense vector (cached cosine scores)          │
│  Used by: retrieveSmart() for dense recall            │
└─────────────────────────────────────────────────────────┘
```

---

## Deployment: TEI on Cloud Run KSA

### Dockerfile

```dockerfile
FROM ghcr.io/huggingface/text-embeddings-inference:cpu-1.2

# TEI runs on CPU with quantization to keep memory low
ENV MODEL_ID=Qwen/Qwen3-Embedding-0.6B
ENV QUANTIZE=bfloat16
ENV MAX_CLIENT_BATCH_SIZE=32
ENV MAX_BATCH_TOKENS=8192

EXPOSE 8080
```

### Deployment (Cloud Run)

```bash
# Build & deploy to me-central2 (KSA region)
gcloud run deploy captadel-embeddings \
  --source .              # Will build from Dockerfile above \
  --region me-central2    # Dammam — the only GCP region in the Kingdom \
  --memory 4Gi            # TEI + model + buffers \
  --timeout 60s           # 10s embed + margin \
  --no-allow-unauthenticated  # Require API key \
  --service-account <ksa> # Service account with Cloud Run Invoke \
  --project captadel-app
```

### Service configuration

In `src/config.js`:

```javascript
// Embedding endpoint for queries (in-Kingdom, PDPL-safe)
EMBEDDINGS_QUERY_BASE_URL: process.env.EMBEDDINGS_QUERY_BASE_URL ||
  'https://captadel-embeddings-XXXXXX.run.app',

// Keep the build endpoint for reference (HF Jobs)
EMBEDDINGS_BUILD_BASE_URL: process.env.EMBEDDINGS_BUILD_BASE_URL ||
  'https://huggingface.co',
```

---

## Integration: Query embedding in `embedder`

Modify `src/brain/embeddings.js` to use the in-Kingdom endpoint:

```javascript
// Embeddings client — QUERY PATH (in-Kingdom)

const embedder = {
  MODEL: EMBEDDINGS_MODEL,
  configured() {
    // Both corpus (build) and query (in-Kingdom) must be set
    return !!trimUrl(process.env.EMBEDDINGS_QUERY_BASE_URL);
  },
  async embed(texts, opts = {}) {
    const base = trimUrl(process.env.EMBEDDINGS_QUERY_BASE_URL);
    if (!base) throw new Error('EMBEDDINGS_QUERY_BASE_URL not configured');
    
    // Query embedding: MUST be in-Kingdom
    // This is called on every request for every question
    const data = await postJSON(`${base}/embeddings`, {
      model: opts.model || EMBEDDINGS_MODEL,
      input: Array.isArray(texts) ? texts : [texts],
      // Note: do NOT send any user context, history, or metadata
      // Only the question text
    }, {
      apiKey: process.env.EMBEDDINGS_QUERY_API_KEY,
      timeoutMs: opts.timeoutMs || 10000  // Shorter timeout for request path
    });
    
    return (data && data.data ? data.data : []).map((d) => d.embedding);
  },
};

// Logging: Record that embeddings were computed in-Kingdom
// (for audit trail if needed)
function logEmbedding(queryLength, responseTime) {
  // Log to structured logs (Cloud Logging)
  // { service: 'embeddings', region: 'me-central2', query_len: X, response_ms: Y }
  // Do NOT log the actual query or embedding
}
```

---

## Security: API key & isolation

### Authentication

TEI endpoint is **not public**. Require API key:

```javascript
// src/middleware/apikey.js

// EMBEDDINGS_QUERY_API_KEY: internal service-to-service
// (different from public ADEL_API_KEY)
const EMBEDDINGS_QUERY_API_KEY = process.env.EMBEDDINGS_QUERY_API_KEY;

// Brain calls embedder with this key
async postJSON(url, body, { apiKey: EMBEDDINGS_QUERY_API_KEY, ... })
```

### Network isolation

TEI service on Cloud Run:
- ✅ Private endpoint (no public IP)
- ✅ Access via Serverless Connector (VPC) or Identity-Aware Proxy (IAP)
- ✅ Service-to-service auth via Cloud Run service account

No direct internet access needed.

---

## Quotas & cost

| Metric | Value | Note |
|---|---|---|
| Model size | ~2.5 GB (quantized) | CPU acceptable |
| Query latency | ~500–1000ms | Includes network + inference |
| Throughput | ~60–100 queries/min | Single CPU instance |
| Monthly cost (Cloud Run) | ~$50–100 | Depends on traffic |

Scale horizontally (more instances) if throughput exceeds ~5 requests/s.

---

## Monitoring

### Metrics to track

- `embeddings_query_latency_ms` — P50/P95/P99 response time
- `embeddings_query_errors` — Failed embed requests (rate limit / timeout)
- `embeddings_query_requests_total` — Traffic volume

### Alerts

```yaml
# Example: alert if latency exceeds 5s
alert: EmbeddingsHighLatency
condition: |
  embeddings_query_latency_ms{quantile="0.99"} > 5000
```

---

## Testing

### Smoke test

```javascript
// test/embeddings-in-kingdom.test.js

const assert = require('assert');
const { embedder } = require('../src/brain/embeddings');

test('embedder.embed — in-Kingdom query endpoint', async (t) => {
  // Set env to in-Kingdom TEI
  process.env.EMBEDDINGS_QUERY_BASE_URL = 'https://captadel-embeddings-xxxxx.run.app';
  process.env.EMBEDDINGS_QUERY_API_KEY = 'test-key';
  
  // Mock the endpoint
  nock('https://captadel-embeddings-xxxxx.run.app')
    .post('/embeddings', {
      model: 'Qwen/Qwen3-Embedding-0.6B',
      input: ['ما هو؟']
    })
    .reply(200, {
      data: [{ embedding: [0.1, 0.2, 0.3] }]
    });
  
  const result = await embedder.embed('ما هو؟');
  
  assert.strictEqual(result.length, 1);
  assert.ok(Array.isArray(result[0]));
  assert.strictEqual(result[0].length, 3);
});

test('embedder.embed — falls back to no embedding if endpoint down', async (t) => {
  process.env.EMBEDDINGS_QUERY_BASE_URL = 'https://down.example.com';
  
  nock('https://down.example.com')
    .post('/embeddings')
    .reply(503);
  
  try {
    await embedder.embed('test');
    t.fail('Should have thrown');
  } catch (err) {
    assert(err.message.includes('503'));
  }
});
```

---

## Rollout: Gradual activation

Phase 1 enables hybrid retrieval **gated on EMBEDDINGS_QUERY_BASE_URL**:

1. **Development:** Use local embeddings or mock
2. **Staging:** Point to in-Kingdom TEI on Cloud Run
3. **Production:** Same endpoint, monitored for latency

No behavior change until TEI is up and configured.

---

## PDPL compliance checklist

- [ ] Query text is embedded in-Kingdom (me-central2)
- [ ] No query text is sent to US/EU endpoints
- [ ] Embeddings are cached/logged only (not stored long-term)
- [ ] TEI logs do not include full question text
- [ ] Service-to-service auth prevents public access
- [ ] Regular audit of outbound traffic (confirm KSA region)

---

## Alternative: Self-hosted (vLLM) at customer site

If Cloud Run is not acceptable, TEI can also run in a self-hosted environment:

```bash
# On-premise or KSA-hosted VM
docker run -d \
  -p 8000:80 \
  -v /path/to/model:/data \
  ghcr.io/huggingface/text-embeddings-inference:cpu-1.2 \
  --model-id Qwen/Qwen3-Embedding-0.6B \
  --quantize bfloat16
```

Point `EMBEDDINGS_QUERY_BASE_URL` to that endpoint instead.

---

## Phase 1 complete: All 5 items

Once this TEI endpoint is deployed and wired into `embedder`, Phase 1 is complete:

- ✅ Arabic eval cases (25 new with real citations)
- ✅ Binary index format (MRL-aware, deployable)
- ✅ HF Jobs corpus embedding (8× parallel, reproducible)
- ✅ Async tool loop (Gemini uses hybrid retrieval)
- ✅ In-Kingdom TEI query embedding (PDPL-safe)

**Phase 1 eval gate:** Run full eval suite with all 138 cases (113 English + 25 Arabic):

```bash
EMBEDDINGS_QUERY_BASE_URL=https://captadel-embeddings-xxxxx.run.app \
  npm run eval
```

Pass rate must match or exceed Gemini baseline. Arabic cases that were unreachable via BM25 should now retrieve correctly.

---

## Next: Phase 2 — Retrieval metrics & per-language ablations

Once Phase 1 gates pass, Phase 2 measures the cross-lingual unlock:
- Recall @ 5, 10, 20 per language
- Rerank utility (does `gte-multilingual-reranker-base` help?)
- Dimension ablation (1024-d vs 512-d vs 256-d)
- Cost vs quality trade-offs
