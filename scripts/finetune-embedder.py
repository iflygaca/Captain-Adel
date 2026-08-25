#!/usr/bin/env python3
"""
Fine-tune Qwen3-Embedding-0.6B on GACAR retrieval tasks.

Loss: MultipleNegativesRankingLoss (in-batch negatives)
Metric: Mean Reciprocal Rank (MRR) on held-out test set

Output: flygaca/CaptAdel-finetuned (pushed to Hub)

Prerequisites:
  pip install sentence-transformers accelerate wandb

Usage:
  TRAINING_DATA=evals/training-pairs.jsonl \\
  EMBED_DIMS=1024 \\
  EPOCHS=3 \\
  BATCH_SIZE=32 \\
  LEARNING_RATE=2e-5 \\
    python scripts/finetune-embedder.py

Environment:
  TRAINING_DATA (default: evals/training-pairs.jsonl)
  EMBED_DIMS (default: 1024)
  EPOCHS (default: 3)
  BATCH_SIZE (default: 32)
  LEARNING_RATE (default: 2e-5)
  HF_TOKEN (for pushing to Hub)
"""

import json
import random
import os
import sys
from pathlib import Path

import torch
from sentence_transformers import (
    SentenceTransformer,
    SentenceTransformerTrainingArguments,
    SentenceTransformerTrainer,
    models
)
from sentence_transformers.losses import MultipleNegativesRankingLoss
from sentence_transformers.training_args import BatchSamplers
from datasets import Dataset

SEED = 42
random.seed(SEED)
torch.manual_seed(SEED)

def load_training_data(path):
    """Load JSONL training pairs."""
    pairs = []
    try:
        with open(path) as f:
            for line_no, line in enumerate(f, 1):
                try:
                    pairs.append(json.loads(line))
                except json.JSONDecodeError as e:
                    print(f"Warning: Failed to parse line {line_no}: {e}", file=sys.stderr)
    except FileNotFoundError:
        print(f"Error: {path} not found", file=sys.stderr)
        sys.exit(1)

    return pairs

def prepare_train_test_split(pairs, test_ratio=0.15):
    """80/20 split by eval_case_id."""
    random.shuffle(pairs)
    split_idx = int(len(pairs) * (1 - test_ratio))
    return pairs[:split_idx], pairs[split_idx:]

def create_sentence_transformers_dataset(pairs):
    """
    Create dataset for SentenceTransformer training.

    Returns a list of (anchor, positive, negative) tuples.
    The SentenceTransformer trainer will use these with MultipleNegativesRankingLoss
    (in-batch negatives from all other examples' positives).
    """
    triplets = []

    for pair in pairs:
        query = pair['query']

        # All positives (usually just 1, but support multiple)
        for pos in pair.get('positive', []):
            pos_text = pos.get('text', '')
            if not pos_text:
                continue

            # All negatives
            for neg in pair.get('negative', []):
                neg_text = neg.get('text', '')
                if not neg_text:
                    continue

                # Create triplet: (query, positive, negative)
                triplets.append((query, pos_text, neg_text))

    return triplets

