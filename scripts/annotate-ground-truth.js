#!/usr/bin/env node
/**
 * Mine groundTruthChunks from eval cases using BM25 retrieval.
 *
 * For each case without groundTruthChunks, runs BM25 search and assigns
 * the top-k hits as the ground truth. Works well for straightforward
 * questions; cross-lingual cases may need manual review.
 *
 * Usage:
 *   node scripts/annotate-ground-truth.js [--dry-run]
 *
 * Options:
 *   --dry-run    Show what would be added, don't modify cases.json
 */

'use strict';

const fs = require('fs');
const path = require('path');
const bm25 = require('../src/brain/bm25');

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');

const CASES_PATH = 'evals/cases.json';
const TOP_K = 3;  // Top-3 hits per case

function loadCases(filePath) {
  const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  return Array.isArray(data) ? data : data.cases || [];
}

function saveCases(filePath, cases) {
  const wrapper = {
    _comment: 'Captain Adel — eval cases. Each case runs one turn through src/brain and scores the answer against the assertions in `expect`. Assertions are heuristic (keyword + shape checks), not a human judgement — they catch regressions, they do not prove correctness. Schema: citesPart [str] (answer must reference \'Part N\' for one of these), mustInclude [str] (all present, case-insensitive), mustIncludeAny [str] (at least one), mustNotInclude [str] (none), shouldHaveSources bool, answerLang \'ar\'|\'en\', kind \'grounded\'|\'partial\'|\'refusal\'|\'na\' (asserted against the decorated verdict). A case may carry history: [{role:\'user\'|\'model\', text}] for multi-turn context. Note on the `coverage` category: these cases exist to give every substantial GACAR Part at least one citation assertion (they took citesPart coverage from 3 Parts to 30). Each English one was written against real retrieve() output, so its citesPart is known to be reachable from the bundled corpus. The Arabic ones deliberately assert only answerLang + keywords and NOT citesPart/shouldHaveSources: the corpus is English, so a pure-Arabic query scores zero BM25 hits and only the agentic path can find sources for it. Adding source assertions there would fail for a retrieval reason, not a regression — they become meaningful once hybrid/cross-lingual retrieval is switched on (see ROADMAP, Retrieval).',
    cases
  };
  fs.writeFileSync(filePath, JSON.stringify(wrapper, null, 2) + '\n');
}

function main() {
  console.log('Loading eval cases...');
  const cases = loadCases(CASES_PATH);

  // Count cases with and without groundTruthChunks
  const withGT = cases.filter(c => c.groundTruthChunks && c.groundTruthChunks.length > 0);
  const withoutGT = cases.filter(c => !c.groundTruthChunks || c.groundTruthChunks.length === 0);

  console.log(`Total cases: ${cases.length}`);
  console.log(`  Already annotated: ${withGT.length}`);
  console.log(`  Need annotation: ${withoutGT.length}`);

  if (withoutGT.length === 0) {
    console.log('\n✅ All cases already have groundTruthChunks!');
    process.exit(0);
  }

  // Mine groundTruthChunks using BM25
  console.log(`\n📚 Mining groundTruthChunks using BM25 (top-${TOP_K} per case)...\n`);

  let annotated = 0;
  let failed = 0;

  for (const caseObj of withoutGT) {
    const question = caseObj.question || '';
    if (!question.trim()) {
      console.log(`⚠️  Case ${caseObj.id}: empty question, skipping`);
      failed++;
      continue;
    }

    try {
      // Run BM25 search
      const hits = bm25.searchLibrary(question, TOP_K * 2);  // Get more, pick top-3
      const topHits = hits.slice(0, TOP_K);

      if (topHits.length === 0) {
        console.log(`⚠️  Case ${caseObj.id}: no BM25 hits found`);
        failed++;
        continue;
      }

      // Extract chunk indices as groundTruthChunks
      const groundTruthChunks = topHits
        .filter(hit => Number.isInteger(hit.chunk_index))
        .map(hit => hit.chunk_index);

      if (groundTruthChunks.length === 0) {
        console.log(`⚠️  Case ${caseObj.id}: hits had no chunk_index`);
        failed++;
        continue;
      }

      console.log(
        `✓ Case ${caseObj.id} (${groundTruthChunks.length} chunks)\n` +
        `  Q: "${question.slice(0, 60)}${question.length > 60 ? '...' : ''}"\n` +
        `  Chunks: ${groundTruthChunks.join(', ')}`
      );

      // Assign groundTruthChunks
      caseObj.groundTruthChunks = groundTruthChunks;
      annotated++;
    } catch (err) {
      console.log(`❌ Case ${caseObj.id}: ${err.message}`);
      failed++;
    }
  }

  console.log(`\n📊 Results:`);
  console.log(`  ✅ Annotated: ${annotated}`);
  console.log(`  ❌ Failed: ${failed}`);

  if (!dryRun && annotated > 0) {
    console.log(`\n💾 Writing ${annotated} annotations to ${CASES_PATH}...`);
    saveCases(CASES_PATH, cases);
    console.log(`   Done!`);
  } else if (dryRun) {
    console.log(`\n🔍 Dry-run complete (no changes written).`);
  }

  if (annotated === 0) {
    process.exit(1);
  }
}

main();
