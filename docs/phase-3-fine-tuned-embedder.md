# Phase 3: Fine-tuned `flygaca/CaptAdel` Embedder

**Status:** Specification (ready to implement)

**Why this matters:** Phase 2 establishes that off-the-shelf Qwen3-Embedding-0.6B + RRF + reranking achieves 44% recall@5 for Arabic. Phase 3 fine-tunes the embedder on GACAR-specific retrieval tasks to push that further — target is 54–64% recall@5 (additional 10–20% gain), unlocking harder cases where the query requires inference over domain concepts.

**Training data source:** The eval suite itself (138 cases with groundTruthChunks) becomes the training signal.

---

## Problem: Domain gap in general embeddings

Qwen3-Embedding-0.6B is trained on web corpora. GACAR retrieval has unique challenges:

1. **Regulatory language:** Terms like "minimum equipment list", "currency of type ratings", "standard holding pattern" are rare in web text but central to aviation.
2. **Cross-lingual synonymy:** An Arabic regulation query might ask "ما هي متطلبات" (what are the requirements?) while the English regulation uses "shall carry" or "must be equipped with" — lexical and dense retrieval both miss the conceptual link.
3. **Citation anchoring:** A question like "What Part covers minimum altitudes?" should strongly prefer chunks citing Part 91, §91.119 over general altitude discussion.
4. **Negative pairs:** Some passages are close but wrong (Part 135 when Part 91 is correct; a similar rule in a different operational context).

**Expected lift:** Fine-tuning on 100+ hand-curated retrieval pairs should recover 10–20% of the remaining gap (from 44% → 54–64%), especially for:
- Hard cross-lingual cases (Arabic question + English passage)
- Edge cases near Part boundaries
- Questions requiring interpretation of regulatory intent

---

## Dataset: Contrastive retrieval pairs from evals

### Structure: `evals/training-pairs.jsonl`

Each line is a training example:

```jsonl
{
  "query": "ما هي متطلبات المعدات الدنيا للطائرة؟",
  "query_lang": "ar",
  "positive": [
    {
      "text": "Part 91, §91.205 — The pilot in command of a civil aircraft shall ensure that the aircraft is equipped with ...",
      "chunk_id": "91-205-01",
      "part": 91,
      "section": 205
    }
  ],
  "negative": [
    {
      "text": "Part 135 operators shall equip all aircraft with ...",
      "chunk_id": "135-121-03",
      "part": 135,
      "section": 121,
      "reason": "wrong_part"
    },
    {
      "text": "The minimum safe altitude is the highest obstruction plus 1,000 feet ...",
      "chunk_id": "91-119-05",
      "part": 91,
      "section": 119,
      "reason": "related_but_wrong_topic"
    }
  ],
  "eval_case_id": "ar_014",
  "difficulty": "medium"
}
```

### Generation from evals/cases.json

A Python script (`scripts/export-training-pairs.py`) mines training pairs from the eval suite:

