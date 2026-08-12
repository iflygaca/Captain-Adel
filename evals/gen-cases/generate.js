#!/usr/bin/env node
/* ============================================================================
 * Captain Adel — multi-agent eval-case drafting tool.
 *
 * Grounds itself in the REAL GACAR corpus (src/brain/retrieve.js, the same
 * retrieval the running service uses) and fans a claude-sonnet-5-lead /
 * claude-haiku-4-5-worker swarm out over one GACAR Part to draft candidate
 * evals/cases.json entries for HUMAN REVIEW. Never writes to the real
 * cases.json — prints a validated draft array to stdout.
 *
 * Design: ../../docs/multi-agent-orchestrator.md ("Swapping in Captain
 * Adel's retrieval"). Unlike examples/multi-agent-orchestrator/ (fully
 * decoupled from src/), this tool is deliberately coupled to the real brain
 * — that's the point. Still dev/eval-only per PDPL: the Anthropic API is not
 * served in-Kingdom, so this never touches /v1/chat or a MODEL_PROVIDER.
 *
 * Usage:
 *   cd evals/gen-cases && npm install
 *   export ANTHROPIC_API_KEY=sk-ant-...
 *   node generate.js 121                       # 6 drafts for GACAR Part 121
 *   node generate.js 145 --count 8 --language mixed > drafts/part-145.json
 * ==========================================================================*/

'use strict';

const { parseArgs } = require('node:util');
const Anthropic = require('@anthropic-ai/sdk');
const { zodOutputFormat } = require('@anthropic-ai/sdk/helpers/zod');
const { z } = require('zod');

const { retrieve } = require('../../src/brain/retrieve');
const { extractCitations } = require('../../src/brain/grounding');

// ---------------------------------------------------------------------------
// Constants — models, budgets, pricing (same figures as
// examples/multi-agent-orchestrator/; cheaper per run here — no synthesis call)
// ---------------------------------------------------------------------------

const DECOMPOSE_MODEL = 'claude-sonnet-5';
const WORKER_MODEL = 'claude-haiku-4-5';       // difficulty: standard
const ESCALATION_MODEL = 'claude-sonnet-5';    // difficulty: hard

const DECOMPOSE_MAX_TOKENS = 4096;
const WORKER_MAX_TOKENS_HAIKU = 2048;
const WORKER_MAX_TOKENS_SONNET = 4096;

const DEFAULT_CONCURRENCY = 4;
const COUNT_MIN = 3;
const COUNT_MAX = 10;
const WORKER_TIMEOUT_MS = 90_000;
const RETRY_BASE_MS = 2_000;

// $/MTok, standard tier. Cache read = 0.1x input; cache write (5m TTL) = 1.25x.
const PRICING = {
  'claude-sonnet-5': { input: 3.0, output: 15.0 },
  'claude-haiku-4-5': { input: 1.0, output: 5.0 },
};

const DECOMPOSE_SYSTEM =
  'You are drafting candidate regulatory-knowledge eval cases for an aviation ' +
  'Q&A system. Given a retrieved context pack for one GACAR Part, propose N ' +
  'distinct facets to draft cases for — each facet is one specific, checkable ' +
  'regulatory question angle within the pack (a numeric limit, a required ' +
  'action, a definition, an eligibility rule, etc.), grounded in exactly one ' +
  'citation from the pack. Avoid overlapping facets. Assign difficulty ' +
  '"hard" only where the angle needs multi-step reasoning across more than ' +
  'one part of the pack; most facets should be "standard".';

const WORKER_SYSTEM =
  'You are drafting ONE candidate eval case for an aviation regulatory Q&A ' +
  'system, from a retrieved context pack of real GACAR passages. Ground your ' +
  'case in EXACTLY ONE citation from the pack — copy its "Part X, §X.YYY" ' +
  'label from the head of the passage you used, exactly as printed there. ' +
  'Write a natural question a pilot might ask that this passage answers, in ' +
  'the assigned language. Then write assertions a grader could check against ' +
  'a future answer: citesPart (the Part number), and mustInclude/' +
  'mustIncludeAny keywords that a correct answer would contain (numbers, key ' +
  'terms) — draw these ONLY from the passage text, never invent a figure. ' +
  'sourceQuote must be an exact, verbatim substring of the passage backing ' +
  'your assertions — copy it precisely, do not paraphrase.';

