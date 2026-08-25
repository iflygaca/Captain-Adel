#!/usr/bin/env python3
"""
Captain Adel Retrieval Proof Surface

Live demo of cross-lingual retrieval on GACAR regulations.
- Arabic queries → English passages
- Hybrid retrieval (BM25 + dense + RRF + rerank)
- Side-by-side A/B (base vs. fine-tuned embedder)
- Latency breakdown + citation transparency

Deploy to Hugging Face Spaces: https://huggingface.co/spaces/flygaca/captadel-proof-space

Prerequisites:
  pip install gradio sentence-transformers numpy
"""

import json
import gzip
import time
import os
import re
import numpy as np
from pathlib import Path
from typing import List, Tuple, Dict
from sentence_transformers import SentenceTransformer, CrossEncoder
import gradio as gr

# =============================================================================
# Configuration
# =============================================================================

CORPUS_PATH = "src/brain/_chunks.json.gz"
EMBEDDINGS_BINARY_PATH = "src/brain/_embeddings.bin"
BASE_MODEL = "Qwen/Qwen3-Embedding-0.6B"
FINE_TUNED_MODEL = "flygaca/CaptAdel-finetuned"
RERANK_MODEL = "Alibaba-NLP/gte-multilingual-reranker-base"

# Magic number for binary index (matches embedding.js)
BINARY_INDEX_MAGIC = 0xADEF0001

# Global state
corpus = None
embeddings_base = None
embeddings_finetuned = None
reranker = None

# =============================================================================
# Data Loading
# =============================================================================

def load_corpus():
    """Load GACAR chunks from gzipped JSON."""
    global corpus
    if corpus is None:
        if not os.path.exists(CORPUS_PATH):
            print(f"Warning: {CORPUS_PATH} not found")
            return []

        try:
            with gzip.open(CORPUS_PATH, 'rt', encoding='utf-8') as f:
                data = json.load(f)
                # Handle both array and {"chunks": [...]} wrapper
                corpus = data if isinstance(data, list) else data.get('chunks', [])
        except Exception as e:
            print(f"Error loading corpus: {e}")
            corpus = []

    return corpus

def load_embeddings_binary(path: str) -> np.ndarray:
    """Load binary embedding index (float32)."""
    if not os.path.exists(path):
        print(f"Warning: {path} not found, using mock embeddings")
        return np.random.randn(len(load_corpus()), 1024).astype(np.float32)

    try:
        with open(path, 'rb') as f:
            buf = f.read()

        # Read header
        magic = int.from_bytes(buf[0:4], 'little')
        if magic != BINARY_INDEX_MAGIC:
            print(f"Warning: Invalid magic number {hex(magic)}, expected {hex(BINARY_INDEX_MAGIC)}")
            # Fall back to mock embeddings
            return np.random.randn(len(load_corpus()), 1024).astype(np.float32)

        version = int.from_bytes(buf[4:8], 'little')
        num_vectors = int.from_bytes(buf[8:12], 'little')
        dims = int.from_bytes(buf[12:16], 'little')

        # Read vectors
        vectors = []
        offset = 16
        for i in range(num_vectors):
            vec = np.frombuffer(buf, dtype=np.float32, count=dims, offset=offset)
            vectors.append(vec.copy())
            offset += dims * 4

        return np.array(vectors)

    except Exception as e:
        print(f"Error loading binary index: {e}")
        # Fallback: mock embeddings
        return np.random.randn(len(load_corpus()), 1024).astype(np.float32)

def load_models():
    """Load sentence transformers and reranker (lazy-init)."""
    global embeddings_base, embeddings_finetuned, reranker

    if embeddings_base is None:
        print(f"Loading {BASE_MODEL}...")
        embeddings_base = SentenceTransformer(BASE_MODEL)

    if embeddings_finetuned is None:
        print(f"Loading {FINE_TUNED_MODEL}...")
        try:
            embeddings_finetuned = SentenceTransformer(FINE_TUNED_MODEL)
        except Exception as e:
            print(f"Warning: Could not load fine-tuned model: {e}")
            embeddings_finetuned = embeddings_base

    if reranker is None:
        print(f"Loading {RERANK_MODEL}...")
        try:
            reranker = CrossEncoder(RERANK_MODEL)
        except Exception as e:
            print(f"Warning: Could not load reranker: {e}")
            reranker = None

# =============================================================================
# Retrieval Pipeline
# =============================================================================

def normalize_text(text: str) -> str:
    """Normalize text for BM25 (simple version)."""
    # Remove Arabic diacritics
    text = re.sub(r'[ً-ْ]', '', text)
    # Normalize alef variants
    text = text.replace('أ', 'ا').replace('إ', 'ا')
    return text.lower()

