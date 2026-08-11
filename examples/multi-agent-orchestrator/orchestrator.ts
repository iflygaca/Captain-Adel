/**
 * Captain Adel — multi-agent orchestrator boilerplate (TypeScript).
 *
 * One lead orchestrator (claude-sonnet-5) decomposes a research question into
 * 5–15 self-contained subtasks; a swarm of workers (claude-haiku-4-5,
 * escalating to claude-sonnet-5 for hard subtasks) executes them in parallel
 * with isolated contexts; a streamed synthesis pass reconciles the structured
 * results.
 *
 * Design doc: ../../docs/multi-agent-orchestrator.md
 * Mirror implementation: ./orchestrator.py (same sections, same names)
 *
 * Usage:
 *     npm install
 *     export ANTHROPIC_API_KEY=sk-ant-...
 *     npm start                                # built-in demo question
 *     npm start -- "your question" --concurrency 6
 *
 * Deliberately decoupled from src/ — imports nothing from the Captain Adel
 * service; the brain stays portable. PDPL note: the Anthropic API is not
 * served in-Kingdom, so this pattern is dev/eval/authoring tooling only —
 * never wire it into the /v1/chat request path (see the design doc).
 */

import { parseArgs } from "node:util";
import process from "node:process";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";

// ---------------------------------------------------------------------------
// Constants — models, budgets, pricing
// ---------------------------------------------------------------------------

const ORCHESTRATOR_MODEL = "claude-sonnet-5"; // decompose + synthesize
const WORKER_MODEL = "claude-haiku-4-5";      // difficulty: standard
const ESCALATION_MODEL = "claude-sonnet-5";   // difficulty: hard

// Sonnet 5 runs adaptive thinking by default and max_tokens caps thinking AND
// text together — that is why every Sonnet call gets more headroom than Haiku.
// `output_config.effort` is a further Sonnet tuning lever; it is deliberately
// not sent anywhere here because it ERRORS on claude-haiku-4-5.
const DECOMPOSE_MAX_TOKENS = 8192;
const WORKER_MAX_TOKENS_HAIKU = 4096;
const WORKER_MAX_TOKENS_SONNET = 8192;
const SYNTH_MAX_TOKENS = 16000;

const DEFAULT_CONCURRENCY = 8; // in-flight workers; tune 5–15
const SUBTASK_MIN = 5;
const SUBTASK_MAX = 15;
const WORKER_TIMEOUT_MS = 120_000; // TS SDK timeouts are MILLISECONDS (Python SDK: seconds)
const RETRY_BASE_MS = 2_000;       // one app-level retry with jitter, on top of SDK retries

// $/MTok, standard tier. Cache read = 0.1x input; cache write (5m TTL) = 1.25x.
// claude-sonnet-5 has introductory pricing ($2/$10) through 2026-08-31; the
// ledger uses the standard sticker so estimates err high.
const PRICING: Record<string, { input: number; output: number }> = {
  "claude-sonnet-5": { input: 3.0, output: 15.0 },
  "claude-haiku-4-5": { input: 1.0, output: 5.0 },
};

const DEMO_QUESTION =
  "Should Gulf Regional Airways electrify its ground-support equipment fleet " +
  "over the next five years, and if so, how should it sequence the transition?";