// ---------------------------------------------------------------------------
// Contracts
// ---------------------------------------------------------------------------

const FacetSchema = z.object({
  id: z.string(),
  angle: z.string(),
  language: z.enum(['en', 'ar']),
  difficulty: z.enum(['standard', 'hard']),
});

const DecompositionPlanSchema = z.object({ facets: z.array(FacetSchema) });

const DraftCaseSchema = z.object({
  id: z.string(),
  category: z.string(),
  question: z.string(),
  expect: z.object({
    citesPart: z.array(z.string()).optional(),
    mustInclude: z.array(z.string()).optional(),
    mustIncludeAny: z.array(z.string()).optional(),
    mustNotInclude: z.array(z.string()).optional(),
    shouldHaveSources: z.boolean().optional(),
    answerLang: z.enum(['ar', 'en']).optional(),
    kind: z.enum(['grounded', 'partial', 'refusal', 'na']).optional(),
  }),
  citation: z.string(),
  sourceQuote: z.string(),
});

const EXPECT_KEYS = [
  'citesPart', 'mustInclude', 'mustIncludeAny', 'mustNotInclude',
  'shouldHaveSources', 'answerLang', 'kind',
];

function isNonVacuousExpect(expect) {
  return EXPECT_KEYS.some((k) => {
    const v = expect[k];
    if (Array.isArray(v)) return v.length > 0;
    return v !== undefined && v !== null;
  });
}

function normalizeWs(s) {
  return String(s || '').replace(/\s+/g, ' ').trim();
}

/* context pack blocks look like `[N] <citation>\n<passage text>`, joined by
 * \n\n (see src/brain/retrieve.js buildResult()). */
function findPassageForCitation(contextPack, citation) {
  const blocks = String(contextPack || '').split(/\n\n+/);
  const needle = normalizeWs(citation).toLowerCase();
  for (const block of blocks) {
    const firstLineEnd = block.indexOf('\n');
    if (firstLineEnd === -1) continue;
    const header = block.slice(0, firstLineEnd);
    if (normalizeWs(header).toLowerCase().includes(needle)) {
      return block.slice(firstLineEnd + 1);
    }
  }
  return null;
}

/**
 * Code-side validation — no extra model call. Rejects fabricated citations
 * and quotes; strips the scratch fields before the case is fit to publish.
 */
function validateDraft(draft, contextPack, targetPart) {
  const cites = extractCitations(draft.citation);
  if (!cites.length) return { ok: false, reason: `citation "${draft.citation}" did not parse` };
  if (String(cites[0].part) !== String(targetPart)) {
    return { ok: false, reason: `citation parses to Part ${cites[0].part}, expected Part ${targetPart}` };
  }
  const passage = findPassageForCitation(contextPack, draft.citation);
  if (passage == null) {
    return { ok: false, reason: `citation "${draft.citation}" not found in the retrieved pack` };
  }
  if (!normalizeWs(passage).toLowerCase().includes(normalizeWs(draft.sourceQuote).toLowerCase())) {
    return { ok: false, reason: 'sourceQuote is not a verbatim substring of its cited passage' };
  }
  if (!isNonVacuousExpect(draft.expect)) {
    return { ok: false, reason: 'expect block is empty — would be a vacuous pass in eval:run' };
  }
  const { citation, sourceQuote, ...publishable } = draft; // eslint-disable-line no-unused-vars
  return { ok: true, case: publishable };
}

// ---------------------------------------------------------------------------
// Ledger
// ---------------------------------------------------------------------------

class Ledger {
  constructor() {
    this.rows = new Map();
  }

  add(model, usage) {
    const row = this.rows.get(model) || { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, calls: 0 };
    row.input += usage.input_tokens || 0;
    row.output += usage.output_tokens || 0;
    row.cacheRead += usage.cache_read_input_tokens || 0;
    row.cacheWrite += usage.cache_creation_input_tokens || 0;
    row.calls += 1;
    this.rows.set(model, row);
  }

  cost(model) {
    const row = this.rows.get(model);
    const p = PRICING[model];
    if (!row || !p) return 0;
    return (row.input * p.input + row.output * p.output
      + row.cacheRead * 0.1 * p.input + row.cacheWrite * 1.25 * p.input) / 1e6;
  }

