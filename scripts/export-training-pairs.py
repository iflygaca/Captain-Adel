#!/usr/bin/env python3
"""
Export contrastive retrieval pairs from evals/cases.json.

For each eval case with groundTruthChunks:
1. query → positive: all chunks in groundTruthChunks
2. query → negative: random negative examples from other chunks
   (stratified by Part to include cross-Part hard negatives)

Output: evals/training-pairs.jsonl (one pair per line)

Usage:
  python scripts/export-training-pairs.py

Environment:
  CASES_PATH (default: evals/cases.json)
  OUTPUT_PATH (default: evals/training-pairs.jsonl)
"""

import json
import gzip
import random
import os
import sys
from pathlib import Path
from collections import defaultdict

SEED = 42
random.seed(SEED)

def load_cases(path):
    """Load eval cases from JSON file."""
    with open(path) as f:
        data = json.load(f)
    # Handle both direct array and {"cases": [...]} wrapper
    return data if isinstance(data, list) else data.get('cases', [])

def load_corpus_chunks():
    """
    Load corpus chunks from _chunks.json.gz.
    Returns: dict mapping chunk_id (str) -> {text, part, section, ...}
    """
    chunks_path = 'src/brain/_chunks.json.gz'
    if not os.path.exists(chunks_path):
        print(f"Error: {chunks_path} not found", file=sys.stderr)
        return {}

    try:
        with gzip.open(chunks_path, 'rt', encoding='utf-8') as f:
            chunks_list = json.load(f)
    except Exception as e:
        print(f"Error loading corpus: {e}", file=sys.stderr)
        return {}

    # Index by chunk_id (zero-padded index)
    chunks = {}
    for i, chunk in enumerate(chunks_list):
        chunk_id = f"{i:05d}"
        chunks[chunk_id] = {
            'text': chunk.get('text', ''),
            'part': chunk.get('part'),
            'section': chunk.get('section'),
            'citation': chunk.get('citation', ''),
            'chunk_index': i
        }

    return chunks

def classify_difficulty(case, chunks):
    """Classify case difficulty for training stratification."""
    cites = case.get('expect', {}).get('citesPart', [])

    # Hard: multiple possible Parts, or cross-lingual
    if len(cites) > 1:
        return 'hard'

    # Cross-lingual is medium baseline
    if case.get('language', 'en') == 'ar' or case.get('lang') == 'ar':
        return 'medium'

    # Easy: simple English cases
    return 'easy'

def export_training_pairs(cases_path='evals/cases.json', output_path='evals/training-pairs.jsonl'):
    """Main export function."""

    print(f"Loading eval cases from {cases_path}")
    cases = load_cases(cases_path)
    print(f"Loaded {len(cases)} cases")

    print(f"Loading corpus chunks...")
    chunks = load_corpus_chunks()
    print(f"Loaded {len(chunks)} chunks")

    if not chunks:
        print("Error: No chunks loaded. Exiting.", file=sys.stderr)
        return

    # Filter cases with groundTruthChunks
    cases_with_gt = [
        c for c in cases
        if c.get('groundTruthChunks') and len(c.get('groundTruthChunks', [])) > 0
    ]

    print(f"Cases with groundTruthChunks: {len(cases_with_gt)} / {len(cases)}")

    if not cases_with_gt:
        print(f"Warning: No cases with groundTruthChunks found.", file=sys.stderr)
        print(f"Training data would be empty. Creating placeholder with zero pairs.", file=sys.stderr)

    # Group chunks by Part for stratified negative sampling
    chunks_by_part = defaultdict(list)
    for chunk_id, chunk in chunks.items():
        part = chunk.get('part')
        if part:
            chunks_by_part[part].append(chunk_id)

    pairs = []

    for case in cases_with_gt:
        query = case.get('question', '').strip()
        if not query:
            continue

        query_lang = case.get('language') or case.get('lang') or 'en'
        case_parts = case.get('expect', {}).get('citesPart', [])
        case_part = case_parts[0] if case_parts else None
        positive_chunk_ids = case.get('groundTruthChunks', [])

        # Skip if no positives or positive chunks not in corpus
        positives = []
        for cid in positive_chunk_ids:
            cid_str = str(cid)
            if cid_str in chunks:
                chunk = chunks[cid_str]
                positives.append({
                    'text': chunk['text'],
                    'chunk_id': cid_str,
                    'part': chunk['part'],
                    'section': chunk['section'],
                    'citation': chunk.get('citation', '')
                })

        if not positives:
            continue

        # Negatives: stratified sampling
        # - 2-3 in-Part negatives (wrong section)
        # - 2-3 cross-Part negatives
        positive_set = set(str(c) for c in positive_chunk_ids)

        # In-Part negatives
        in_part_candidates = [
            cid for cid in chunks_by_part.get(case_part, [])
            if cid not in positive_set
        ]
        sampled_in_part = random.sample(
            in_part_candidates,
            min(3, len(in_part_candidates))
        )

        # Cross-Part negatives
        cross_part_candidates = [
            cid for part, chunk_ids in chunks_by_part.items()
            if part != case_part
            for cid in chunk_ids
            if cid not in positive_set
        ]
        sampled_cross_part = random.sample(
            cross_part_candidates,
            min(2, len(cross_part_candidates))
        )

        negatives = []
        for cid in sampled_in_part:
            chunk = chunks[cid]
            negatives.append({
                'text': chunk['text'],
                'chunk_id': cid,
                'part': chunk['part'],
                'section': chunk['section'],
                'reason': 'same_part_wrong_section'
            })

        for cid in sampled_cross_part:
            chunk = chunks[cid]
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
            'eval_case_id': case.get('id', ''),
            'difficulty': classify_difficulty(case, chunks)
        }
        pairs.append(pair)

    # Write JSONL
    print(f"Writing {len(pairs)} training pairs to {output_path}")
    with open(output_path, 'w') as f:
        for pair in pairs:
            f.write(json.dumps(pair, ensure_ascii=False) + '\n')

    # Statistics
    en_count = sum(1 for p in pairs if p['query_lang'] == 'en')
    ar_count = sum(1 for p in pairs if p['query_lang'] == 'ar')
    easy = sum(1 for p in pairs if p['difficulty'] == 'easy')
    medium = sum(1 for p in pairs if p['difficulty'] == 'medium')
    hard = sum(1 for p in pairs if p['difficulty'] == 'hard')

    print(f"\n✅ Exported {len(pairs)} training pairs")
    print(f"   EN: {en_count} | AR: {ar_count}")
    print(f"   Easy: {easy} | Medium: {medium} | Hard: {hard}")
    print(f"   Output: {output_path}")

if __name__ == '__main__':
    cases_path = os.environ.get('CASES_PATH', 'evals/cases.json')
    output_path = os.environ.get('OUTPUT_PATH', 'evals/training-pairs.jsonl')

    export_training_pairs(cases_path, output_path)
