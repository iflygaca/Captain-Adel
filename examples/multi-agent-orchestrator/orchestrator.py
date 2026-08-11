#!/usr/bin/env python3
"""Captain Adel — multi-agent orchestrator boilerplate (Python).

One lead orchestrator (claude-sonnet-5) decomposes a research question into
5–15 self-contained subtasks; a swarm of workers (claude-haiku-4-5, escalating
to claude-sonnet-5 for hard subtasks) executes them in parallel with isolated
contexts; a streamed synthesis pass reconciles the structured results.

Design doc: ../../docs/multi-agent-orchestrator.md
Mirror implementation: ./orchestrator.ts (same sections, same names)

Usage:
    pip install -r requirements.txt
    export ANTHROPIC_API_KEY=sk-ant-...
    python orchestrator.py                      # built-in demo question
    python orchestrator.py "your question" --concurrency 6

Deliberately decoupled from src/ — imports nothing from the Captain Adel
service; the brain stays portable. PDPL note: the Anthropic API is not served
in-Kingdom, so this pattern is dev/eval/authoring tooling only — never wire it
into the /v1/chat request path (see the design doc).
"""

from __future__ import annotations

import argparse
import asyncio
import json
import os
import random
import sys
from dataclasses import dataclass, field
from typing import Literal, Optional

import anthropic
from anthropic import AsyncAnthropic
from pydantic import BaseModel

# ---------------------------------------------------------------------------
# Constants — models, budgets, pricing
# ---------------------------------------------------------------------------

ORCHESTRATOR_MODEL = "claude-sonnet-5"   # decompose + synthesize
WORKER_MODEL = "claude-haiku-4-5"        # difficulty: standard
ESCALATION_MODEL = "claude-sonnet-5"     # difficulty: hard

# Sonnet 5 runs adaptive thinking by default and max_tokens caps thinking AND
# text together — that is why every Sonnet call gets more headroom than Haiku.
# `output_config.effort` is a further Sonnet tuning lever; it is deliberately
# not sent anywhere here because it ERRORS on claude-haiku-4-5.
DECOMPOSE_MAX_TOKENS = 8192
WORKER_MAX_TOKENS_HAIKU = 4096
WORKER_MAX_TOKENS_SONNET = 8192
SYNTH_MAX_TOKENS = 16000

DEFAULT_CONCURRENCY = 8   # in-flight workers; tune 5–15
SUBTASK_MIN, SUBTASK_MAX = 5, 15
WORKER_TIMEOUT_S = 120.0  # Python SDK timeouts are SECONDS (TS SDK: milliseconds)
RETRY_BASE_S = 2.0        # one app-level retry with jitter, on top of SDK retries

# $/MTok, standard tier. Cache read = 0.1x input; cache write (5m TTL) = 1.25x.
# claude-sonnet-5 has introductory pricing ($2/$10) through 2026-08-31; the
# ledger uses the standard sticker so estimates err high.
PRICING = {
    "claude-sonnet-5": {"in": 3.00, "out": 15.00},
    "claude-haiku-4-5": {"in": 1.00, "out": 5.00},
}

DEMO_QUESTION = (
    "Should Gulf Regional Airways electrify its ground-support equipment fleet "
    "over the next five years, and if so, how should it sequence the transition?"
)

# The shared, cacheable context pack. In production this is what a retrieval
# layer returns for the run's question (for Captain Adel: src/brain/retrieve.js
# — BM25 + parent-child expansion); here it is a small SYNTHETIC briefing so the
# demo runs with nothing but an API key. All figures are illustrative.
#
# Cache math, honestly: this pack is ~1.2K tokens — above claude-sonnet-5's
# 1024-token minimum cacheable prefix but BELOW claude-haiku-4-5's 4096, so the
# cache_control marker below is correct-by-construction yet silently inert on
# Haiku workers until the pack grows (a real retrieval pack clears 4096 easily).
CONTEXT_PACK = """CONTEXT PACK — Gulf Regional Airways, ground-support equipment (GSE) electrification briefing.
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
"""

