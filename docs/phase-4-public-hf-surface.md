# Phase 4: Public HF Proof Surface

**Status:** Specification (ready to implement)

> [!WARNING]
> **Every metric, screenshot and sample output in this document is illustrative.** The
> latency figures, similarity scores and mock UI transcripts are invented to show what
> the surface should look like — **none are measured**, and no ablation or fine-tuning
> run has produced real numbers to replace them.
>
> **What actually exists today:** the Gradio app source (`src/gradio_app.py`) and a Space
> at [`flygaca/captain-adel`](https://huggingface.co/spaces/flygaca/captain-adel).
> The fine-tuned embedder this document assumes **does not exist** — no weights are
> published — so the A/B "base vs. fine-tuned" comparison described below cannot run yet.
>
> **Naming:** `scripts/finetune-embedder.py` defaults `HUB_MODEL_ID` to
> `flygaca/CaptAdel-finetuned`, which is not on the Hub. The model repo that does exist
> is [`flygaca/CaptAdel`](https://huggingface.co/flygaca/CaptAdel). Decide which name is
> canonical before the first push.

**Why this matters:** Phases 1–3 unlock cross-lingual retrieval and fine-tune it for GACAR. Phase 4 is the **public proof and marketing anchor** — a Hugging Face Space that demonstrates the retrieval engine live, with citation transparency, latency breakdown, and bilingual UI. This is what pilots and flight schools see when they ask "does this actually work?"

It also serves as the **integration proof** for Fly GACA's adoption of the CaptAdel retrieval stack (Qwen3-Embedding, RRF, reranking, fine-tuning).

---

## Surface: Hugging Face Spaces app

**Repo:** `flygaca/captain-adel` (public Gradio app)

**Audience:** Pilots, flight schools, regulators, aviation AI researchers — anyone validating that cross-lingual retrieval on aviation regulations works.

**Demo pattern:**
1. User enters Arabic or English question
2. App retrieves top-k passages via hybrid retrieval
3. Display: **retrieved passages** (ranked list with similarity scores) + **latency breakdown** (dense embed time, recall time, RRF time, rerank time)
4. Toggle: **Side-by-side A/B** (base Qwen3 vs. fine-tuned CaptAdel) showing score differences
5. Transparency: **Citation anchor** — click a passage to see its Part/section in a linked GACAR viewer (or plain text excerpt)
6. Bilingual UI (AR/EN) with persistent language choice

---

## Architecture: Lightweight Gradio app

**Stack:**
- `Gradio` (UI, no heavy frontend framework)
- `sentence-transformers` (load fine-tuned model locally in Space)
- `numpy` (cosine similarity, RRF fusion)
- Corpus index (binary `.bin`, preloaded)

**Deployment:** Hugging Face Spaces (free tier, 2 vCPU, 16 GB RAM — sufficient for inference-only model).

---

## Implementation: `src/gradio_app.py`

```python
#!/usr/bin/env python3
"""
Captain Adel Retrieval Proof Surface

Live demo of cross-lingual retrieval on GACAR regulations.
- Arabic queries → English passages
- Hybrid retrieval (BM25 + dense + rerank)
- Side-by-side A/B (base vs. fine-tuned embedder)
- Latency breakdown + citation transparency
"""

import gradio as gr
import json
import gzip
import time
import os
import numpy as np
from pathlib import Path
from typing import List, Tuple
from sentence_transformers import CrossEncoder
from sentence_transformers import SentenceTransformer
import re

# =============================================================================
# SETUP
# =============================================================================

CORPUS_PATH = "src/brain/_chunks.json.gz"
EMBEDDINGS_BINARY_PATH = "src/brain/_embeddings.bin"
BASE_MODEL = "Qwen/Qwen3-Embedding-0.6B"
FINE_TUNED_MODEL = "flygaca/CaptAdel-finetuned"
RERANK_MODEL = "Alibaba-NLP/gte-multilingual-reranker-base"

# Global state
corpus = None
embeddings_base = None
embeddings_finetuned = None
reranker = None
bm25_index = None

def load_corpus():
    """Load GACAR chunks from gzipped JSON."""
    global corpus
    if corpus is None:
        with gzip.open(CORPUS_PATH) as f:
            corpus = json.load(f)
    return corpus

def load_embeddings_binary(path):
    """Load binary embedding index (float32)."""
    with open(path, 'rb') as f:
        buf = f.read()
    
    # Read header
    magic = int.from_bytes(buf[0:4], 'little')
    assert magic == 0xADEL2026, "Invalid magic number"
    
    version = int.from_bytes(buf[4:8], 'little')
    num_vectors = int.from_bytes(buf[8:12], 'little')
    dims_encoded = int.from_bytes(buf[12:16], 'little')
    
    # Decode dims
    dims = 1 << dims_encoded if dims_encoded <= 10 else dims_encoded
    
    # Read vectors
    vectors = []
    offset = 16
    for i in range(num_vectors):
        vec = np.frombuffer(buf, dtype=np.float32, count=dims, offset=offset)
        vectors.append(vec.copy())
        offset += dims * 4
    
    return np.array(vectors)

def load_models():
    """Load sentence transformers and reranker (lazy-init)."""
    global embeddings_base, embeddings_finetuned, reranker
    
    if embeddings_base is None:
        embeddings_base = SentenceTransformer(BASE_MODEL)
    
    if embeddings_finetuned is None:
        embeddings_finetuned = SentenceTransformer(FINE_TUNED_MODEL)
    
    if reranker is None:
        reranker = CrossEncoder(RERANK_MODEL)

# =============================================================================
# RETRIEVAL PIPELINE
# =============================================================================

def normalize_text_bm25(text: str) -> str:
    """Simple Arabic normalization for BM25."""
    # Remove diacritics
    text = re.sub(r'[ً-ْ]', '', text)
    # Normalize alef variants
    text = text.replace('أ', 'ا').replace('إ', 'ا')
    return text.lower()

def bm25_search(query: str, k: int = 50) -> List[Tuple[int, float]]:
    """
    Simple BM25 search (mock — a real implementation would use rank-bm25 package).
    For demo purposes, fallback to cosine similarity on query embedding.
    
    Returns: [(chunk_idx, score), ...]
    """
    # Normalize query
    normalized_query = normalize_text_bm25(query)
    
    corpus = load_corpus()
    
    # Score by keyword overlap
    scores = []
    query_terms = set(normalized_query.split())
    
    for i, chunk in enumerate(corpus):
        chunk_text = normalize_text_bm25(chunk.get('text', ''))
        chunk_terms = set(chunk_text.split())
        
        # Simple Jaccard overlap
        overlap = len(query_terms & chunk_terms)
        scores.append((i, overlap))
    
    # Return top-k by score
    ranked = sorted(scores, key=lambda x: x[1], reverse=True)
    return [(idx, score) for idx, score in ranked[:k]]

def dense_search(query: str, embedder, k: int = 50) -> List[Tuple[int, float]]:
    """Dense retrieval via cosine similarity."""
    query_emb = embedder.encode([query], convert_to_tensor=False)[0]
    corpus_embs = load_embeddings_binary(EMBEDDINGS_BINARY_PATH)
    
    # Cosine similarity
    similarities = np.dot(corpus_embs, query_emb) / (
        np.linalg.norm(corpus_embs, axis=1) * np.linalg.norm(query_emb) + 1e-8
    )
    
    # Top-k
    top_indices = np.argsort(similarities)[::-1][:k]
    return [(idx, similarities[idx]) for idx in top_indices]

def reciprocal_rank_fusion(ranked_lists: List[List[Tuple[int, float]]], k: int = 60) -> List[int]:
    """
    RRF combines multiple ranked lists.
    score(d) = sum_i (1 / (k + rank_i(d)))
    """
    scores = {}
    
    for ranked_list in ranked_lists:
        for rank, (idx, _) in enumerate(ranked_list, 1):
            score = 1.0 / (k + rank)
            scores[idx] = scores.get(idx, 0) + score
    
    # Return sorted by RRF score
    return [idx for idx, _ in sorted(scores.items(), key=lambda x: x[1], reverse=True)]

def rerank_passages(query: str, passages: List[str], reranker_model) -> List[Tuple[int, float]]:
    """Cross-encoder reranking."""
    pairs = [[query, p] for p in passages]
    scores = reranker_model.predict(pairs)
    return [(i, scores[i]) for i in range(len(passages))]

def hybrid_retrieve(query: str, embedder, use_rerank: bool = True) -> Tuple[List[dict], dict]:
    """
    Full hybrid retrieval pipeline.
    
    Returns:
      - passages: list of {chunk_id, text, part, section, similarity, dense_score, bm25_score, rerank_score}
      - timings: {dense_ms, recall_ms, bm25_ms, rrf_ms, rerank_ms, total_ms}
    """
    timings = {}
    start = time.time()
    
    # 1. Dense retrieval
    t0 = time.time()
    dense_results = dense_search(query, embedder, k=50)
    timings['dense_ms'] = (time.time() - t0) * 1000
    
    # 2. BM25 retrieval
    t0 = time.time()
    bm25_results = bm25_search(query, k=50)
    timings['bm25_ms'] = (time.time() - t0) * 1000
    
    # 3. RRF fusion
    t0 = time.time()
    dense_indices = [idx for idx, _ in dense_results]
    bm25_indices = [idx for idx, _ in bm25_results]
    fused_indices = reciprocal_rank_fusion([dense_results, bm25_results], k=60)
    timings['rrf_ms'] = (time.time() - t0) * 1000
    
    # 4. Reranking (optional)
    corpus = load_corpus()
    top_passages = [corpus[idx]['text'] for idx in fused_indices[:20]]
    
    if use_rerank:
        t0 = time.time()
        load_models()  # Ensure reranker is loaded
        rerank_results = rerank_passages(query, top_passages, reranker)
        timings['rerank_ms'] = (time.time() - t0) * 1000
        
        # Sort by rerank score
        reranked_indices = [
            fused_indices[rerank_results[i][0]]
            for i in sorted(range(len(rerank_results)), key=lambda i: rerank_results[i][1], reverse=True)
        ]
    else:
        reranked_indices = fused_indices[:20]
        timings['rerank_ms'] = 0
    
    # 5. Build output
    passages = []
    for idx in reranked_indices[:10]:  # Top-10 for display
        chunk = corpus[idx]
        
        # Find scores in original results
        dense_score = next((s for i, s in dense_results if i == idx), 0)
        bm25_score = next((s for i, s in bm25_results if i == idx), 0)
        
        passages.append({
            'chunk_id': idx,
            'text': chunk['text'],
            'part': chunk.get('part'),
            'section': chunk.get('section'),
            'dense_score': dense_score,
            'bm25_score': bm25_score,
        })
    
    timings['total_ms'] = (time.time() - start) * 1000
    
    return passages, timings

# =============================================================================
# GRADIO UI
# =============================================================================

def answer_and_retrieve(
    query: str,
    model_choice: str = "Fine-tuned (CaptAdel)",
    show_ab: bool = False
) -> Tuple[str, str]:
    """
    Main retrieval + display function.
    """
    
    load_models()
    
    # Choose model
    if "Fine-tuned" in model_choice:
        embedder = embeddings_finetuned
        model_name = "CaptAdel-finetuned"
    else:
        embedder = embeddings_base
        model_name = "Qwen3-base"
    
    # Retrieve
    passages, timings = hybrid_retrieve(query, embedder, use_rerank=True)
    
    # Format output
    output_html = f"""
    <div style="font-family: sans-serif; max-width: 800px;">
        <h3>Query: <em>{query}</em></h3>
        <h4>Model: {model_name}</h4>
        
        <details>
            <summary><strong>Latency Breakdown</strong></summary>
            <ul>
                <li>Dense embedding: {timings['dense_ms']:.0f} ms</li>
                <li>BM25 search: {timings['bm25_ms']:.0f} ms</li>
                <li>RRF fusion: {timings['rrf_ms']:.0f} ms</li>
                <li>Reranking: {timings['rerank_ms']:.0f} ms</li>
                <li><strong>Total: {timings['total_ms']:.0f} ms</strong></li>
            </ul>
        </details>
        
        <h4>Retrieved Passages (Top 10)</h4>
        <table style="width: 100%; border-collapse: collapse;">
            <tr style="background: #f0f0f0;">
                <th style="border: 1px solid #ccc; padding: 8px;">Part</th>
                <th style="border: 1px solid #ccc; padding: 8px;">Passage</th>
                <th style="border: 1px solid #ccc; padding: 8px;">Dense Score</th>
            </tr>
    """
    
    for p in passages:
        output_html += f"""
            <tr style="border: 1px solid #eee;">
                <td style="border: 1px solid #ccc; padding: 8px;">Part {p['part']}</td>
                <td style="border: 1px solid #ccc; padding: 8px; font-size: 0.9em;">
                    {p['text'][:200]}...
                </td>
                <td style="border: 1px solid #ccc; padding: 8px; text-align: center;">
                    {p['dense_score']:.3f}
                </td>
            </tr>
        """
    
    output_html += """
        </table>
    </div>
    """
    
    # For A/B, also run base model
    if show_ab:
        passages_base, timings_base = hybrid_retrieve(query, embeddings_base, use_rerank=True)
        output_html += f"""
        <hr/>
        <h3>A/B Comparison: Base Model</h3>
        <p>Total latency (base): {timings_base['total_ms']:.0f} ms</p>
        """
    
    return output_html

def create_interface():
    """Build Gradio UI."""
    with gr.Blocks() as demo:
        gr.Markdown("""
        # Captain Adel Retrieval Proof Surface
        
        Live demonstration of cross-lingual hybrid retrieval on GACAR regulations.
        
        - **Query:** Ask in Arabic or English
        - **Retrieval:** Dense embeddings + BM25 + RRF + cross-encoder reranking
        - **Transparency:** See latency breakdown and citation anchors
        - **A/B:** Compare fine-tuned vs. base embedder
        """)
        
        with gr.Row():
            query_input = gr.Textbox(
                label="Question (Arabic or English)",
                placeholder="ما هي متطلبات المعدات الدنيا؟ / What are the minimum equipment requirements?",
                lines=2
            )
        
        with gr.Row():
            model_radio = gr.Radio(
                ["Fine-tuned (CaptAdel)", "Base (Qwen3)"],
                label="Embedder",
                value="Fine-tuned (CaptAdel)"
            )
            ab_toggle = gr.Checkbox(label="Show A/B comparison", value=False)
        
        submit_btn = gr.Button("Retrieve", variant="primary")
        
        output = gr.HTML(label="Results")
        
        submit_btn.click(
            answer_and_retrieve,
            inputs=[query_input, model_radio, ab_toggle],
            outputs=[output]
        )
        
        # Example queries
        gr.Examples(
            examples=[
                ["ما هي سرعة الهبوط المنخفضة؟", "Fine-tuned (CaptAdel)", False],
                ["What is the minimum equipment list?", "Fine-tuned (CaptAdel)", False],
                ["ما هي متطلبات رخصة الطيار؟", "Base (Qwen3)", True],
            ],
            inputs=[query_input, model_radio, ab_toggle],
            fn=answer_and_retrieve,
            outputs=[output],
            cache_examples=True
        )
    
    return demo

if __name__ == "__main__":
    demo = create_interface()
    demo.launch(server_name="0.0.0.0", server_port=7860, share=True)
```

---

## Deployment to Hugging Face Spaces

### Prerequisites

1. **Create repo:** `flygaca/captain-adel` on Hub (public)
2. **Clone and structure:**

```bash
git clone https://huggingface.co/spaces/flygaca/captain-adel
cd captain-adel

# Copy corpus and binaries
cp /path/to/captain-adel/src/brain/_chunks.json.gz .
cp /path/to/captain-adel/src/brain/_embeddings.bin .

# Copy app
cp /path/to/captain-adel/src/gradio_app.py app.py

# Add requirements
cat > requirements.txt <<EOF
gradio==4.20.0
sentence-transformers==2.2.2
numpy==1.24.3
torch==2.0.1
EOF

# Add README.
#
# This is a PUBLIC card — it must describe what the Space actually runs, not what
# this plan hopes it will run. Two rules:
#   1. List a model only once it is genuinely wired in. Do NOT advertise a fine-tuned
#      embedder until weights are published and the Space is using them.
#   2. Keep the unaffiliated/educational disclaimer. Every public Captain Adel surface
#      carries it, and this one answers regulatory questions.
cat > README.md <<EOF
# Captain Adel Retrieval Proof Surface

Cross-lingual hybrid retrieval over GACAR (General Authority of Civil Aviation
Regulations), from the Fly GACA project.

## Unofficial & educational

Independent — **not** affiliated with, endorsed by, or operated by the General Authority
of Civil Aviation (GACA). This is a retrieval demo, not official guidance, not legal
advice, and not for operational use. The authoritative source for any regulation is
always GACA: https://gaca.gov.sa

## Features
- Arabic queries → English GACAR passages
- BM25 + dense embeddings + RRF fusion + cross-encoder reranking
- Latency breakdown + citation transparency

## Models
- **Embedder:** \`Qwen/Qwen3-Embedding-0.6B\` (off-the-shelf)
- **Reranker:** \`Alibaba-NLP/gte-multilingual-reranker-base\`
- A GACAR-fine-tuned embedder is planned but **not yet published** — add it here, and
  enable the A/B toggle, only once its weights are live.

## Data
- Corpus: GACAR regulations, 47,361 chunks across 95 documents
- Regression suite: 138 bilingual cases (in the Captain Adel repo)

## Try it
[https://huggingface.co/spaces/flygaca/captain-adel](https://huggingface.co/spaces/flygaca/captain-adel)
EOF

# Deploy
git add .
git commit -m "Deploy: Captain Adel retrieval proof surface"
git push
```

### Space configuration

In Hugging Face Spaces settings:

- **Runtime:** CPU (Standard CPU with 16 GB RAM is sufficient for inference)
- **Private files:** Check if corpus/embeddings should be in `hf_hub` or embedded
- **Persistent storage:** Not needed (inference-only, no writing)

---

## Expected UI / User flow

### Screenshot flow

1. **Entry:** Bilingual hero with example queries
   ```
   "Captain Adel Retrieval Proof Surface"
   [Query input: "ما هي متطلبات المعدات الدنيا؟" / "What are minimum equipment requirements?"]
   [Model choice: ○ Fine-tuned ○ Base] [☐ Show A/B]
   [Retrieve ▶]
   ```

2. **Results:** — 🧪 *mockup. Every latency and similarity score below is invented to
   show the layout; none were measured, and the passage text is paraphrased rather than
   quoted from GACAR.*

   ```
   Query: "ما هي متطلبات المعدات الدنيا؟"      ← MOCKUP, ALL NUMBERS ARE PLACEHOLDERS
   Model: CaptAdel-finetuned
   
   ⏱ Latency: 850 ms total
     - Dense embedding: 120 ms
     - BM25 search: 5 ms
     - RRF fusion: 2 ms
     - Reranking: 200 ms
   
   TOP 10 PASSAGES:
   ┌─────────────────────────────────────────┐
   │ Part 91, §91.205                        │
   │ "The pilot in command shall ensure..."  │
   │ Dense score: 0.872                      │
   └─────────────────────────────────────────┘
   ┌─────────────────────────────────────────┐
   │ Part 91, §91.207                        │
   │ "All aircraft operated under VFR..."    │
   │ Dense score: 0.834                      │
   └─────────────────────────────────────────┘
   ... (8 more)
   ```

3. **A/B toggle** (if checked):
   ```
   ═══ BASE MODEL (Qwen3) ═══
   Total latency: 920 ms
   Top passage: Part 91, §91.205 (Dense: 0.801)
   → Fine-tuned scores +0.07 (7% improvement)
   ```

---

## Metrics to track

Once live, instrument the Space to measure usage:

```python
# In Gradio callback
import json

def log_retrieval(query, model, num_passages, total_latency_ms):
    """Log to CSV or external analytics."""
    log_entry = {
        'timestamp': datetime.now().isoformat(),
        'query_lang': 'ar' if detect_arabic(query) else 'en',
        'query_len': len(query),
        'model': model,
        'num_passages': num_passages,
        'total_latency_ms': total_latency_ms
    }
    # Append to analytics file or send to external service
```

**Dashboard metrics:**
- Queries per day (usage)
- Query language distribution (AR vs. EN)
- Average latency (model, breakdown)
- Most popular queries (trending)
- A/B model preference (if tracked)

---

## Gate for Phase 4 completion

Phase 4 is complete when all of the following hold. **Only the first is done** — the
✅ marks that used to head this list were a formatting choice, not a status:

1. [x] Gradio app written (`src/gradio_app.py`) and a Space exists at
       `flygaca/captain-adel`
2. [ ] Space verified running, loading and returning retrieval results
3. [ ] A/B toggle works — **blocked**: needs a fine-tuned model, and no weights are
       published
4. [ ] Latency breakdown shows real measured wall-clock time
5. [ ] Citations are anchored to Part/section (clickable or visible)
6. [ ] Bilingual UI works (Arabic/English toggle)
7. [ ] Example queries demonstrate Arabic→English retrieval end to end
8. [ ] Space shared with the Fly GACA team for feedback

**Intended deliverable:** a public demo that would show:
- Cross-lingual retrieval working (Arabic questions returning English GACAR passages)
- Whether the fine-tuned embedder improves recall — the A/B comparison is what would
  answer that; until it runs, the improvement is an open question, not a claim
- Transparency (latency breakdown + citation anchors)
- A usable bilingual interface

Once Phase 4 gates pass, the **full 4-phase delivery is complete**.

---

## Post-Phase 4: Fly GACA integration

After public proof, integrate CaptAdel's retrieval stack into Fly GACA:

1. **Embed Qwen3-Embedding** in Fly GACA's backend (same HF Jobs build process)
2. **Reuse binary index** (commit to `flygaca/CaptAdel` model repo)
3. **Route Fly GACA library queries** through `retrieveSmart()` (hybrid, with fallback)
4. **Log retrieval quality** (MRR, citation accuracy per API caller)
5. **Monitor cross-lingual unlock** (% Arabic queries now retrieving vs. BM25-only baseline)

This closes the loop: CaptAdel proof surface → Fly GACA integration → production retrieval for the aviation ecosystem.