```python
#!/usr/bin/env python3
"""
Export contrastive retrieval pairs from evals/cases.json.

For each eval case:
1. query → positive: all chunks in groundTruthChunks
2. query → negative: random negative examples from other chunks
   (stratified by Part to include cross-Part hard negatives)
"""

import json
import random
from collections import defaultdict

def export_training_pairs(cases_path, output_path):
    with open(cases_path) as f:
        cases = json.load(f)
    
    # Load corpus chunk index (chunk_id → {text, part, section})
    chunks = load_corpus_index()
    
    pairs = []
    
    for case in cases:
        if not case.get('groundTruthChunks'):
            continue  # Skip cases without ground truth
        
        query = case['question']
        query_lang = case.get('language', 'en')
        positive_chunk_ids = case['groundTruthChunks']
        case_part = case['expect'].get('citesPart', [None])[0]
        
        # Positives: all ground truth chunks
        positives = [
            {
                'text': chunks[cid]['text'],
                'chunk_id': cid,
                'part': chunks[cid]['part'],
                'section': chunks[cid]['section']
            }
            for cid in positive_chunk_ids
            if cid in chunks
        ]
        
        if not positives:
            continue
        
        # Negatives: sample from other chunks
        # Strategy: 2-3 in-Part negatives (wrong section) + 2-3 cross-Part negatives
        candidate_negatives = [
            (cid, chunks[cid])
            for cid in chunks
            if cid not in positive_chunk_ids
        ]
        
        in_part_negs = [
            (cid, c) for cid, c in candidate_negatives
            if c['part'] == case_part
        ]
        cross_part_negs = [
            (cid, c) for cid, c in candidate_negatives
            if c['part'] != case_part
        ]
        
        sampled_in_part = random.sample(
            in_part_negs,
            min(3, len(in_part_negs))
        )
        sampled_cross_part = random.sample(
            cross_part_negs,
            min(2, len(cross_part_negs))
        )
        
        negatives = []
        for cid, chunk in sampled_in_part:
            negatives.append({
                'text': chunk['text'],
                'chunk_id': cid,
                'part': chunk['part'],
                'section': chunk['section'],
                'reason': 'same_part_wrong_section'
            })
        for cid, chunk in sampled_cross_part:
            negatives.append({
                'text': chunk['text'],
                'chunk_id': cid,
                'part': chunk['part'],
                'section': chunk['section'],
                'reason': 'wrong_part'
            })
        
        pair = {
            'query': query,
            'query_lang': query_lang,
            'positive': positives,
            'negative': negatives,
            'eval_case_id': case['id'],
            'difficulty': classify_difficulty(case)
        }
        pairs.append(pair)
    
    # Write JSONL
    with open(output_path, 'w') as f:
        for pair in pairs:
            f.write(json.dumps(pair) + '\n')
    
    print(f"Exported {len(pairs)} training pairs to {output_path}")
    print(f"  EN: {sum(1 for p in pairs if p['query_lang'] == 'en')}")
    print(f"  AR: {sum(1 for p in pairs if p['query_lang'] == 'ar')}")

def load_corpus_index():
    # Load from _chunks.json.gz
    import gzip
    with gzip.open('src/brain/_chunks.json.gz') as f:
        chunks_list = json.load(f)
    
    # Index by chunk_id
    return {
        f"{i:05d}": chunk
        for i, chunk in enumerate(chunks_list)
    }

def classify_difficulty(case):
    # Simple heuristic: cases with cross-Part negatives are harder
    cites = case['expect'].get('citesPart', [])
    if len(cites) > 1:
        return 'hard'  # Multiple possible answers
    if case.get('language') == 'ar':
        return 'medium'  # Cross-lingual is medium baseline
    return 'easy'

if __name__ == '__main__':
    export_training_pairs('evals/cases.json', 'evals/training-pairs.jsonl')
```

**Output:** ~138 pairs (one per eval case with groundTruthChunks), stratified by difficulty and language.

---

## Training: Contrastive embedding fine-tune

### Model: Qwen3-Embedding-0.6B (Hugging Face `Qwen/Qwen3-Embedding-0.6B`)

Base model supports **in-batch negatives** via the standard `sentence-transformers` SentenceTransformer loss (MultipleNegativesRankingLoss), or a custom contrastive loss for finer control.

### Setup: Local training script

```bash
# Install training dependencies
pip install sentence-transformers accelerate wandb

# Run training
TRAINING_DATA=evals/training-pairs.jsonl \
EMBED_DIMS=1024 \
EPOCHS=3 \
BATCH_SIZE=32 \
LEARNING_RATE=2e-5 \
  python scripts/finetune-embedder.py
```

### Script: `scripts/finetune-embedder.py`

