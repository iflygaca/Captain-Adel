# Phase 2: Retrieval Metrics & Per-Language Ablations

**Status:** Specification (ready to implement)

> [!WARNING]
> **Every number in this document is illustrative.** The tables, latency figures and
> decision blocks below are *templates showing the shape of the report Phase 2 will
> produce* — they are placeholders, filled with plausible-looking values so the format
> is reviewable before the runs happen. **None of them are measured results.**
>
> As of this writing no ablation has been run: `src/brain/_embeddings.bin` does not
> exist, so there is no dense index to ablate against. Do not quote any figure from
> this file as a baseline, and do not copy them into the README, a model card or a
> dataset card. Real results replace these blocks when `node evals/ablations.js` runs
> against a live embeddings endpoint.

**Why this matters:** Phase 1 enables cross-lingual dense retrieval, but we don't yet know:
- Does Arabic query → English passage retrieval actually work? (recall %)
- Does reranking help or hurt? (gte-multilingual-reranker-base worth the latency?)
- What's the optimal embedding dimension? (1024-d vs 512-d vs 256-d)
- How much does hybrid (dense + BM25) beat BM25 alone?

Phase 2 answers these via ablation studies on the full eval suite.

---

## Measurement: `evals/metrics.js`

Add detailed retrieval metrics to the eval suite. For each case, track:

```javascript
// evals/metrics.js — NEW FILE

/**
 * Retrieval metrics for each eval case.
 * 
 * After answering, measure whether the retrieved passages actually
 * grounded the answer. This validates the retrieval chain.
 */

function measureRetrieval(evalCase, answer, sources) {
  /**
   * Measure retrieval quality for a single case.
   * 
   * Returns: { recall, rerank_delta, citation_match, ... }
   */
  
  // 1. Citation match — does answer cite the expected Part?
  const cited = extractCitations(answer);
  const citationMatch = evalCase.expect.citesPart && 
    evalCase.expect.citesPart.some(p => cited.includes(p));
  
  // 2. Source presence — did we retrieve any sources?
  const sourceCount = sources ? sources.length : 0;
  const hadSources = sourceCount > 0;
  
  // 3. Recall@k — if we know where the answer should come from,
  //    did the retrieval include it in top-k?
  const recall = measureRecall(evalCase, sources);
  
  return {
    citationMatch,
    hadSources,
    sourceCount,
    recall  // { at5, at10, at20 }
  };
}

function measureRecall(evalCase, sources) {
  /**
   * For cases where we know the ground-truth chunk(s),
   * measure recall at k cutoffs.
   */
  
  if (!evalCase.groundTruthChunks) {
    return { at5: null, at10: null, at20: null };
  }
  
  const retrieverChunkIds = new Set(sources.map(s => s.chunkId));
  const groundTruth = new Set(evalCase.groundTruthChunks);
  
  // Recall: % of ground truth chunks in top-k results
  const at5 = sources.slice(0, 5).filter(s => groundTruth.has(s.chunkId)).length / groundTruth.size;
  const at10 = sources.slice(0, 10).filter(s => groundTruth.has(s.chunkId)).length / groundTruth.size;
  const at20 = sources.slice(0, 20).filter(s => groundTruth.has(s.chunkId)).length / groundTruth.size;
  
  return { at5, at10, at20 };
}

function extractCitations(answerText) {
  /**
   * Extract Part numbers from answer text.
   * E.g., "Part 91, §91.119" → ["91"]
   */
  const matches = answerText.match(/Part\s+(\d+)/gi);
  return (matches || []).map(m => m.match(/\d+/)[0]);
}
```

---

## Ablation study: Multiple configurations

Phase 2 runs evals across configurations to measure impact:

