# Phase 1: Async Tool Loop for Hybrid Retrieval in Gemini Path

**Status:** Implementation specification (ready to code)

**Why this matters:** Hybrid retrieval (dense + BM25 + rerank) only helps the retrieve-then-read path today. The default English path is agentic and calls `search_library` synchronously, bypassing `retrieveSmart()`. This spec makes the Gemini tool loop async-aware so both paths benefit.

---

## Current state

**Retrieve-then-read (Arabic):** ✅ Uses hybrid
```
answer.js:55 → answerAgentic() → retrieveSmart()
                                    ↓ dense + BM25 + rerank
```

**Agentic (Gemini/English):** ❌ Ignores hybrid
```
answer.js → gemini.js → search_library tool → bm25.searchLibrary()
                                                ↓ BM25 only
```

**Result:** Hybrid retrieval improves Arabic hit rate but leaves English untouched. The majority traffic sees no benefit.

---

## Architecture: Tool-call injection point

Gemini's agentic loop in `gemini.js:answerAgentic()` is currently:

```javascript
// Simplified (actual code at line ~60)
while (toolsToCall.length > 0) {
  const responses = [];
  for (const call of toolsToCall) {
    if (call.function.name === 'search_library') {
      // Synchronous call to BM25
      const results = bm25.searchLibrary(call.function.args.query);
      responses.push({ toolUseId: call.id, content: results });
    }
    // … other tools …
  }
  // Send responses, get next tool calls
  toolsToCall = await getToolCalls(…);
}
```

**Problem:** The `search_library` tool result is computed synchronously and immediately. We need to intercept it, run `retrieveSmart()` instead (or in parallel), and return the best-ranked results.

---

## Solution: Async tool-call dispatch

Replace the synchronous tool-call handler with one that supports:
1. **Async operations** (dense embedding, reranking)
2. **Fallback:** If dense/rerank errors, fall back to BM25
3. **No behavioral change:** Output shape stays the same (same `{passages, count}` object)

### Code: `src/brain/providers/gemini.js`

```javascript
// Line ~60, in answerAgentic()

async function handleToolCall(call, context) {
  const { toolName, args } = call;
  
  if (toolName === 'search_library') {
    // NEW: Try hybrid retrieval; fall back to BM25 if it fails
    return await search_library_hybrid(args.query, context);
  }
  
  if (toolName === 'lookup_citation') {
    // Existing implementation (stays synchronous)
    return lookup_citation(args.cite);
  }
  
  if (toolName === 'list_changes') {
    // Existing implementation (stays synchronous)
    return list_changes();
  }
  
  throw new Error(`Unknown tool: ${toolName}`);
}

async function search_library_hybrid(query, context) {
  /**
   * Hybrid retrieval for search_library tool.
   * Tries dense embedding + RRF first; falls back to BM25 on error.
   */
  
  // BM25 baseline (always run)
  const bm25Results = bm25.searchLibrary(query);
  
  // If hybrid is not configured, return BM25
  if (!hybridAvailable()) {
    return bm25Results;
  }
  
  try {
    // Dense + rerank path (this is retrieveSmart's core logic, inlined here for reuse)
    const { retrieve } = require('./retrieve');
    const hybridResults = await retrieve.retrieveSmart(query, {
      bm25Fallback: bm25Results,
      context
    });
    
    return hybridResults;
  } catch (err) {
    // Log but don't crash — fallback to BM25
    console.warn(`Hybrid retrieval error, using BM25: ${err.message}`);
    return bm25Results;
  }
}

// Modify answerAgentic() to be async
async function answerAgentic(req, context) {
  // … existing setup …
  
  let toolsToCall = initialToolCalls;
  
  while (toolsToCall.length > 0) {
    const responses = [];
    
    // Process all tool calls concurrently (or sequentially for search_library if DB state is an issue)
    for (const call of toolsToCall) {
      try {
        const result = await handleToolCall(call, context);
        responses.push({
          toolUseId: call.id,
          content: JSON.stringify(result)
        });
      } catch (err) {
        responses.push({
          toolUseId: call.id,
          isError: true,
          content: err.message
        });
      }
    }
    
    // Send responses, get next batch
    const nextReq = {
      …context.geminiRequest,
      messages: […context.geminiRequest.messages, response, userMessageWithResults]
    };
    
    const nextResp = await callGemini(nextReq);
    toolsToCall = extractToolCalls(nextResp);
  }
  
  return extractAnswer(nextResp);
}
```

### Integration with `retrieve.js`

Refactor `retrieveSmart()` to be usable from the tool-call path:

```javascript
// src/brain/retrieve.js

/**
 * Hybrid retrieval for use in both retrieve-then-read and agentic paths.
 * @param {string} query — The question (already rewritten if applicable)
 * @param {object} opts — { bm25Fallback, context, ... }
 * @returns {Promise<{passages, count, ...}>} — Same shape as retrieve()
 */
async function retrieveSmart(query, opts = {}) {
  const { bm25Fallback, context } = opts;
  
  // Dense recall
  let denseHits;
  try {
    const queryEmbedding = await embedder.embed(query, {
      model: process.env.EMBEDDINGS_MODEL,
      timeoutMs: 10000  // Shorter timeout for tool call context
    });
    if (!queryEmbedding || !queryEmbedding[0]) {
      throw new Error('Empty embedding');
    }
    
    denseHits = denseRecall(queryEmbedding[0], {
      k: 50,  // Dense top-50
      minSimilarity: 0.5
    });
  } catch (err) {
    console.warn(`Dense recall failed: ${err.message}`);
    denseHits = [];
  }
  
  // BM25 (from fallback or fresh)
  const bm25Hits = bm25Fallback ? 
    bm25Fallback.passages.map((p, i) => ({ index: p.index, rank: i })) :
    bm25.searchLibrary(query).passages.map((p, i) => ({ index: p.index, rank: i }));
  
  // Reciprocal rank fusion
  const rffScores = rrf(
    [
      denseHits.map(h => h.index),
      bm25Hits.map(h => h.index)
    ],
    60  // k parameter
  );
  
  // Rerank if configured
  let fusedIndices = rffScores.map(([idx]) => idx).slice(0, 20);  // Top-20 for rerank
  if (reranker.configured()) {
    try {
      const fusedPassages = fusedIndices.map(idx => chunks[idx].text);
      const reranked = await reranker.rerank(query, fusedPassages, {
        model: process.env.RERANK_MODEL,
        timeoutMs: 5000
      });
      fusedIndices = reranked
        .sort((a, b) => b.score - a.score)
        .map(r => fusedIndices[r.index]);
    } catch (err) {
      console.warn(`Reranking failed: ${err.message}`);
      // Use RRF order as-is
    }
  }
  
  // Build result (same shape as retrieve())
  const passages = fusedIndices
    .slice(0, 10)  // Top-10 for context
    .map(idx => expandChunk(chunks[idx]));
  
  return {
    passages,
    count: passages.length,
    sources: passages.map(p => ({ part: p.part, section: p.section }))
  };
}

// Export both for internal reuse
module.exports = {
  retrieve: retrieve,  // BM25 only
  retrieveSmart: retrieveSmart  // Hybrid
};
```

---

## Error handling & timeouts

Since the tool loop is user-facing, timeouts must be tighter than batch operations:

```javascript
// src/brain/providers/gemini.js

const TOOL_CALL_TIMEOUT = {
  'search_library': 10000,   // Dense embed + rerank: 10s
  'lookup_citation': 1000,   // Direct lookup: 1s
  'list_changes': 2000       // API call: 2s
};

async function handleToolCall(call, context) {
  const timeout = TOOL_CALL_TIMEOUT[call.function.name] || 5000;
  return Promise.race([
    executeToolCall(call, context),
    new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Tool timeout')), timeout)
    )
  ]);
}
```

---

## Testing

Add to `test/providers-gemini.test.js`:

```javascript
test('answerAgentic — search_library calls retrieveSmart when configured', async (t) => {
  // Set up hybrid retrieval config
  process.env.EMBEDDINGS_BASE_URL = 'http://localhost:8000';
  
  // Mock embedder + reranker
  const mockEmbeddings = [new Float32Array([0.1, 0.2, 0.3])];
  sinon.stub(embedder, 'embed').resolves(mockEmbeddings);
  
  const req = {
    q: "What is VFR?",
    lang: 'en'
  };
  
  const resp = await answerAgentic(req, mockContext);
  
  // Verify search_library was called with hybrid results
  t.match(resp.meta.toolCalls, [{ name: 'search_library', ... }]);
  
  // Should have sources (BM25 + dense fusion)
  t.ok(resp.sources.length > 0);
});

test('answerAgentic — falls back to BM25 if dense embedding fails', async (t) => {
  process.env.EMBEDDINGS_BASE_URL = 'http://localhost:8000';
  sinon.stub(embedder, 'embed').rejects(new Error('API error'));
  
  const resp = await answerAgentic(req, mockContext);
  
  // Should still return sources (BM25 fallback)
  t.ok(resp.sources.length > 0);
});
```

---

## Evaluation impact

This change is **not** measured independently — it's part of Phase 1's eval gate. Once the Arabic cases + binary index + async loop are all in place, `npm run eval` runs against the live corpus with all three components active. The 25 new Arabic cases will fail if any piece is missing.

---

## Deployment checklist

- [ ] Verify `answerAgentic()` is now async
- [ ] Hybrid timeouts are configured (10s for dense, shorter for others)
- [ ] Error handling + fallback to BM25 works
- [ ] `retrieveSmart()` is portable between gemini.js and retrieve.js
- [ ] No behavioral change to non-hybrid path (gradual rollout safe)
- [ ] Load test shows tool-call latency is acceptable (<5s p95 for search_library)

---

## Next: HF Jobs build script (Phase 1 continued)

Once this lands, the parallel work item is deploying the index build to HF Jobs so corpus embedding runs on GPU (not locally, not on Cloud Run).