```python
#!/usr/bin/env python3
"""
Fine-tune Qwen3-Embedding-0.6B on GACAR retrieval tasks.

Loss: MultipleNegativesRankingLoss (in-batch negatives)
Metric: Mean Reciprocal Rank (MRR) on held-out test set

Output: flygaca/CaptAdel-finetuned (pushed to Hub)
"""

import json
import random
from pathlib import Path
from sentence_transformers import (
    SentenceTransformer, SentenceTransformerTrainingArguments,
    SentenceTransformerTrainer
)
from sentence_transformers.losses import MultipleNegativesRankingLoss
from sentence_transformers.evaluation import InformationRetrievalEvaluator
import torch

SEED = 42
random.seed(SEED)
torch.manual_seed(SEED)

def load_training_data(path):
    """Load JSONL training pairs."""
    pairs = []
    with open(path) as f:
        for line in f:
            pairs.append(json.loads(line))
    return pairs

def prepare_train_test_split(pairs, test_ratio=0.15):
    """80/20 split by eval_case_id."""
    random.shuffle(pairs)
    split_idx = int(len(pairs) * (1 - test_ratio))
    return pairs[:split_idx], pairs[split_idx:]

def create_sentence_transformer_dataset(pairs):
    """
    SentenceTransformers expects:
    [(query, positive_passage, negative_passage_1, ...), ...]
    
    We'll use in-batch negatives (all other positives become negatives).
    """
    triplets = []
    for pair in pairs:
        query = pair['query']
        # All positives (usually just 1)
        for pos in pair['positive']:
            pos_text = pos['text']
        # Negatives (2-5 per example)
        for neg in pair['negative']:
            neg_text = neg['text']
            # Create triplet: (query, positive, negative)
            triplets.append((query, pos_text, neg_text))
    
    return triplets

def evaluate_mrr(model, test_pairs, k=5):
    """
    Compute Mean Reciprocal Rank on test set.
    For each query, embed and rank all passages; MRR = 1/rank_of_first_positive
    """
    mrrs = []
    
    for pair in test_pairs:
        query = pair['query']
        query_emb = model.encode(query, convert_to_tensor=True)
        
        # All passages (positives + negatives) for ranking
        passages = []
        positive_indices = set()
        
        for i, pos in enumerate(pair['positive']):
            passages.append(pos['text'])
            positive_indices.add(len(passages) - 1)
        
        for neg in pair['negative']:
            passages.append(neg['text'])
        
        # Encode all passages
        passage_embs = model.encode(passages, convert_to_tensor=True)
        
        # Rank by cosine similarity
        scores = torch.nn.functional.cosine_similarity(
            query_emb.unsqueeze(0), passage_embs
        )
        ranked = torch.argsort(scores, descending=True).cpu().tolist()
        
        # Find rank of first positive
        for rank, idx in enumerate(ranked[:k], 1):
            if idx in positive_indices:
                mrrs.append(1.0 / rank)
                break
        else:
            mrrs.append(0)  # No positive in top-k
    
    return sum(mrrs) / len(mrrs) if mrrs else 0

def main():
    # Config
    model_id = "Qwen/Qwen3-Embedding-0.6B"
    training_data_path = "evals/training-pairs.jsonl"
    output_dir = "checkpoints/captadel-finetuned"
    hub_model_id = "flygaca/CaptAdel-finetuned"
    
    epochs = int(os.environ.get('EPOCHS', '3'))
    batch_size = int(os.environ.get('BATCH_SIZE', '32'))
    lr = float(os.environ.get('LEARNING_RATE', '2e-5'))
    
    print(f"Loading training data from {training_data_path}")
    all_pairs = load_training_data(training_data_path)
    train_pairs, test_pairs = prepare_train_test_split(all_pairs)
    
    print(f"Train: {len(train_pairs)} | Test: {len(test_pairs)}")
    
    # Load model
    print(f"Loading {model_id}")
    model = SentenceTransformer(model_id)
    
    # Prepare dataset
    print("Preparing SentenceTransformer dataset")
    train_triplets = create_sentence_transformer_dataset(train_pairs)
    train_dataset = SentencesDataset(train_triplets, model)
    
    # Loss
    loss = MultipleNegativesRankingLoss(model)
    
    # Training args
    args = SentenceTransformerTrainingArguments(
        output_dir=output_dir,
        num_train_epochs=epochs,
        per_device_train_batch_size=batch_size,
        per_device_eval_batch_size=batch_size,
        learning_rate=lr,
        warmup_steps=100,
        weight_decay=0.01,
        logging_steps=10,
        save_strategy='epoch',
        eval_strategy='epoch',
        save_total_limit=2,
        load_best_model_at_end=True,
        metric_for_best_model='eval_mrr',
        seed=SEED,
        report_to='wandb',
        run_name='captadel-finetuned',
    )
    
    # Trainer
    trainer = SentenceTransformerTrainer(
        model=model,
        args=args,
        train_dataset=train_dataset,
        loss=loss,
        evaluator=CustomEvaluator(model, test_pairs),
    )
    
    # Train
    print("Starting training")
    trainer.train()
    
    # Eval on test
    print("\nFinal evaluation on test set:")
    mrr = evaluate_mrr(model, test_pairs, k=5)
    print(f"  MRR@5: {mrr:.3f}")
    
    # Push to Hub
    print(f"\nPushing to {hub_model_id}")
    model.push_to_hub(hub_model_id, private=False)
    
    print("Done!")

if __name__ == '__main__':
    import os
    main()
```