```javascript
// evals/ablations.js — NEW FILE

const ABLATIONS = [
  {
    name: 'bm25-only',
    env: {
      EMBEDDINGS_BASE_URL: '',  // Disable hybrid
      RERANK_BASE_URL: ''
    }
  },
  {
    name: 'dense-1024d-no-rerank',
    env: {
      EMBEDDINGS_BASE_URL: 'http://localhost:8000',
      EMBEDDINGS_MODEL: 'Qwen/Qwen3-Embedding-0.6B',
      EMBED_DIMS: '1024',
      RERANK_BASE_URL: ''  // No reranking
    }
  },
  {
    name: 'dense-512d-no-rerank',
    env: {
      EMBEDDINGS_BASE_URL: 'http://localhost:8000',
      EMBED_DIMS: '512'
    }
  },
  {
    name: 'dense-256d-no-rerank',
    env: {
      EMBEDDINGS_BASE_URL: 'http://localhost:8000',
      EMBED_DIMS: '256'
    }
  },
  {
    name: 'dense-512d-with-rerank',
    env: {
      EMBEDDINGS_BASE_URL: 'http://localhost:8000',
      EMBED_DIMS: '512',
      RERANK_BASE_URL: 'http://localhost:8001',
      RERANK_MODEL: 'Alibaba-NLP/gte-multilingual-reranker-base'
    }
  },
  {
    name: 'hybrid-rrf-512d-rerank',
    env: {
      // Full hybrid: BM25 + dense (512-d) + RRF + rerank
      EMBEDDINGS_BASE_URL: 'http://localhost:8000',
      EMBED_DIMS: '512',
      RERANK_BASE_URL: 'http://localhost:8001'
    }
  }
];

async function runAblations() {
  const results = {};
  
  for (const ablation of ABLATIONS) {
    console.log(`\n📊 Testing: ${ablation.name}`);
    
    // Set env vars
    Object.assign(process.env, ablation.env);
    
    // Run eval suite
    const caseResults = await runEvals();
    
    // Aggregate metrics by language
    const metrics = aggregateMetrics(caseResults);
    results[ablation.name] = metrics;
    
    console.log(`   English: recall@5 ${metrics.en.recall.at5.toFixed(3)}, citation ${metrics.en.citationMatch.toFixed(2)}`);
    console.log(`   Arabic:  recall@5 ${metrics.ar.recall.at5.toFixed(3)}, citation ${metrics.ar.citationMatch.toFixed(2)}`);
  }
  
  return results;
}

function aggregateMetrics(caseResults) {
  /**
   * Aggregate case-level metrics into per-language summaries.
   */
  
  const byLang = { en: [], ar: [] };
  
  for (const result of caseResults) {
    const lang = result.evalCase.language || 'en';
    if (byLang[lang]) {
      byLang[lang].push(result.metrics);
    }
  }
  
  const aggregate = {};
  for (const [lang, metrics] of Object.entries(byLang)) {
    aggregate[lang] = {
      // Citation accuracy (% of cases that cite the right Part)
      citationMatch: metrics.filter(m => m.citationMatch).length / metrics.length,
      
      // Recall
      recall: {
        at5: avg(metrics.map(m => m.recall.at5)),
        at10: avg(metrics.map(m => m.recall.at10)),
        at20: avg(metrics.map(m => m.recall.at20))
      },
      
      // Source presence
      hadSources: metrics.filter(m => m.hadSources).length / metrics.length,
      
      count: metrics.length
    };
  }
  
  return aggregate;
}

function avg(arr) {
  const valid = arr.filter(x => x !== null && x !== undefined);
  return valid.length > 0 ? valid.reduce((a, b) => a + b, 0) / valid.length : 0;
}
```

---

## Report: Per-language comparison

Phase 2 will produce an ablation report in the shape below.

> 🧪 **Template — placeholder numbers, not results.** Nothing here has been measured.

