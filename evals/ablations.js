'use strict';

/**
 * Ablation study: Compare retrieval configurations (Phase 2).
 *
 * Tests 6 configurations to measure:
 * - Impact of dense retrieval (recall@5 improvement)
 * - Dimension truncation trade-offs (1024-d vs 512-d vs 256-d)
 * - Reranker benefit (gte-multilingual-reranker-base)
 * - Full hybrid (BM25 + dense + RRF + rerank)
 */

const ABLATIONS = [
  {
    name: 'bm25-only',
    description: 'Baseline: BM25 lexical search only',
    env: {
      EMBEDDINGS_BASE_URL: '',
      EMBEDDINGS_QUERY_BASE_URL: '',
      RERANK_BASE_URL: '',
    },
  },
  {
    name: 'dense-1024d-no-rerank',
    description: 'Dense 1024-d (full MRL dimension)',
    env: {
      EMBEDDINGS_BASE_URL: 'http://localhost:8000',
      EMBEDDINGS_MODEL: 'Qwen/Qwen3-Embedding-0.6B',
      EMBED_DIMS: '1024',
      RERANK_BASE_URL: '',
    },
  },
  {
    name: 'dense-512d-no-rerank',
    description: 'Dense 512-d (MRL truncated, saves 50% memory)',
    env: {
      EMBEDDINGS_BASE_URL: 'http://localhost:8000',
      EMBEDDINGS_MODEL: 'Qwen/Qwen3-Embedding-0.6B',
      EMBED_DIMS: '512',
      RERANK_BASE_URL: '',
    },
  },
  {
    name: 'dense-256d-no-rerank',
    description: 'Dense 256-d (extreme truncation, minimal memory)',
    env: {
      EMBEDDINGS_BASE_URL: 'http://localhost:8000',
      EMBEDDINGS_MODEL: 'Qwen/Qwen3-Embedding-0.6B',
      EMBED_DIMS: '256',
      RERANK_BASE_URL: '',
    },
  },
  {
    name: 'dense-512d-with-rerank',
    description: 'Dense 512-d + gte-multilingual-reranker-base',
    env: {
      EMBEDDINGS_BASE_URL: 'http://localhost:8000',
      EMBEDDINGS_MODEL: 'Qwen/Qwen3-Embedding-0.6B',
      EMBED_DIMS: '512',
      RERANK_BASE_URL: 'http://localhost:8001',
      RERANK_MODEL: 'Alibaba-NLP/gte-multilingual-reranker-base',
    },
  },
  {
    name: 'hybrid-rrf-512d-rerank',
    description: 'Full hybrid: BM25 + dense(512-d) + RRF + rerank',
    env: {
      EMBEDDINGS_BASE_URL: 'http://localhost:8000',
      EMBEDDINGS_MODEL: 'Qwen/Qwen3-Embedding-0.6B',
      EMBED_DIMS: '512',
      RERANK_BASE_URL: 'http://localhost:8001',
      RERANK_MODEL: 'Alibaba-NLP/gte-multilingual-reranker-base',
    },
  },
];

/**
 * Run eval suite across all ablation configurations.
 * Requires embeddings and rerank endpoints to be running.
 *
 * Usage: npm run eval -- --phase2-ablations
 *
 * Prerequisites:
 *   - http://localhost:8000: Embeddings endpoint (TEI or vLLM with BGE-M3)
 *   - http://localhost:8001: Reranker endpoint (TEI or Infinity)
 *   - GEMINI_API_KEY: For agentic loop eval
 */
async function runAblations() {
  const results = {};

  for (const ablation of ABLATIONS) {
    console.log(`\n📊 Testing: ${ablation.name}`);
    console.log(`   ${ablation.description}`);

    // Set env vars for this ablation
    const savedEnv = {};
    for (const [key, val] of Object.entries(ablation.env)) {
      savedEnv[key] = process.env[key];
      if (val === '') {
        delete process.env[key];
      } else {
        process.env[key] = val;
      }
    }

    try {
      // Note: Actual eval runner will be called here
      // For now, this is a placeholder framework
      console.log(`   (Eval execution would run here with env: ${JSON.stringify(ablation.env)})`);
      results[ablation.name] = {
        status: 'not-run',
        message: 'Phase 2 ablations require embeddings endpoints to be configured',
      };
    } finally {
      // Restore env
      for (const [key, val] of Object.entries(savedEnv)) {
        if (val === undefined) {
          delete process.env[key];
        } else {
          process.env[key] = val;
        }
      }
    }
  }

  return results;
}

/**
 * Generate human-readable markdown report from ablation results.
 */
function generateAblationReport(results) {
  let report = '# Phase 2: Retrieval Ablation Results\n\n';
  report += `Generated: ${new Date().toISOString()}\n\n`;

  report += '## Configuration Summary\n\n';
  report += '| Name | Description |\n';
  report += '|---|---|\n';
  for (const ablation of ABLATIONS) {
    report += `| ${ablation.name} | ${ablation.description} |\n`;
  }

  report += '\n## Results\n\n';
  report += '```json\n';
  report += JSON.stringify(results, null, 2);
  report += '\n```\n\n';

  report += '## Interpretation\n\n';
  report += '> **Status:** Placeholder. Full ablation results pending embeddings endpoints.\n\n';
  report += 'Once endpoints (TEI @ localhost:8000 and reranker @ localhost:8001) are deployed:\n\n';
  report += '1. Dense retrieval should unlock Arabic (5% → 40%+ recall@5)\n';
  report += '2. Dimension truncation (512-d vs 1024-d) should show <3% recall loss\n';
  report += '3. Reranking should improve both languages by ~6-7%\n';
  report += '4. Full hybrid should beat each component alone\n\n';

  report += '## Next Steps\n\n';
  report += '- Deploy Qwen3-Embedding-0.6B at localhost:8000 (TEI)\n';
  report += '- Deploy gte-multilingual-reranker-base at localhost:8001 (Infinity or TEI)\n';
  report += '- Re-run: `npm run eval -- --phase2-ablations`\n';

  return report;
}

module.exports = {
  ABLATIONS,
  runAblations,
  generateAblationReport,
};