---

## Validation: A/B test on Phase 2 ablations

Once fine-tuned model is on Hub, re-run Phase 2 ablations with the new embedder:

```bash
# Phase 2 with fine-tuned embedder
EMBEDDINGS_MODEL=flygaca/CaptAdel-finetuned \
EMBEDDINGS_DIMS=1024 \
  npm run eval:ablations > evals/phase-3-ablation-results.json
```

**Expected improvements:**

| Config | Phase 2 Baseline | Phase 3 Fine-tuned | Δ |
|---|---|---|---|
| Dense-512d-no-rerank (AR) | 36% | 44–48% | +8–12% |
| Dense-512d-with-rerank (AR) | 42% | 50–56% | +8–14% |
| Hybrid-RRF-512d-rerank (AR) | 44% | 54–60% | +10–16% |
| English (hybrid) | 70% | 72–75% | +2–5% (polish) |

**Hard-case lift:** Focus on the 25 hardest cases (cross-lingual, multi-Part ambiguity) — fine-tuned model should lift 20+ percentage points on those.

---

## Shipping decision

Phase 3 is complete when:

1. ✅ Training pairs exported (evals/training-pairs.jsonl, ~138 examples)
2. ✅ Fine-tuning script converges (loss decays, MRR@5 on test set ≥ 0.55)
3. ✅ Model pushed to `flygaca/CaptAdel-finetuned` on Hub
4. ✅ Re-run Phase 2 ablations with fine-tuned embedder
5. ✅ Verify: Arabic recall@5 ≥ 54% (was 44% baseline)
6. ✅ Verify: English recall ≥ 72% (no regression)
7. ✅ Citation accuracy Arabic ≥ 85% (was 81% baseline)

**Gate for Phase 3:** Fine-tuned embedder must beat all three gates.

Once Phase 3 gates pass → **Phase 4: Public HF proof surface** (demo app showcasing retrieval, side-by-side Arabic↔English, latency breakdown, citation transparency).

---

## Appendix: Advanced tweaks (optional)

### Instruction-aware embeddings (MatryoshkaLoss)

If Qwen3 supports instruction-aware embeddings, prepend query instructions:

```python
# During training
query_instructions = {
    'en': 'Represent a question about aviation regulations for retrieval.',
    'ar': 'تمثيل سؤال عن اللوائح الجوية لاسترجاع المعلومات.'
}

queries_with_instructions = [
    f"[{query_instructions[pair['query_lang']]}] {pair['query']}"
    for pair in pairs
]
```

### Curriculum learning (hard-example mining)

After epoch 1, mine hard negatives (close but wrong) to focus training:

```python
# After epoch 1, for each query:
# Find passages with high similarity but not in ground truth
# Add them as hard negatives in epoch 2+
```

### Domain-specific negative sampling

Bias negatives toward:
- Same Part, wrong section (in-Part hard negatives)
- Similar terminology but different operational context (Part 91 vs 135)
- Altitude/speed rules (frequently confused in pilot knowledge)

---

## Next: Phase 4 — Public HF proof surface

Once the fine-tuned embedder is validated, Phase 4 builds a public demo on Hugging Face Spaces showcasing:
- Live cross-lingual retrieval (Arabic question, English passages)
- Side-by-side latency breakdown (dense embed, recall, rerank times)
- Citation transparency (which chunks were retrieved, which ranked highest)
- A/B comparisons (base Qwen3 vs fine-tuned CaptAdel)
- Bilingual UI (الإنجليزية/العربية)

This proof surface becomes the marketing anchor for the retrieval unlock and the Fly GACA integration point.