// The shared, cacheable context pack. In production this is what a retrieval
// layer returns for the run's question (for Captain Adel: src/brain/retrieve.js
// — BM25 + parent-child expansion); here it is a small SYNTHETIC briefing so
// the demo runs with nothing but an API key. All figures are illustrative.
//
// Cache math, honestly: this pack is ~1.2K tokens — above claude-sonnet-5's
// 1024-token minimum cacheable prefix but BELOW claude-haiku-4-5's 4096, so
// the cache_control marker below is correct-by-construction yet silently inert
// on Haiku workers until the pack grows (a real retrieval pack clears 4096
// easily).
const CONTEXT_PACK = `CONTEXT PACK — Gulf Regional Airways, ground-support equipment (GSE) electrification briefing.
All figures are synthetic and illustrative; treat them as the only ground truth for this exercise.

[1] Fleet inventory (ops audit, Q2). 214 GSE units across 3 hub airports and 9 spoke
stations: 62 baggage tractors, 41 belt loaders, 28 pushback tractors (14 wide-body rated),
24 ground power units (GPUs), 19 air-start units, 15 catering trucks, 25 miscellaneous
(lavatory/water/maintenance). Median age 11.4 years; 38% past planned replacement age.
Diesel share of units: 87%. Annual GSE diesel burn: 4.1M liters.

[2] Energy & fuel costs (finance memo). Blended diesel cost $0.92/liter delivered airside,
up 31% over four years. Grid electricity at hub airports $0.081/kWh on current industrial
tariffs, with a signed option for $0.064/kWh off-peak (22:00–05:00). Internal estimate:
like-for-like energy cost per operating hour falls 55–70% for electric baggage tractors and
belt loaders, 35–50% for electric pushbacks, based on vendor duty-cycle data (unvalidated
in our own operations).

[3] Duty cycles (telematics pilot, 47 instrumented units, 6 months). Baggage tractors
average 6.1 engine-hours/day with 41% idle time; belt loaders 4.1 h/day, 55% idle;
pushbacks are peaky — 2.7 h/day average with 92% of movements inside two 3-hour banks.
Nine units exceeded 11 h/day (hot-standby ramp ops); these are the hardest to electrify
without opportunity charging or battery swap.

[4] Charging infrastructure (facilities assessment). Hub A can host 40 charge points on
existing switchgear; Hub B needs a substation upgrade (18–24 month lead time, $2.4M
capex, airport authority approval required); Hub C ramp has spare capacity but conduit
runs cross an active taxiway (night-works only). Spoke stations: 6 of 9 have no airside
three-phase supply today. Airport authority offers a 20% infrastructure cost-share where
charging is shared with other tenants.

[5] Emissions & compliance targets (sustainability charter). Board-approved: −45% scope-1
ground emissions by year 5 (baseline: last audited year), net-zero ground ops by year 12.
GSE is 23% of scope-1 ground emissions today. Two hub airports have announced
diesel-GSE surcharge frameworks starting in ~3 years ($0.60–1.10 per movement, draft).
No airworthiness or flight-ops regulation is implicated by GSE choice; this is a ground
procurement decision.

[6] Vendor landscape (procurement scan). Three credible OEMs for electric baggage
tractors/belt loaders with 12–18 week lead times and 5-year battery warranties (80%
capacity floor). Electric wide-body pushbacks: one proven vendor, 40+ week lead time,
~2.3x diesel unit capex. Aftermarket repower (diesel-to-electric conversion) quoted at
55–60% of new-unit cost for tractors, warranty 2 years, mixed operator reviews. Used
electric GSE market is thin; residuals unproven.

[7] Constraints & risks (ops review). Ramp headcount trained for HV maintenance: 4 of 210
technicians (certification course: 6 weeks). Summer apron temperatures reach 51°C —
vendor derating data above 45°C is sparse for two of three OEMs. Battery-room fire
approvals at Hub B pending. Capital plan headroom: $18M over 5 years for GSE without
board escalation; anything above requires the full fleet-strategy review. Union agreement
requires 90-day notice for role-profile changes affecting refueling staff.
`;

const ORCH_SYSTEM =
  "You are the lead orchestrator of a research swarm. Decompose the user's " +
  `question into ${SUBTASK_MIN}-${SUBTASK_MAX} self-contained subtasks. Each ` +
  "worker sees ONLY the shared context pack and its own brief — never the " +
  "other briefs — so every brief must stand alone and name the exact facet " +
  "it owns. Assign role 'researcher' (extract and organize evidence), " +
  "'analyst' (quantify, compare, model trade-offs), or 'critic' (attack " +
  "assumptions, find risks and gaps). Mark difficulty 'hard' only where deep " +
  "multi-step reasoning is genuinely required — hard subtasks cost ~3x. " +
  "Cover the question fully; avoid overlapping briefs.";