ORCH_SYSTEM = (
    "You are the lead orchestrator of a research swarm. Decompose the user's "
    f"question into {SUBTASK_MIN}-{SUBTASK_MAX} self-contained subtasks. Each "
    "worker sees ONLY the shared context pack and its own brief — never the "
    "other briefs — so every brief must stand alone and name the exact facet "
    "it owns. Assign role 'researcher' (extract and organize evidence), "
    "'analyst' (quantify, compare, model trade-offs), or 'critic' (attack "
    "assumptions, find risks and gaps). Mark difficulty 'hard' only where deep "
    "multi-step reasoning is genuinely required — hard subtasks cost ~3x. "
    "Cover the question fully; avoid overlapping briefs."
)

WORKER_SYSTEM = (
    "You are one worker in a research swarm. Complete ONLY your assigned brief. "
    "Ground every claim in the context pack; cite the bracketed section numbers "
    "like [3]. Anything not supported by the pack must be labeled an assumption "
    "in `notes` with confidence 0.5 or lower. Do not answer the overall "
    "question — deliver your facet only, concisely."
)

SYNTH_SYSTEM = (
    "You are the lead synthesizer of a research swarm. Reconcile the workers' "
    "JSON results into one markdown report: lead with the recommendation, then "
    "the evidence, real disagreements between workers, and open questions. "
    "Where subtasks failed, name them explicitly as coverage gaps. Use only "
    "the findings provided — invent nothing."
)

# ---------------------------------------------------------------------------
# Contracts — every cross-context payload is strict JSON
# ---------------------------------------------------------------------------

class Subtask(BaseModel):
    id: str
    role: Literal["researcher", "analyst", "critic"]
    difficulty: Literal["standard", "hard"]
    brief: str
    deliverable: str


class DecompositionPlan(BaseModel):
    subtasks: list[Subtask]


class Finding(BaseModel):
    claim: str
    confidence: float
    notes: str


class WorkerResult(BaseModel):
    subtask_id: str
    summary: str
    findings: list[Finding]
    open_questions: list[str]


@dataclass
class WorkerOutcome:
    subtask: Subtask
    result: Optional[WorkerResult] = None
    error: Optional[str] = None


def clamp_plan(plan: DecompositionPlan) -> DecompositionPlan:
    """Schemas guarantee shape; code guarantees invariants (cap + unique ids)."""
    seen: set[str] = set()
    for i, sub in enumerate(plan.subtasks):
        if not sub.id or sub.id in seen:
            sub.id = f"w{i + 1}"
        seen.add(sub.id)
    if len(plan.subtasks) > SUBTASK_MAX:
        plan.subtasks = plan.subtasks[:SUBTASK_MAX]
    if len(plan.subtasks) < SUBTASK_MIN:
        print(f"[orchestrator] note: only {len(plan.subtasks)} subtasks (asked for >= {SUBTASK_MIN})", file=sys.stderr)
    return plan


# ---------------------------------------------------------------------------
# Ledger — per-model token counters -> dollars
# ---------------------------------------------------------------------------

@dataclass
class Ledger:
    rows: dict = field(default_factory=dict)

    def add(self, model: str, usage) -> None:
        row = self.rows.setdefault(model, {"in": 0, "out": 0, "cache_read": 0, "cache_write": 0, "calls": 0})
        row["in"] += usage.input_tokens or 0
        row["out"] += usage.output_tokens or 0
        row["cache_read"] += getattr(usage, "cache_read_input_tokens", 0) or 0
        row["cache_write"] += getattr(usage, "cache_creation_input_tokens", 0) or 0
        row["calls"] += 1

    def cost(self, model: str) -> float:
        row, p = self.rows[model], PRICING[model]
        return (row["in"] * p["in"] + row["out"] * p["out"]
                + row["cache_read"] * 0.1 * p["in"] + row["cache_write"] * 1.25 * p["in"]) / 1e6

    def report(self) -> None:
        print("\n== usage ledger " + "=" * 47, file=sys.stderr)
        total = 0.0
        for model, row in self.rows.items():
            total += self.cost(model)
            print(f"  {model:<18} calls={row['calls']:<3} in={row['in']:<7} out={row['out']:<7} "
                  f"cache_read={row['cache_read']:<7} cache_write={row['cache_write']:<7} "
                  f"${self.cost(model):.4f}", file=sys.stderr)
        print(f"  {'TOTAL':<18} ${total:.4f}  (standard-tier list prices)", file=sys.stderr)