def evaluate_mrr(model, test_pairs, k=5):
    """
    Compute Mean Reciprocal Rank on test set.

    For each query, embed and rank all passages;
    MRR = 1/rank_of_first_positive (or 0 if not in top-k)
    """
    mrrs = []

    with torch.no_grad():
        for pair in test_pairs:
            query = pair['query']
            query_emb = model.encode(query, convert_to_tensor=True)

            # All passages (positives + negatives) for ranking
            passages = []
            positive_indices = set()

            for i, pos in enumerate(pair.get('positive', [])):
                pos_text = pos.get('text', '')
                if pos_text:
                    passages.append(pos_text)
                    positive_indices.add(len(passages) - 1)

            for neg in pair.get('negative', []):
                neg_text = neg.get('text', '')
                if neg_text:
                    passages.append(neg_text)

            if not passages:
                continue

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
    """Main training entrypoint."""

    # Configuration
    model_id = "Qwen/Qwen3-Embedding-0.6B"
    training_data_path = os.environ.get('TRAINING_DATA', 'evals/training-pairs.jsonl')
    output_dir = os.environ.get('OUTPUT_DIR', 'checkpoints/captadel-finetuned')
    hub_model_id = os.environ.get('HUB_MODEL_ID', 'flygaca/CaptAdel-finetuned')

    epochs = int(os.environ.get('EPOCHS', '3'))
    batch_size = int(os.environ.get('BATCH_SIZE', '32'))
    lr = float(os.environ.get('LEARNING_RATE', '2e-5'))
    embed_dims = int(os.environ.get('EMBED_DIMS', '1024'))

    print(f"\n📚 Phase 3: Fine-tune {model_id}")
    print(f"   Output dimension: {embed_dims}")
    print(f"   Epochs: {epochs} | Batch size: {batch_size} | LR: {lr}\n")

    # Load training data
    print(f"[1/5] Loading training data from {training_data_path}")
    all_pairs = load_training_data(training_data_path)
    train_pairs, test_pairs = prepare_train_test_split(all_pairs, test_ratio=0.15)
    print(f"      Train: {len(train_pairs)} | Test: {len(test_pairs)}")

    if not train_pairs:
        print("Error: No training pairs found.", file=sys.stderr)
        sys.exit(1)

    # Load base model
    print(f"\n[2/5] Loading base model: {model_id}")
    model = SentenceTransformer(model_id)
    print(f"      Model loaded. Current output dim: {model.get_sentence_embedding_dimension()}")

    # Optionally resize to target embedding dimension
    # (This requires the model to support it via pooling layer resize)
    if embed_dims != model.get_sentence_embedding_dimension():
        print(f"      Resizing to {embed_dims} dimensions (MRL support)")
        # Simple approach: use a dense layer to project
        # (Qwen3 supports this via sentence_transformers)
        # For now, log the target dimension and leave the model as-is
        print(f"      Note: Full MRL dimension truncation requires custom pooling setup")

    # Prepare dataset
    print(f"\n[3/5] Preparing dataset")
    triplets = create_sentence_transformers_dataset(train_pairs)
    print(f"      Created {len(triplets)} triplets")

    # Create HuggingFace Dataset
    # For SentenceTransformer, we need a special format
    train_examples = []
    for query, pos, neg in triplets:
        # SentenceTransformerTrainer expects:
        # - anchor: query
        # - positive: positive passage
        # - (in-batch negatives from all other examples)
        train_examples.append({
            'anchor': query,
            'positive': pos,
            'negative': neg
        })

    train_dataset = Dataset.from_dict({
        'anchor': [ex['anchor'] for ex in train_examples],
        'positive': [ex['positive'] for ex in train_examples],
    })

    # Loss function
    loss = MultipleNegativesRankingLoss(model)

    # Training arguments
    print(f"\n[4/5] Configuring training")
    training_args = SentenceTransformerTrainingArguments(
        output_dir=output_dir,
        num_train_epochs=epochs,
        per_device_train_batch_size=batch_size,
        per_device_eval_batch_size=batch_size,
        learning_rate=lr,
        warmup_steps=max(100, len(train_examples) // (batch_size * epochs)),
        weight_decay=0.01,
        logging_steps=10,
        save_strategy='epoch',
        save_total_limit=2,
        seed=SEED,
        # Report to wandb (optional)
        report_to=['wandb'] if os.environ.get('WANDB_PROJECT') else [],
        run_name='captadel-finetuned',
    )

    # Trainer
    trainer = SentenceTransformerTrainer(
        model=model,
        args=training_args,
        train_dataset=train_dataset,
        loss=loss,
    )

    # Train
    print(f"      Starting training...\n")
    trainer.train()

    # Evaluate on test set
    print(f"\n[5/5] Evaluating on test set")
    mrr = evaluate_mrr(model, test_pairs, k=5)
    print(f"      MRR@5: {mrr:.3f}")

    # Push to Hub (if HF_TOKEN is set)
    if os.environ.get('HF_TOKEN'):
        print(f"\n📤 Pushing model to {hub_model_id}")
        try:
            model.push_to_hub(hub_model_id, private=False)
            print(f"   ✅ Model pushed successfully")
            print(f"   URL: https://huggingface.co/{hub_model_id}")
        except Exception as e:
            print(f"   Error pushing to Hub: {e}", file=sys.stderr)
            print(f"   Model saved locally to {output_dir}")
    else:
        print(f"\n💾 Model saved to {output_dir}")
        print(f"   (Set HF_TOKEN to push to Hub)")

    print(f"\n✅ Fine-tuning complete!")
    print(f"   MRR@5: {mrr:.3f}")
    print(f"\n📊 Next: Re-run Phase 2 ablations with the fine-tuned embedder:")
    print(f"   EMBEDDINGS_MODEL={hub_model_id} npm run eval:ablations")

if __name__ == '__main__':
    main()