const WORKER_SYSTEM =
  "You are one worker in a research swarm. Complete ONLY your assigned brief. " +
  "Ground every claim in the context pack; cite the bracketed section numbers " +
  "like [3]. Anything not supported by the pack must be labeled an assumption " +
  "in `notes` with confidence 0.5 or lower. Do not answer the overall " +
  "question — deliver your facet only, concisely.";

const SYNTH_SYSTEM =
  "You are the lead synthesizer of a research swarm. Reconcile the workers' " +
  "JSON results into one markdown report: lead with the recommendation, then " +
  "the evidence, real disagreements between workers, and open questions. " +
  "Where subtasks failed, name them explicitly as coverage gaps. Use only " +
  "the findings provided — invent nothing.";

// ---------------------------------------------------------------------------
// Contracts — every cross-context payload is strict JSON (snake_case keys to
// stay wire-compatible with orchestrator.py)
// ---------------------------------------------------------------------------

const SubtaskSchema = z.object({
  id: z.string(),
  role: z.enum(["researcher", "analyst", "critic"]),
  difficulty: z.enum(["standard", "hard"]),
  brief: z.string(),
  deliverable: z.string(),
});

const DecompositionPlanSchema = z.object({
  subtasks: z.array(SubtaskSchema),
});

const FindingSchema = z.object({
  claim: z.string(),
  confidence: z.number(),
  notes: z.string(),
});

const WorkerResultSchema = z.object({
  subtask_id: z.string(),
  summary: z.string(),
  findings: z.array(FindingSchema),
  open_questions: z.array(z.string()),
});

type Subtask = z.infer<typeof SubtaskSchema>;
type DecompositionPlan = z.infer<typeof DecompositionPlanSchema>;
type WorkerResult = z.infer<typeof WorkerResultSchema>;

interface WorkerOutcome {
  subtask: Subtask;
  result: WorkerResult | null;
  error: string | null;
}

/** Schemas guarantee shape; code guarantees invariants (cap + unique ids). */
function clampPlan(plan: DecompositionPlan): DecompositionPlan {
  const seen = new Set<string>();
  plan.subtasks.forEach((sub, i) => {
    if (!sub.id || seen.has(sub.id)) sub.id = `w${i + 1}`;
    seen.add(sub.id);
  });
  if (plan.subtasks.length > SUBTASK_MAX) plan.subtasks = plan.subtasks.slice(0, SUBTASK_MAX);
  if (plan.subtasks.length < SUBTASK_MIN) {
    console.error(`[orchestrator] note: only ${plan.subtasks.length} subtasks (asked for >= ${SUBTASK_MIN})`);
  }
  return plan;
}

// ---------------------------------------------------------------------------
// Ledger — per-model token counters -> dollars
// ---------------------------------------------------------------------------

interface LedgerRow {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  calls: number;
}

class Ledger {
  private rows = new Map<string, LedgerRow>();

  add(model: string, usage: Anthropic.Usage): void {
    const row = this.rows.get(model) ?? { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, calls: 0 };
    row.input += usage.input_tokens ?? 0;
    row.output += usage.output_tokens ?? 0;
    row.cacheRead += usage.cache_read_input_tokens ?? 0;
    row.cacheWrite += usage.cache_creation_input_tokens ?? 0;
    row.calls += 1;
    this.rows.set(model, row);
  }

  cost(model: string): number {
    const row = this.rows.get(model);
    const p = PRICING[model];
    if (!row || !p) return 0;
    return (
      (row.input * p.input +
        row.output * p.output +
        row.cacheRead * 0.1 * p.input +
        row.cacheWrite * 1.25 * p.input) /
      1e6
    );
  }

  report(): void {
    console.error("\n== usage ledger " + "=".repeat(47));
    let total = 0;
    for (const [model, row] of this.rows) {
      const cost = this.cost(model);
      total += cost;
      console.error(
        `  ${model.padEnd(18)} calls=${String(row.calls).padEnd(3)} in=${String(row.input).padEnd(7)} ` +
          `out=${String(row.output).padEnd(7)} cache_read=${String(row.cacheRead).padEnd(7)} ` +
          `cache_write=${String(row.cacheWrite).padEnd(7)} $${cost.toFixed(4)}`,
      );
    }
    console.error(`  ${"TOTAL".padEnd(18)} $${total.toFixed(4)}  (standard-tier list prices)`);
  }
}