```markdown
# Ablation Results  ← EXAMPLE OUTPUT, NUMBERS ARE PLACEHOLDERS

## Recall @ 5 (% of ground-truth chunks in top-5)

| Configuration | English | Arabic | Δ English | Δ Arabic |
|---|---|---|---|---|
| BM25 only | 45% | 5% | baseline | baseline |
| Dense 1024-d | 62% | 38% | +38% | +660% |
| Dense 512-d | 59% | 36% | +31% | +620% |
| Dense 256-d | 54% | 29% | +20% | +480% |
| Dense 512-d + rerank | 68% | 41% | +51% | +720% |
| **Full hybrid** | 70% | 44% | +56% | +780% |

**Interpretation:**
- Dense retrieval unlocks Arabic (5% → 44%), main goal achieved
- Reranking adds ~6-7% for both languages
- Dimension truncation (512-d) loses <3% recall vs 1024-d, saves 50% memory
- BM25 alone is useless for Arabic (5% recall)
```

---

## Citation accuracy by language

> 🧪 **Template — placeholder numbers, not results.**

```markdown
## Citation Match (% of answers citing correct Part)  ← EXAMPLE OUTPUT

| Configuration | English | Arabic |
|---|---|---|
| BM25 only | 92% | 45% |
| Dense only | 88% | 62% |
| + Rerank | 94% | 78% |
| **Full hybrid** | 95% | 81% |

**Interpretation:**
- Hybrid significantly improves Arabic citation accuracy (45% → 81%)
- Reranking helps both, especially Arabic
- English baseline already strong; hybrid provides polish
```

---

## Dimension ablation

> 🧪 **Template — placeholder numbers, not results.** The resident-memory column is the
> only part that can be derived without running anything (dimensions × chunk count ×
> bytes-per-value); the recall columns and the resulting "decision" are placeholders.

```markdown
## Memory vs Recall Trade-off  ← EXAMPLE OUTPUT

| Dimension | Resident | Recall@5 EN | Recall@5 AR | Use case |
|---|---|---|---|---|
| 1024-d | 194 MB | 70% | 44% | Development |
| 512-d | 97 MB | 68% | 42% | Default (recommended) |
| 256-d | 48 MB | 62% | 36% | Constrained (edge) |

**Decision:** Ship 512-d by default.
- Saves 50% memory (97 MB resident)
- <3% recall loss
- ~50ms faster cosine (brute-force at 512-d)
```

---

## Latency breakdown (Phase 2 observability)

Add instrumentation to `src/brain/retrieve.js`:

```javascript
async function retrieveSmart(query, opts = {}) {
  const timings = {};
  
  // Measure dense embedding
  timings.denseStart = Date.now();
  const queryEmbedding = await embedder.embed(query);
  timings.denseMs = Date.now() - timings.denseStart;
  
  // Measure dense recall
  timings.recallStart = Date.now();
  const denseHits = denseRecall(queryEmbedding[0], { k: 50 });
  timings.recallMs = Date.now() - timings.recallStart;
  
  // Measure BM25
  timings.bm25Start = Date.now();
  const bm25Hits = bm25.searchLibrary(query);
  timings.bm25Ms = Date.now() - timings.bm25Start;
  
  // Measure RRF
  timings.rrfStart = Date.now();
  const fusedHits = rrf([denseHits, bm25Hits], 60);
  timings.rrfMs = Date.now() - timings.rrfStart;
  
  // Measure reranking (if configured)
  if (reranker.configured()) {
    timings.rerankStart = Date.now();
    const reranked = await reranker.rerank(query, fusedHits.slice(0, 20));
    timings.rerankMs = Date.now() - timings.rerankStart;
  }
  
  timings.totalMs = Date.now() - timings.start;
  
  // Return timings with result for logging
  return {
    passages: /* ... */,
    timings  // For observability
  };
}
```

Log timings for each request (Cloud Logging):

> 🧪 **Template — the millisecond values are invented**, illustrating the log record's
> shape. Real timings depend on the endpoint, region and hardware in use.