# ---------------------------------------------------------------------------
# Pipeline
# ---------------------------------------------------------------------------

def _retryable(err: Exception) -> bool:
    """429/5xx, network failures, and parse noise earn one more try; other 4xx never do."""
    if isinstance(err, anthropic.APIStatusError):
        return isinstance(err, (anthropic.RateLimitError, anthropic.InternalServerError))
    return True  # APIConnectionError/timeouts, schema-validation failures


async def decompose(client: AsyncAnthropic, ledger: Ledger, question: str) -> DecompositionPlan:
    """Sonnet lead: question -> strict DecompositionPlan. One retry, then abort (it's the root)."""
    for attempt in (1, 2):
        try:
            resp = await client.messages.parse(
                model=ORCHESTRATOR_MODEL,
                max_tokens=DECOMPOSE_MAX_TOKENS,
                system=ORCH_SYSTEM,
                messages=[{"role": "user", "content": f"Question:\n{question}\n\nProduce the decomposition plan."}],
                output_format=DecompositionPlan,
            )
            ledger.add(ORCHESTRATOR_MODEL, resp.usage)
            if resp.parsed_output is None:
                raise ValueError("decomposition did not match the schema")
            return clamp_plan(resp.parsed_output)
        except Exception as err:  # noqa: BLE001 — classified below
            if attempt == 2 or not _retryable(err):
                raise
            await asyncio.sleep(RETRY_BASE_S + random.random() * RETRY_BASE_S)
    raise AssertionError("unreachable")


async def run_worker(client: AsyncAnthropic, ledger: Ledger, sem: asyncio.Semaphore, subtask: Subtask) -> WorkerOutcome:
    """One isolated worker: system rules + cached pack + own brief. Nothing else."""
    hard = subtask.difficulty == "hard"
    model = ESCALATION_MODEL if hard else WORKER_MODEL
    max_tokens = WORKER_MAX_TOKENS_SONNET if hard else WORKER_MAX_TOKENS_HAIKU
    brief = (
        f"Your subtask (id: {subtask.id}, role: {subtask.role}):\n{subtask.brief}\n\n"
        f"Deliverable: {subtask.deliverable}\n\n"
        f"Set subtask_id to \"{subtask.id}\" in your result."
    )
    async with sem:
        for attempt in (1, 2):
            try:
                resp = await client.with_options(timeout=WORKER_TIMEOUT_S).messages.parse(
                    model=model,
                    max_tokens=max_tokens,
                    # Byte-identical prefix across workers = the prompt-cache unit.
                    # Only the user brief below varies. Caches are per-model.
                    system=[
                        {"type": "text", "text": WORKER_SYSTEM},
                        {"type": "text", "text": CONTEXT_PACK, "cache_control": {"type": "ephemeral"}},
                    ],
                    messages=[{"role": "user", "content": brief}],
                    output_format=WorkerResult,
                )
                ledger.add(model, resp.usage)
                result = resp.parsed_output
                if result is None:
                    raise ValueError("worker output did not match the schema")
                result.subtask_id = subtask.id  # trust the task ledger, not the model
                for f in result.findings:
                    f.confidence = min(1.0, max(0.0, f.confidence))
                print(f"[worker {subtask.id}] done ({model}, {len(result.findings)} findings)", file=sys.stderr)
                return WorkerOutcome(subtask, result=result)
            except Exception as err:  # noqa: BLE001 — classified below
                if attempt == 2 or not _retryable(err):
                    print(f"[worker {subtask.id}] FAILED: {type(err).__name__}: {err}", file=sys.stderr)
                    return WorkerOutcome(subtask, error=f"{type(err).__name__}: {err}")
                await asyncio.sleep(RETRY_BASE_S + random.random() * RETRY_BASE_S)
    raise AssertionError("unreachable")