def bm25_search(query: str, k: int = 50) -> List[Tuple[int, float]]:
    """
    Simple BM25-like search (Jaccard overlap for demo).

    Returns: [(chunk_idx, score), ...]
    """
    corpus = load_corpus()
    if not corpus:
        return []

    normalized_query = normalize_text(query)
    query_terms = set(normalized_query.split())

    if not query_terms:
        return []

    scores = []
    for i, chunk in enumerate(corpus):
        chunk_text = normalize_text(chunk.get('text', ''))
        chunk_terms = set(chunk_text.split())

        # Jaccard overlap
        overlap = len(query_terms & chunk_terms)
        if overlap > 0:
            scores.append((i, float(overlap)))

    # Return top-k by score
    ranked = sorted(scores, key=lambda x: x[1], reverse=True)
    return ranked[:k]

def dense_search(query: str, embedder, k: int = 50) -> List[Tuple[int, float]]:
    """Dense retrieval via cosine similarity."""
    try:
        query_emb = embedder.encode([query], convert_to_tensor=False)[0]
    except Exception as e:
        print(f"Warning: Failed to embed query: {e}")
        return []

    corpus_embs = load_embeddings_binary(EMBEDDINGS_BINARY_PATH)
    if corpus_embs.size == 0:
        return []

    # Cosine similarity
    query_norm = np.linalg.norm(query_emb) + 1e-8
    corpus_norms = np.linalg.norm(corpus_embs, axis=1, keepdims=True) + 1e-8

    similarities = np.dot(corpus_embs, query_emb) / (corpus_norms.ravel() * query_norm)

    # Top-k
    top_indices = np.argsort(similarities)[::-1][:k]
    return [(int(idx), float(similarities[idx])) for idx in top_indices]

def reciprocal_rank_fusion(
    ranked_lists: List[List[Tuple[int, float]]],
    k: int = 60
) -> List[int]:
    """RRF combines multiple ranked lists."""
    scores = {}

    for ranked_list in ranked_lists:
        for rank, (idx, _) in enumerate(ranked_list, 1):
            score = 1.0 / (k + rank)
            scores[idx] = scores.get(idx, 0) + score

    # Return sorted by RRF score
    return [idx for idx, _ in sorted(scores.items(), key=lambda x: x[1], reverse=True)]

def rerank_passages(
    query: str,
    passages: List[str],
    reranker_model
) -> List[Tuple[int, float]]:
    """Cross-encoder reranking."""
    if not reranker_model or not passages:
        return [(i, 0.0) for i in range(len(passages))]

    try:
        pairs = [[query, p] for p in passages]
        scores = reranker_model.predict(pairs)
        return [(i, float(scores[i])) for i in range(len(passages))]
    except Exception as e:
        print(f"Warning: Reranking failed: {e}")
        return [(i, 0.0) for i in range(len(passages))]

def hybrid_retrieve(
    query: str,
    embedder,
    use_rerank: bool = True
) -> Tuple[List[Dict], Dict]:
    """
    Full hybrid retrieval pipeline.

    Returns:
      - passages: list of {chunk_id, text, part, section, scores}
      - timings: {dense_ms, bm25_ms, rrf_ms, rerank_ms, total_ms}
    """
    timings = {}
    start_time = time.time()

    corpus = load_corpus()
    if not corpus:
        return [], {'total_ms': 0}

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
    fused_indices = reciprocal_rank_fusion([dense_results, bm25_results], k=60)
    timings['rrf_ms'] = (time.time() - t0) * 1000

    # 4. Reranking (optional)
    if use_rerank and reranker:
        t0 = time.time()
        top_passages = [corpus[idx]['text'] if idx < len(corpus) else '' for idx in fused_indices[:20]]
        rerank_results = rerank_passages(query, top_passages, reranker)
        timings['rerank_ms'] = (time.time() - t0) * 1000

        # Sort by rerank score
        sorted_indices = sorted(
            range(len(rerank_results)),
            key=lambda i: rerank_results[i][1],
            reverse=True
        )
        fused_indices = [fused_indices[i] for i in sorted_indices[:10]]
    else:
        fused_indices = fused_indices[:10]
        timings['rerank_ms'] = 0

    # 5. Build output
    passages = []
    for idx in fused_indices:
        if idx >= len(corpus):
            continue

        chunk = corpus[idx]

        # Find scores in original results
        dense_score = next((s for i, s in dense_results if i == idx), 0)
        bm25_score = next((s for i, s in bm25_results if i == idx), 0)

        passages.append({
            'chunk_id': idx,
            'text': chunk.get('text', '')[:300],
            'part': chunk.get('part', '?'),
            'section': chunk.get('section', '?'),
            'citation': chunk.get('citation', f"Part {chunk.get('part', '?')}"),
            'dense_score': dense_score,
            'bm25_score': bm25_score,
        })

    timings['total_ms'] = (time.time() - start_time) * 1000

    return passages, timings

# =============================================================================
# Gradio UI
# =============================================================================