  report() {
    console.error('\n== usage ledger ' + '='.repeat(47));
    let total = 0;
    for (const [model, row] of this.rows) {
      const cost = this.cost(model);
      total += cost;
      console.error(`  ${model.padEnd(18)} calls=${String(row.calls).padEnd(3)} in=${String(row.input).padEnd(7)} `
        + `out=${String(row.output).padEnd(7)} cache_read=${String(row.cacheRead).padEnd(7)} `
        + `cache_write=${String(row.cacheWrite).padEnd(7)} $${cost.toFixed(4)}`);
    }
    console.error(`  ${'TOTAL'.padEnd(18)} $${total.toFixed(4)}  (standard-tier list prices)`);
  }
}

// ---------------------------------------------------------------------------
// Semaphore
// ---------------------------------------------------------------------------

class Semaphore {
  constructor(n) {
    this.free = n;
    this.queue = [];
  }

  async acquire() {
    if (this.free > 0) {
      this.free -= 1;
      return;
    }
    await new Promise((resolve) => this.queue.push(resolve));
  }

  release() {
    const next = this.queue.shift();
    if (next) next();
    else this.free += 1;
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/* 429/5xx and network failures earn one more try; other 4xx never do. */
function retryable(err) {
  if (err instanceof Anthropic.RateLimitError) return true;
  if (err instanceof Anthropic.InternalServerError) return true;
  if (err instanceof Anthropic.APIConnectionError) return true; // subclasses APIError — check first
  if (err instanceof Anthropic.APIError) return false;
  return true; // schema-validation noise
}

function errText(err) {
  return err instanceof Error ? `${err.constructor.name}: ${err.message}` : String(err);
}

// ---------------------------------------------------------------------------
// Pipeline
// ---------------------------------------------------------------------------

async function decomposeFacets(client, ledger, part, count, language) {
  const languageNote = language === 'mixed'
    ? `Assign roughly half the facets language "ar" and half "en".`
    : `Assign every facet language "${language}".`;
  const user = `GACAR Part ${part}. Propose exactly ${count} facets. ${languageNote}`;
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const resp = await client.messages.parse({
        model: DECOMPOSE_MODEL,
        max_tokens: DECOMPOSE_MAX_TOKENS,
        system: DECOMPOSE_SYSTEM,
        messages: [{ role: 'user', content: user }],
        output_config: { format: zodOutputFormat(DecompositionPlanSchema) },
      });
      ledger.add(DECOMPOSE_MODEL, resp.usage);
      if (resp.parsed_output == null) throw new Error('decomposition did not match the schema');
      let facets = resp.parsed_output.facets;
      const seen = new Set();
      facets.forEach((f, i) => {
        if (!f.id || seen.has(f.id)) f.id = `f${i + 1}`;
        seen.add(f.id);
      });
      if (facets.length > COUNT_MAX) facets = facets.slice(0, COUNT_MAX);
      return facets;
    } catch (err) {
      if (attempt === 2 || !retryable(err)) throw err;
      await sleep(RETRY_BASE_MS + Math.random() * RETRY_BASE_MS);
    }
  }
  throw new Error('unreachable');
}