// ---------------------------------------------------------------------------
// Pipeline
// ---------------------------------------------------------------------------

/** 429/5xx, network failures, and parse noise earn one more try; other 4xx never do. */
function retryable(err: unknown): boolean {
  if (err instanceof Anthropic.RateLimitError) return true;
  if (err instanceof Anthropic.InternalServerError) return true;
  // APIConnectionError subclasses APIError in the TS SDK — check it FIRST.
  if (err instanceof Anthropic.APIConnectionError) return true;
  if (err instanceof Anthropic.APIError) return false; // other 4xx
  return true; // schema-validation noise
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function errText(err: unknown): string {
  return err instanceof Error ? `${err.constructor.name}: ${err.message}` : String(err);
}

/** Sonnet lead: question -> strict DecompositionPlan. One retry, then abort (it's the root). */
async function decompose(client: Anthropic, ledger: Ledger, question: string): Promise<DecompositionPlan> {
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const resp = await client.messages.parse({
        model: ORCHESTRATOR_MODEL,
        max_tokens: DECOMPOSE_MAX_TOKENS,
        system: ORCH_SYSTEM,
        messages: [{ role: "user", content: `Question:\n${question}\n\nProduce the decomposition plan.` }],
        output_config: { format: zodOutputFormat(DecompositionPlanSchema) },
      });
      ledger.add(ORCHESTRATOR_MODEL, resp.usage);
      if (resp.parsed_output == null) throw new Error("decomposition did not match the schema");
      return clampPlan(resp.parsed_output);
    } catch (err) {
      if (attempt === 2 || !retryable(err)) throw err;
      await sleep(RETRY_BASE_MS + Math.random() * RETRY_BASE_MS);
    }
  }
  throw new Error("unreachable");
}

/** One isolated worker: system rules + cached pack + own brief. Nothing else. */
async function runWorker(client: Anthropic, ledger: Ledger, sem: Semaphore, subtask: Subtask): Promise<WorkerOutcome> {
  const hard = subtask.difficulty === "hard";
  const model = hard ? ESCALATION_MODEL : WORKER_MODEL;
  const maxTokens = hard ? WORKER_MAX_TOKENS_SONNET : WORKER_MAX_TOKENS_HAIKU;
  const brief =
    `Your subtask (id: ${subtask.id}, role: ${subtask.role}):\n${subtask.brief}\n\n` +
    `Deliverable: ${subtask.deliverable}\n\n` +
    `Set subtask_id to "${subtask.id}" in your result.`;
  await sem.acquire();
  try {
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const resp = await client.messages.parse(
          {
            model,
            max_tokens: maxTokens,
            // Byte-identical prefix across workers = the prompt-cache unit.
            // Only the user brief below varies. Caches are per-model.
            system: [
              { type: "text", text: WORKER_SYSTEM },
              { type: "text", text: CONTEXT_PACK, cache_control: { type: "ephemeral" } },
            ],
            messages: [{ role: "user", content: brief }],
            output_config: { format: zodOutputFormat(WorkerResultSchema) },
          },
          { timeout: WORKER_TIMEOUT_MS },
        );
        ledger.add(model, resp.usage);
        const result = resp.parsed_output;
        if (result == null) throw new Error("worker output did not match the schema");
        result.subtask_id = subtask.id; // trust the task ledger, not the model
        for (const f of result.findings) f.confidence = Math.min(1, Math.max(0, f.confidence));
        console.error(`[worker ${subtask.id}] done (${model}, ${result.findings.length} findings)`);
        return { subtask, result, error: null };
      } catch (err) {
        if (attempt === 2 || !retryable(err)) {
          console.error(`[worker ${subtask.id}] FAILED: ${errText(err)}`);
          return { subtask, result: null, error: errText(err) };
        }
        await sleep(RETRY_BASE_MS + Math.random() * RETRY_BASE_MS);
      }
    }
    throw new Error("unreachable");
  } finally {
    sem.release();
  }
}