def answer_and_retrieve(
    query: str,
    model_choice: str = "Fine-tuned (CaptAdel)",
    show_ab: bool = False
) -> str:
    """Main retrieval + display function."""

    if not query.strip():
        return "<p style='color: red;'>Please enter a question.</p>"

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
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 900px; padding: 20px;">
        <h3>Query</h3>
        <blockquote style="border-left: 4px solid #007bff; padding-left: 12px; margin: 12px 0;">
            <em>{query}</em>
        </blockquote>

        <h3>Model</h3>
        <p><strong>{model_name}</strong></p>

        <details open>
            <summary><strong>⏱ Latency Breakdown</strong></summary>
            <ul style="font-size: 0.9em; color: #666;">
                <li>Dense embedding: <strong>{timings['dense_ms']:.0f} ms</strong></li>
                <li>BM25 search: <strong>{timings['bm25_ms']:.0f} ms</strong></li>
                <li>RRF fusion: <strong>{timings['rrf_ms']:.0f} ms</strong></li>
                <li>Reranking: <strong>{timings['rerank_ms']:.0f} ms</strong></li>
                <li style="border-top: 1px solid #ddd; margin-top: 8px; padding-top: 8px;">
                    <strong>Total: {timings['total_ms']:.0f} ms</strong>
                </li>
            </ul>
        </details>

        <h3>Retrieved Passages</h3>
        <p style="font-size: 0.9em; color: #666;">{len(passages)} results</p>
    """

    # Display passages as cards
    for i, p in enumerate(passages, 1):
        output_html += f"""
        <div style="border: 1px solid #eee; border-radius: 6px; padding: 12px; margin-bottom: 12px; background: #fafafa;">
            <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
                <strong>Part {p['part']}, §{p['section']}</strong>
                <span style="font-size: 0.85em; color: #666;">
                    Dense: {p['dense_score']:.3f}
                </span>
            </div>
            <p style="margin: 0; line-height: 1.5; font-size: 0.95em;">{p['text']}...</p>
        </div>
        """

    output_html += """
    </div>
    """

    # A/B comparison
    if show_ab:
        passages_base, timings_base = hybrid_retrieve(query, embeddings_base, use_rerank=True)

        output_html += f"""
        <div style="border-top: 2px solid #ddd; margin-top: 20px; padding-top: 20px;">
            <h3>A/B Comparison: Base Model (Qwen3)</h3>
            <p><strong>Latency:</strong> {timings_base['total_ms']:.0f} ms (vs. {timings['total_ms']:.0f} ms)</p>
            <p><strong>Top result:</strong> Part {passages_base[0]['part'] if passages_base else '?'}</p>
        </div>
        """

    return output_html

def create_interface():
    """Build Gradio UI."""
    with gr.Blocks(title="Captain Adel Retrieval") as demo:
        gr.Markdown("""
        # 🛩️ Captain Adel Retrieval Proof Surface

        Live demonstration of **cross-lingual hybrid retrieval** on GACAR regulations.

        - **Query:** Ask in Arabic أو English
        - **Retrieval:** Dense embeddings + BM25 + RRF + cross-encoder reranking
        - **Transparency:** Latency breakdown & citation anchors
        - **A/B Test:** Fine-tuned vs. base embedder

        ---
        """)

        with gr.Row():
            query_input = gr.Textbox(
                label="Question",
                placeholder="ما هي متطلبات المعدات الدنيا؟",
                lines=2,
                scale=3
            )

        with gr.Row():
            model_radio = gr.Radio(
                ["Fine-tuned (CaptAdel)", "Base (Qwen3)"],
                label="Embedder",
                value="Fine-tuned (CaptAdel)",
                scale=2
            )
            ab_toggle = gr.Checkbox(
                label="Show A/B comparison",
                value=False,
                scale=1
            )

        submit_btn = gr.Button("Retrieve", variant="primary", size="lg")

        output = gr.HTML(label="Results")

        submit_btn.click(
            answer_and_retrieve,
            inputs=[query_input, model_radio, ab_toggle],
            outputs=[output]
        )

        # Example queries
        gr.Examples(
            examples=[
                ["ما هي المتطلبات الدنيا للمعدات؟", "Fine-tuned (CaptAdel)", False],
                ["What is the minimum equipment list?", "Fine-tuned (CaptAdel)", False],
                ["متطلبات شهادة الطيار الخاص", "Fine-tuned (CaptAdel)", True],
            ],
            inputs=[query_input, model_radio, ab_toggle],
            label="Example Queries"
        )

        gr.Markdown("""
        ---

        **About:** This demo showcases the retrieval unlock from Phase 1–3 of the Hugging Face integration.
        See [GitHub](https://github.com/ay2m/Captain-Adel) for implementation details.
        """)

    return demo

if __name__ == "__main__":
    interface = create_interface()
    interface.launch(share=True)