async function draftCase(client, ledger, sem, facet, contextPack, targetPart) {
  const hard = facet.difficulty === 'hard';
  const model = hard ? ESCALATION_MODEL : WORKER_MODEL;
  const maxTokens = hard ? WORKER_MAX_TOKENS_SONNET : WORKER_MAX_TOKENS_HAIKU;
  const brief = `Your facet (id: ${facet.id}): ${facet.angle}\nLanguage: ${facet.language}\n`
    + `Set id to a kebab-case slug starting with "${facet.id}-", and category to a short topic word.`;
  await sem.acquire();
  try {
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const resp = await client.messages.parse(
          {
            model,
            max_tokens: maxTokens,
            // Byte-identical prefix across workers = the prompt-cache unit.
            system: [
              { type: 'text', text: WORKER_SYSTEM },
              { type: 'text', text: contextPack, cache_control: { type: 'ephemeral' } },
            ],
            messages: [{ role: 'user', content: brief }],
            output_config: { format: zodOutputFormat(DraftCaseSchema) },
          },
          { timeout: WORKER_TIMEOUT_MS },
        );
        ledger.add(model, resp.usage);
        const draft = resp.parsed_output;
        if (draft == null) throw new Error('worker output did not match the schema');
        const verdict = validateDraft(draft, contextPack, targetPart);
        if (!verdict.ok) {
          console.error(`[facet ${facet.id}] REJECTED (${model}): ${verdict.reason}`);
          return { ok: false, facet, reason: verdict.reason };
        }
        console.error(`[facet ${facet.id}] drafted "${verdict.case.id}" (${model})`);
        return { ok: true, facet, case: verdict.case };
      } catch (err) {
        if (attempt === 2 || !retryable(err)) {
          console.error(`[facet ${facet.id}] FAILED: ${errText(err)}`);
          return { ok: false, facet, reason: errText(err) };
        }
        await sleep(RETRY_BASE_MS + Math.random() * RETRY_BASE_MS);
      }
    }
    throw new Error('unreachable');
  } finally {
    sem.release();
  }
}

/* Warm-first: facet #1 runs alone and writes the prompt cache; the rest then
 * fan out under the semaphore and read it. */
async function fanOut(client, ledger, facets, contextPack, targetPart, concurrency) {
  const sem = new Semaphore(concurrency);
  const [first, ...rest] = facets;
  const outcomes = [await draftCase(client, ledger, sem, first, contextPack, targetPart)];
  outcomes.push(...(await Promise.all(rest.map((f) => draftCase(client, ledger, sem, f, contextPack, targetPart)))));
  return outcomes;
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

async function run(part, count, language, concurrency) {
  const query = `GACAR Part ${part} requirements`;
  const { context, sources } = retrieve(query, { topK: 8 });
  const covers = sources.some((s) => String(s.part) === String(part));
  if (!sources.length || !covers) {
    console.error(`No corpus coverage found for GACAR Part ${part} (retrieved ${sources.length} source(s), `
      + `none tagged Part ${part}). This may be a thin or uncatalogued Part — nothing to draft against.`);
    process.exitCode = 1;
    return;
  }
  console.error(`[retrieve] Part ${part}: ${sources.length} source(s), context pack ${context.length} chars`);

  const client = new Anthropic(); // reads ANTHROPIC_API_KEY / ANTHROPIC_AUTH_TOKEN
  const ledger = new Ledger();
  let outcomes;
  try {
    const facets = await decomposeFacets(client, ledger, part, count, language);
    console.error(`[decompose] ${facets.length} facet(s): `
      + facets.map((f) => `${f.id}/${f.language}${f.difficulty === 'hard' ? '!' : ''}`).join(', '));
    outcomes = await fanOut(client, ledger, facets, context, part, concurrency);
  } finally {
    ledger.report();
  }

  const drafted = outcomes.filter((o) => o.ok).map((o) => o.case);
  const rejected = outcomes.filter((o) => !o.ok);
  console.error(`\n${drafted.length} case(s) drafted, ${rejected.length} rejected.`);
  if (!drafted.length) {
    console.error('Nothing survived validation — no output written.');
    process.exitCode = 1;
    return;
  }
  console.log(JSON.stringify(drafted, null, 2));
}

function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      count: { type: 'string', default: '6' },
      language: { type: 'string', default: 'en' },
    },
  });
  const part = positionals[0];
  if (!part || !/^\d+$/.test(part)) {
    console.error('Usage: node generate.js <part-number> [--count N] [--language en|ar|mixed]');
    process.exitCode = 1;
    return;
  }
  const count = Math.min(COUNT_MAX, Math.max(COUNT_MIN, Number.parseInt(values.count, 10) || 6));
  const language = ['en', 'ar', 'mixed'].includes(values.language) ? values.language : 'en';
  if (!process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN) {
    console.error('Set ANTHROPIC_API_KEY (or ANTHROPIC_AUTH_TOKEN) first.');
    process.exitCode = 1;
    return;
  }
  run(part, count, language, DEFAULT_CONCURRENCY).catch((err) => {
    console.error(errText(err));
    process.exitCode = 1;
  });
}

if (require.main === module) main();

module.exports = { validateDraft, findPassageForCitation, isNonVacuousExpect };
