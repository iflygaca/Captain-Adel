# Captain Adel — response data contract (v1)

**Status:** proposal · gates the `GACAR.console` UI direction
**Owner surface:** `src/brain/answer.js` → `/v1/chat`
**Companion mockup:** [`docs/mockups/gacar-console.html`](mockups/gacar-console.html)

---

## Why this exists

The design-team critique of the `GACAR.console` direction landed one verdict repeatedly:
the UI's trust moves (a three-state grounding badge, deterministically-styled refusal
cards, an honest evidence rail) **write trust checks the backend can't yet cash.** The
console must never *render proof the system does not have.*

The good news, found by reading the actual code: **most of that proof is already computed
and then thrown away.**

| The UI needs… | …and the backend already has it |
|---|---|
| the verbatim cited passage | `retrieve()` holds `h.text` (sliced to 1200 chars) and the agentic tools hold `hit.text` — both discarded by `pushSource()` at [`retrieve.js:27`](../src/brain/retrieve.js#L27) / [`gemini.js:98`](../src/brain/providers/gemini.js#L98), which keeps only `{citation, url}` |
| Part + section, parsed | `REF_RE` ([`retrieve.js:17`](../src/brain/retrieve.js#L17)) and `extractCitations()` ([`citation-faithfulness.js:69`](../evals/checks/citation-faithfulness.js#L69)) already parse `Part 91 §91.155(a)(2)` |
| a deep-link anchor | `h.page_url` already carries a `#…` fragment (pushSource even strips a trailing `-N`) |
| a **server-authoritative grounding verdict** | `scoreAnswer()` ([`citation-faithfulness.js:319`](../evals/checks/citation-faithfulness.js#L319)) returns per-claim `yes\|partial\|no` and a 0–1 score, and it **accepts `citedTexts`** so it does not need to re-resolve from the corpus — it can run on the passages `retrieve()` already gathered |

So v1 is *surfacing what's in memory*, not building new machinery. The one genuinely new
thing — a machine-readable **refusal class** — is phased (heuristic now, model-emitted next).

---

## The v1 response shape

Returned by `answer()` and serialized at `/v1/chat`. **Fully additive** — `answer` and
`sources[].{citation,url}` are unchanged, so the current `chat.js` keeps working untouched;
the console reads the new fields.

```jsonc
{
  "answer": "…markdown, unchanged…",

  // NEW — server-authoritative, never derived from "a cite is present"
  "kind": "grounded" | "partial" | "refusal" | "na",
  "refusalClass": "1.1" | "1.2" | "1.3" | "2.1" | "2.2" | "2.3"
                 | "3.1" | "3.2" | "3.3" | null,   // taxonomy id; null unless kind==="refusal"

  "grounding": {                       // NEW
    "state": "grounded" | "partial" | "refusal" | "na",
    "mode":  "structural" | "declared" | "faithfulness",   // which signal produced `state` (see below)
    "score": 0.0,                      // faithfulness 0–1; null in structural mode / when N/A
    "claims": [                        // drives the evidence rail; [] when N/A
      { "claim": "3 SM flight visibility…", "verdict": "yes" }  // verdict null in structural mode
    ],
    "resolved":   ["GACAR Part 91, §91.155(a)"],   // cites that resolved to corpus text
    "unresolved": []                                // cites that did NOT — fabrication signal
  },

  "sources": [                         // WIDENED (first two keys unchanged)
    {
      "citation":      "GACAR Part 91, §91.155(a)",
      "url":           "library.html#91.155",
      "part":          "91",                 // NEW
      "section":       "91.155(a)",          // NEW
      "sectionAnchor": "91.155",             // NEW — fragment for the Source-pane snap
      "verbatim":      "…exact passage text…",// NEW — the text retrieve already held
      "corpusVersion": "AIRAC 2505"          // NEW — as-of line (kills false confidence vs amended GACAR)
    }
  ],

  "meta": { "provider": "gemini", "model": "gemini-2.5-flash" }  // optional
}
```

### Field → UI binding (every field maps to a thing on the card)

| Field | Card element |
|---|---|
| `kind` | the three-state badge color + meter (grounded=sage, partial=amber, refusal=amber-distinct) |
| `grounding.state` / `.score` | badge label + the `grounding 0.50 · 1/2` stamp |
| `grounding.claims[].verdict` | per-claim evidence rail (phase 2 inline cite-scrub) |
| `grounding.unresolved` | a "cited but not found in corpus" warning — the fabrication tell |
| `sources[].verbatim` | the **Source pane** passage + the "Regulation reads" block |
| `sources[].sectionAnchor` | the lockstep snap target + `Open the full section ↗` deep-link |
| `sources[].corpusVersion` | the `corpus AIRAC 2505` as-of line |
| `refusalClass` | the `refusal · unverifiable-limit · §1.1` class tag + which "where to verify" actions to show |

---

## How `kind` is derived (the anti-overclaim rule)

There are two modes, and `grounding.mode` always says which one produced the verdict.

**`structural` (default — what ships, zero extra API calls).** `kind` is derived from
whether the answer's regulatory claims are *cited* and whether those cites *resolved to
retrieved corpus text*:

```
if (refusal detected)                 -> "refusal"   (+ refusalClass)
else if (no regulatory claims)        -> "na"
else if (every cite resolved & ≥1 cite)-> "grounded"
else                                  -> "partial"   (uncited claim, or cite not in corpus)
```

This catches fabricated cites and uncited numbers. It does **not** catch a *cited-but-wrong*
number — only the judge does. It runs as pure regex over the answer + a set-lookup over
`sources`, so it adds no latency and no API calls. This is the default precisely because the
live Gemini key is rate-limited (free tier ≈ 5 RPM) and a per-claim judge call on every turn
would blow that budget.

**`faithfulness` (opt-in — `opts.grounding:'faithfulness'` or `ADEL_GROUNDING=faithfulness`).**
Additionally runs the eval faithfulness judge over the passages already in hand, and
**downgrades** `grounded → partial` when any claim is judged `no`/`partial`. It lazy-requires
the eval module and **degrades back to structural** if the module or an API key is missing —
verified: a live turn never throws on this path. Use it offline, in CI, or behind a paid key.

In **both** modes the anti-overclaim invariant holds — full sage (`grounded`) is reserved for
*all-claims-supported*; one unsupported/uncited claim ⇒ amber `partial`. The judge-based rule
below is the `faithfulness`-mode refinement:

```
claims = splitClaims(answer)                       // existing
ground = scoreAnswer({ answer, sources, citedTexts: sources.map(s => s.verbatim) })

if (isRefusal(answer))                 -> kind = "refusal"   // see refusalClass below
else if (claims.length === 0)          -> kind = "na"        // greeting / non-regulatory
else if (every claim verdict === "yes")-> kind = "grounded"  // full sage ONLY here
else                                   -> kind = "partial"   // any no/partial -> amber
```

Full sage is reserved for *all-claims-supported*. One unsupported claim ⇒ amber. A cite
that doesn't resolve to corpus text lands in `grounding.unresolved` and forces at most
`partial`. **Teal (`#4A9CB8`) is never used for this** — it stays the link/focus color
(it's already the site-wide link color, so "teal = verified" was unenforceable anyway).
The grounded signal is **sage** (`--falcon-sage`), giving a clean green-vs-amber polarity.

---

## How `refusalClass` is derived — phased honestly

The critics are right that refusals arrive as **freeform markdown with no machine-readable
field**, so a deterministic refusal card can't be driven from prose alone. Two phases:

**Phase 1 (ships now, heuristic):** reuse `HEDGE_RE` ([`citation-faithfulness.js:167`](../evals/checks/citation-faithfulness.js#L167))
to detect *that* a turn is a refusal, then a small keyword classifier maps it to a taxonomy
id from [`refusal-taxonomy.md`](refusal-taxonomy.md) (e.g. "can't verify that figure" + a
unit → `1.1`; "no such Part" → `1.2`; "fly the aircraft / declare to ATC" → `3.1`). Good
enough to *style* the card; **not** trusted for safety-critical routing.

**Phase 2 (robust, model-emitted) — SHIPPED.** `system-prompt.js` instructs the model to end
every reply with a machine-readable trailer the server strips before display or scoring:

```
…visible answer…
<<adel kind=refusal class=1.1>>
```

`stripMetaTrailer()` parses and removes it (defense-in-depth: *every* occurrence is removed,
not just the end one, so a misplaced trailer never leaks). The declared verdict drives `kind`
deterministically, set by the model that actually made the decision — `grounding.mode` reads
`declared`. It degrades cleanly: a missing or malformed trailer falls back to the structural
heuristic, exactly as before.

**Authority split (the merge rule).** Intent-level verdicts (`refusal`, `na`) are the model's
to declare — the judge can't infer them — so a declared trailer is authoritative there. The
substantive `grounded`-vs-`partial` verdict is the **most conservative** of every available
signal (structural · declared · faithfulness): `grounded` only if all agree, any `partial`
wins. No signal can upgrade past another — the anti-overclaim invariant holds even when the
model declares `grounded`.

---

## Concrete change against the backend

### 1 · Widen the source objects — `retrieve.js` and `gemini.js`

Both files have an identical `pushSource`. Replace the body so it carries the passage and
the parsed ref (the inputs are already in hand at every call site):

```diff
-function pushSource(sources, seen, citation, url) {
-  if (!citation && !url) return;
-  let anchor = String(url || '');
-  if (anchor.includes('#')) anchor = anchor.replace(/-\d+$/, '');
-  const key = (citation ? citation.trim().toLowerCase() : '') + '|' + anchor;
-  if (seen.has(key)) return;
-  seen.add(key);
-  sources.push({ citation: citation || url, url: url || '' });
-}
+const REF = /\bpart\s+(\d+)\b[^0-9]{0,12}§?\s*(\d+\.\d+(?:\.\d+)?(?:\([^)]*\))?)/i;
+function pushSource(sources, seen, citation, url, text, version) {
+  if (!citation && !url) return;
+  let anchor = String(url || '');
+  if (anchor.includes('#')) anchor = anchor.replace(/-\d+$/, '');
+  const key = (citation ? citation.trim().toLowerCase() : '') + '|' + anchor;
+  if (seen.has(key)) return;
+  seen.add(key);
+  const m = REF.exec(String(citation || ''));
+  const frag = anchor.includes('#') ? anchor.split('#')[1] : (m ? m[2] : null);
+  sources.push({
+    citation: citation || url,
+    url: url || '',
+    part: m ? m[1] : null,
+    section: m ? m[2] : null,
+    sectionAnchor: frag || null,
+    verbatim: text ? String(text).slice(0, 600) : null,
+    corpusVersion: version || null,
+  });
+}
```

Then pass the passage at each call site (the hit already has it):

```diff
// retrieve.js  (inside the loop)
-    pushSource(sources, seen, h.citation, h.page_url);
+    pushSource(sources, seen, h.citation, h.page_url, h.text, h.version);

// gemini.js  runTool: search_library / lookup_citation / list_changes
-      for (const h of hits) pushSource(sources, seen, h.citation, h.page_url);
+      for (const h of hits) pushSource(sources, seen, h.citation, h.page_url, h.text, h.version);
-      if (hit && hit.found) pushSource(sources, seen, hit.citation, hit.page_url);
+      if (hit && hit.found) pushSource(sources, seen, hit.citation, hit.page_url, hit.text, hit.version);
```

> `h.version` is best-effort — if the corpus chunks don't carry a version field yet,
> `corpusVersion` is `null` and the as-of line simply hides. No hard dependency.

### 2 · Attach grounding + kind — `answer.js`

Wrap the return of `answer()` so every turn gets the discriminator. The faithfulness module
is reused as-is, fed the passages we just surfaced (no corpus re-resolution, no extra
retrieval):

```js
const { scoreAnswer } = require('../../evals/checks/citation-faithfulness');
const { classifyRefusal, stripMetaTrailer } = require('./refusal');   // small new helper

async function decorate({ answer, sources }, opts) {
  const { kind: trailerKind, refusalClass: trailerClass, answer: clean } =
    stripMetaTrailer(answer);                       // phase 2: <<adel kind=… class=…>>

  const citedTexts = sources.map(s => s.verbatim).filter(Boolean);
  const g = await scoreAnswer({ answer: clean, sources, citedTexts },
                              { apiKey: opts.apiKey });   // judge is cached + thinking-off

  let kind = trailerKind;
  let refusalClass = trailerClass || null;
  if (!kind) {                                      // phase 1 fallback
    const ref = classifyRefusal(clean);             // HEDGE_RE + taxonomy keyword map
    if (ref)                       { kind = 'refusal'; refusalClass = ref; }
    else if (!g.claims.length)       kind = 'na';
    else if (g.claims.every(c => c.verdict === 'yes')) kind = 'grounded';
    else                             kind = 'partial';
  }

  return {
    answer: clean, kind, refusalClass,
    grounding: {
      state: kind === 'na' ? 'na' : (kind === 'grounded' ? 'grounded'
            : kind === 'refusal' ? 'refusal' : 'partial'),
      score: g.score,
      claims: g.claims.map(c => ({ claim: c.claim, verdict: c.verdict })),
      resolved: g.evidence.resolved,
      unresolved: g.evidence.unresolved,
    },
    sources,
    meta: { provider: opts._provider, model: opts.model },
  };
}
```

Call it at the two return points of `answer()` (the happy path and the fallback path).
`scoreAnswer` adds **one** judge call per *claim*; it's cached on `(model,passage,claim)`
and runs with `thinkingBudget:0`, so a typical 1–3-claim answer adds negligible latency.
For a zero-claim turn (greeting, pure refusal) it short-circuits to `score:null` with **no**
judge call.

### 3 · New tiny helper — `src/brain/refusal.js`

```js
const HEDGE = require('../../evals/checks/citation-faithfulness'); // reuse HEDGE_RE via a small export
// classifyRefusal(text) -> taxonomy id | null   (keyword map from refusal-taxonomy.md)
// stripMetaTrailer(text) -> { answer, kind, refusalClass }   (parses <<adel …>> if present)
```

(Export `HEDGE_RE` from the faithfulness module, or copy the one line — it's already the
tested source of truth for "is this sentence a hedge.")

---

## Phasing (never render proof you don't have)

| | Ships on | Backed by |
|---|---|---|
| **v1** citation header · three-state badge · whole-card grounding score · full-section Source pane · verify stamp · corpus as-of | this contract (widened response) | data that exists today |
| **v2** per-claim inline cite-scrub · the bidirectional evidence rail · deterministic §3.x handoff auto-routing | the `<<adel …>>` trailer + per-claim `passage offsets` | one prompt line + claim→passage mapping (the faithfulness module already pairs claim↔verdict; offsets are the only new bit) |

The console UI is built to **degrade cleanly**: with v1 data it shows card-level grounding
and a whole-section source snap; the per-claim rail simply isn't drawn until v2 fills
`grounding.claims[].offset`.

---

## Risks this contract closes (mapped to the critique)

- **Binary "verified" overclaim** → `kind` is the faithfulness verdict; full sage only when every claim is `yes`.
- **Teal collision** → grounded signal is **sage**, teal stays links/focus.
- **Refusal has no machine-readable field** → phase-2 `<<adel kind class>>` trailer (heuristic stopgap meanwhile).
- **Evidence rail outruns the data** → `verbatim`/`claims` ship in v1; per-claim offsets gated to v2.
- **Corpus vs gaca.gov.sa drift** → `corpusVersion` per source → the as-of line.
- **Bidi** → the contract keeps `section`/`sectionAnchor` as bare tokens; the client wraps every cite in `<bdi dir="ltr" lang="en">` (see the mockup) so `§91.155(a)(2)` never scrambles in RTL.
```