async def fan_out(client: AsyncAnthropic, ledger: Ledger, plan: DecompositionPlan, concurrency: int) -> list[WorkerOutcome]:
    """Warm-first: worker #1 runs alone and writes the prompt cache; the other
    N-1 then fan out under the semaphore and read it. (Production refinement:
    warm-first per model tier, since caches are per-model.)"""
    sem = asyncio.Semaphore(concurrency)
    first, rest = plan.subtasks[0], plan.subtasks[1:]
    outcomes = [await run_worker(client, ledger, sem, first)]
    outcomes += list(await asyncio.gather(*(run_worker(client, ledger, sem, s) for s in rest)))
    return outcomes


async def synthesize(client: AsyncAnthropic, ledger: Ledger, question: str, outcomes: list[WorkerOutcome]) -> str:
    """Sonnet synthesis over worker RESULTS only (never transcripts), streamed."""
    ok = [o for o in outcomes if o.result is not None]
    failed = [o for o in outcomes if o.result is None]
    results_json = json.dumps([o.result.model_dump() for o in ok], indent=2)
    gaps = ("none" if not failed else
            "; ".join(f"{o.subtask.id} ({o.subtask.role}: {o.subtask.brief[:80]}...) -> {o.error}" for o in failed))
    user = (
        f"Original question:\n{question}\n\n"
        f"Worker results (JSON):\n{results_json}\n\n"
        f"Failed subtasks — name these as coverage gaps in the report: {gaps}"
    )
    async with client.messages.stream(
        model=ORCHESTRATOR_MODEL,
        max_tokens=SYNTH_MAX_TOKENS,
        system=SYNTH_SYSTEM,
        messages=[{"role": "user", "content": user}],
    ) as stream:
        async for text in stream.text_stream:
            print(text, end="", flush=True)
        final = await stream.get_final_message()
    print()
    ledger.add(ORCHESTRATOR_MODEL, final.usage)
    return "".join(block.text for block in final.content if block.type == "text")


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

async def run(question: str, concurrency: int) -> None:
    client = AsyncAnthropic()  # reads ANTHROPIC_API_KEY / ANTHROPIC_AUTH_TOKEN
    ledger = Ledger()
    try:
        plan = await decompose(client, ledger, question)
        print(f"[orchestrator] {len(plan.subtasks)} subtasks: "
              + ", ".join(f"{s.id}/{s.role}{'!' if s.difficulty == 'hard' else ''}" for s in plan.subtasks),
              file=sys.stderr)
        outcomes = await fan_out(client, ledger, plan, concurrency)
        if not any(o.result for o in outcomes):
            ledger.report()
            sys.exit("every worker failed — aborting before synthesis")
        await synthesize(client, ledger, question, outcomes)
    finally:
        ledger.report()


def main() -> None:
    parser = argparse.ArgumentParser(description="Multi-agent orchestrator boilerplate (see docs/multi-agent-orchestrator.md)")
    parser.add_argument("question", nargs="?", default=DEMO_QUESTION, help="research question (default: built-in demo)")
    parser.add_argument("--concurrency", type=int, default=DEFAULT_CONCURRENCY, help="max in-flight workers (default 8)")
    args = parser.parse_args()
    if not (os.environ.get("ANTHROPIC_API_KEY") or os.environ.get("ANTHROPIC_AUTH_TOKEN")):
        sys.exit("Set ANTHROPIC_API_KEY (or ANTHROPIC_AUTH_TOKEN) first — a demo run costs roughly $0.05-0.15.")
    asyncio.run(run(args.question, max(1, args.concurrency)))


if __name__ == "__main__":
    main()