```
{
  "retrieval": {          // ← EXAMPLE RECORD, TIMINGS ARE PLACEHOLDERS
    "query_len": 42,
    "dense_ms": 850,      // Query embedding
    "recall_ms": 25,      // Dense recall (brute-force cosine)
    "bm25_ms": 5,         // BM25 from index
    "rrf_ms": 2,          // Reciprocal-rank fusion
    "rerank_ms": 200,     // Cross-encoder reranking (optional)
    "total_ms": 1082,
    "language": "ar"
  }
}
```

---

## Phase 2 output: Decision document

At end of Phase 2, produce a decision document.

> [!CAUTION]
> 🧪 **Template — this is the most misread block in the file.** It is written in the
> past tense, carries "(achieved: …)" annotations and ends in an approval stamp, so it
> reads like a completed sign-off. It is not one. No ablation has run, nothing has been
> achieved, and nothing has been approved. This block is the *form* the decision
> document should take once there are real numbers to put in it.

```markdown
# Phase 2 Conclusion: Retrieval Config Recommendation
# ← EXAMPLE OUTPUT. EVERY FIGURE AND VERDICT BELOW IS A PLACEHOLDER.

Based on ablation studies across 138 cases (113 EN + 25 AR):

## Recommended production config

- **Embeddings model:** Qwen3-Embedding-0.6B (cross-lingual)
- **Dimension:** 512-d (MRL truncated from 1024-d)
- **Reranker:** Alibaba-NLP/gte-multilingual-reranker-base
- **Fusion:** Reciprocal-rank fusion (BM25 + dense, k=60)

## Expected impact

- **English:** 45% → 70% recall@5 (+56%)
- **Arabic:** 5% → 44% recall@5 (+780%)
- **Latency:** ~1.1s per request (85% embeddings, 15% rerank)
- **Memory:** 97 MB resident index

## Ship gates

- [ ] Recall@5 Arabic ≥ 40% (achieved: 44%)
- [ ] Citation accuracy Arabic ≥ 75% (achieved: 81%)
- [ ] Latency p95 ≤ 2s (acceptable for agentic loop with timeout)
- [ ] No regression on English (70% vs 92% baseline: polishing, not regression)

**Result:** ✅ APPROVED FOR PRODUCTION
```

---

## Implementation: `evals/run.js` updates

Modify eval runner to support ablations:

```javascript
// evals/run.js

const PHASES = {
  'phase1': { /* ... */ },
  'phase2-ablations': {
    run: async () => {
      const results = await runAblations();
      const report = generateAblationReport(results);
      fs.writeFileSync('evals/phase-2-ablation-report.md', report);
      return report;
    }
  }
};

// CLI
if (process.argv[2] === '--phase2-ablations') {
  PHASES['phase2-ablations'].run();
}
```

Usage:

```bash
# Run full ablation suite
npm run eval -- --phase2-ablations

# Output: evals/phase-2-ablation-report.md (human-readable)
#         evals/phase-2-metrics.json (machine-readable)
```

---

## Gate for Phase 2 completion

Phase 2 is complete when all of the following hold. **None are met yet** — these are
targets to hit, not a checklist of finished work:

1. [ ] Ablation report generated (English + Arabic metrics)
2. [ ] Recall ≥ 40% for Arabic
3. [ ] Citation accuracy ≥ 75% for Arabic
4. [ ] No regression on English
5. [ ] Decision document signed (config + production gates)

The Arabic thresholds above are aspirations chosen before measurement. The BM25-only
baseline they are meant to improve on has not been measured either — it is expected to
be very low, because the corpus is English and a pure-Arabic query scores few or no
lexical hits, but "expected to be low" is not a number.

Once Phase 2 gates pass → **Phase 3: Fine-tuned embedder** (not just inference; training on GACAR-specific retrieval tasks).

---

## Next: Phase 3 — Fine-tuned `flygaca/CaptAdel` embedder

Phase 3 improves on the off-the-shelf Qwen3-Embedding-0.6B by fine-tuning it on GACAR retrieval tasks, potentially gaining another 10–20% recall.
