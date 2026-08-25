'use strict';

/**
 * Retrieval metrics for eval cases.
 *
 * Measures citation accuracy, source retrieval quality, and recall@k
 * for ablation studies (Phase 2).
 */

function measureRetrieval(evalCase, answer, sources) {
  /**
   * Measure retrieval quality for a single case.
   * Returns: { citationMatch, hadSources, sourceCount, recall }
   */

  // 1. Citation match — does answer cite expected Part(s)?
  const cited = extractCitations(answer);
  const expectedParts = evalCase.expect?.citesPart || [];
  const citationMatch = expectedParts.length > 0 &&
    expectedParts.some(part => cited.includes(String(part)));

  // 2. Source presence
  const sourceCount = sources ? sources.length : 0;
  const hadSources = sourceCount > 0;

  // 3. Recall@k — if ground truth chunks are known, measure recall
  const recall = measureRecall(evalCase, sources);

  return {
    citationMatch,
    hadSources,
    sourceCount,
    recall, // { at5, at10, at20 }
  };
}

function measureRecall(evalCase, sources) {
  /**
   * Measure recall@k for cases with known ground-truth chunks.
   * For evals without groundTruthChunks, returns null for all cutoffs.
   */

  const groundTruthChunks = evalCase.groundTruthChunks || [];
  if (!groundTruthChunks.length) {
    return { at5: null, at10: null, at20: null };
  }

  if (!sources || !sources.length) {
    return { at5: 0, at10: 0, at20: 0 };
  }

  const groundTruth = new Set(groundTruthChunks.map(c => String(c)));
  const retrievedIds = new Set(
    (sources || []).map(s => String(s.chunkId || s.id || ''))
  );

  const topKAtCutoff = (k) => {
    const retrieved = sources.slice(0, k);
    const hits = retrieved.filter(s =>
      groundTruth.has(String(s.chunkId || s.id || ''))
    ).length;
    return groundTruthChunks.length > 0
      ? hits / groundTruthChunks.length
      : 0;
  };

  return {
    at5: topKAtCutoff(5),
    at10: topKAtCutoff(10),
    at20: topKAtCutoff(20),
  };
}

function extractCitations(answerText) {
  /**
   * Extract Part numbers from answer text.
   * E.g., "Part 91, §91.155" → ["91"]
   */
  if (!answerText) return [];
  // Match "Part N" where N is 1-3 digits
  const matches = answerText.match(/Part\s+(\d{1,3})(?:\D|$)/g);
  if (!matches) return [];
  return matches
    .map(m => m.match(/\d{1,3}/)[0])
    .filter((v, i, a) => a.indexOf(v) === i); // unique
}

function aggregateMetrics(caseResults) {
  /**
   * Aggregate case-level metrics into per-language summaries.
   * Returns: { en: { citationMatch, recall, hadSources, count }, ar: {...} }
   */

  const byLang = { en: [], ar: [] };

  for (const result of caseResults) {
    const lang = result.evalCase?.language || result.evalCase?.lang || 'en';
    const langKey = lang === 'ar' || lang === 'arabic' ? 'ar' : 'en';
    if (!byLang[langKey]) byLang[langKey] = [];
    byLang[langKey].push(result.metrics || result);
  }

  const aggregate = {};
  for (const [lang, metrics] of Object.entries(byLang)) {
    if (!metrics.length) continue;

    aggregate[lang] = {
      citationMatch:
        metrics.filter(m => m.citationMatch).length / metrics.length,
      recall: {
        at5: avg(metrics.map(m => m.recall?.at5)),
        at10: avg(metrics.map(m => m.recall?.at10)),
        at20: avg(metrics.map(m => m.recall?.at20)),
      },
      hadSources:
        metrics.filter(m => m.hadSources).length / metrics.length,
      count: metrics.length,
    };
  }

  return aggregate;
}

function avg(arr) {
  const valid = arr.filter(x => x !== null && x !== undefined);
  return valid.length > 0
    ? valid.reduce((a, b) => a + b, 0) / valid.length
    : 0;
}

module.exports = {
  measureRetrieval,
  measureRecall,
  extractCitations,
  aggregateMetrics,
  avg,
};