/**
 * Warm-first: worker #1 runs alone and writes the prompt cache; the other N-1
 * then fan out under the semaphore and read it. (Production refinement:
 * warm-first per model tier, since caches are per-model.)
 */
async function fanOut(client: Anthropic, ledger: Ledger, plan: DecompositionPlan, concurrency: number): Promise<WorkerOutcome[]> {
  const sem = new Semaphore(concurrency);
  const [first, ...rest] = plan.subtasks;
  const outcomes: WorkerOutcome[] = [await runWorker(client, ledger, sem, first!)];
  outcomes.push(...(await Promise.all(rest.map((s) => runWorker(client, ledger, sem, s)))));
  return outcomes;
}

/** Sonnet synthesis over worker RESULTS only (never transcripts), streamed. */
async function synthesize(client: Anthropic, ledger: Ledger, question: string, outcomes: WorkerOutcome[]): Promise<string> {
  const ok = outcomes.filter((o) => o.result != null);
  const failed = outcomes.filter((o) => o.result == null);
  const resultsJson = JSON.stringify(ok.map((o) => o.result), null, 2);
  const gaps =
    failed.length === 0
      ? "none"
      : failed.map((o) => `${o.subtask.id} (${o.subtask.role}: ${o.subtask.brief.slice(0, 80)}...) -> ${o.error}`).join("; ");
  const user =
    `Original question:\n${question}\n\n` +
    `Worker results (JSON):\n${resultsJson}\n\n` +
    `Failed subtasks — name these as coverage gaps in the report: ${gaps}`;
  const stream = client.messages.stream({
    model: ORCHESTRATOR_MODEL,
    max_tokens: SYNTH_MAX_TOKENS,
    system: SYNTH_SYSTEM,
    messages: [{ role: "user", content: user }],
  });
  stream.on("text", (delta) => process.stdout.write(delta));
  const final = await stream.finalMessage();
  process.stdout.write("\n");
  ledger.add(ORCHESTRATOR_MODEL, final.usage);
  return final.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");
}

// ---------------------------------------------------------------------------
// Semaphore (Python side uses asyncio.Semaphore)
// ---------------------------------------------------------------------------

class Semaphore {
  private queue: Array<() => void> = [];
  private free: number;

  constructor(n: number) {
    this.free = n;
  }

  async acquire(): Promise<void> {
    if (this.free > 0) {
      this.free -= 1;
      return;
    }
    await new Promise<void>((resolve) => this.queue.push(resolve));
  }

  release(): void {
    const next = this.queue.shift();
    if (next) next();
    else this.free += 1;
  }
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: { concurrency: { type: "string", default: String(DEFAULT_CONCURRENCY) } },
  });
  const question = positionals[0] ?? DEMO_QUESTION;
  const concurrency = Math.max(1, Number.parseInt(values.concurrency ?? "", 10) || DEFAULT_CONCURRENCY);

  if (!process.env["ANTHROPIC_API_KEY"] && !process.env["ANTHROPIC_AUTH_TOKEN"]) {
    console.error("Set ANTHROPIC_API_KEY (or ANTHROPIC_AUTH_TOKEN) first — a demo run costs roughly $0.05-0.15.");
    process.exitCode = 1;
    return;
  }

  const client = new Anthropic(); // reads ANTHROPIC_API_KEY / ANTHROPIC_AUTH_TOKEN
  const ledger = new Ledger();
  try {
    const plan = await decompose(client, ledger, question);
    console.error(
      `[orchestrator] ${plan.subtasks.length} subtasks: ` +
        plan.subtasks.map((s) => `${s.id}/${s.role}${s.difficulty === "hard" ? "!" : ""}`).join(", "),
    );
    const outcomes = await fanOut(client, ledger, plan, concurrency);
    if (!outcomes.some((o) => o.result != null)) {
      console.error("every worker failed — aborting before synthesis");
      process.exitCode = 1;
      return;
    }
    await synthesize(client, ledger, question, outcomes);
  } finally {
    ledger.report();
  }
}

main().catch((err) => {
  console.error(errText(err));
  process.exitCode = 1;
});
