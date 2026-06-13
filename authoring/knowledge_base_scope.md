# Knowledge Base Scope

What Captain Adel can answer is bounded by what's in the library. This
document defines the corpus, how it gets ingested, and how to keep it
current.

---

## 1. Source corpus (what's in the workspace today)

The Fly GACA folder already contains the GACAR primary source material plus
the topical books. Captain Adel's grounding is anchored to these files.

### 1.1 GACARs — Parts (numerical regulation)

These are the binding regulations. Each PDF is one Part of the GACARs.

| Tier | Parts | Why |
|---|---|---|
| **T1 — Daily-use** | 1, 5, 11, 13, 21, 43, 61, 67, 91, 121, 125, 135, 141, 142, 145 | Most user questions touch these. Pilot certification (61), medical (67), general operating rules (91), airline ops (121), commuter & on-demand (135), pilot schools (141), training centers (142), maintenance (145), maintenance practices (43), aircraft certification (21), enforcement (13). |
| **T2 — Common** | 23, 25, 27, 29, 33, 34, 35, 36, 39, 45, 47, 48, 60, 64, 65, 66, 68, 71, 77, 91, 93, 97, 99, 100, 101, 103, 105, 107, 109, 115, 117, 119, 129, 133, 137, 138, 139, 143, 144, 147, 149, 151, 156, 157 | Type cert standards, airworthiness directives, registration, simulator qual, fatigue, foreign operators, parachute ops, aerodromes (139), unmanned, etc. Touched less often but still in scope. |
| **T3 — Specialist** | 170, 171, 172, 173, 175, 177, 179, 183, 193, 199 | ANS provider rules, ATS, AIS, MET, charts, accident reporting. Specialist territory; pull as needed. |
| **Reference** | Foreword, GACARs MAP, Change_History | Used to orient users to the structure and to surface what's recently changed. |

### 1.2 GACAR — Topical books (cross-cutting)

These are program-level documents that cut across multiple Parts. Treat them
as authoritative for the topic, but always cite the underlying Part(s) too.

- AERODROMES, HELIPORTS, VERTIPORTS AND WATER AERODROMES ADMINISTRATION
- AIR NAVIGATION SERVICES — CERTIFICATION & ADMINISTRATION
- AIR OPERATOR & AIR AGENCY — ADMINISTRATION
- AIR OPERATOR & AIR AGENCY — CERTIFICATION
- AIR OPERATOR — OPERATIONAL APPROVALS
- AIRCRAFT & EQUIPMENT — CERTIFICATION
- AIRMEN — CERTIFICATION
- AUTHORIZING DOCUMENTS
- CARBON OFFSETTING AND REDUCTION SCHEME FOR INTERNATIONAL AVIATION (CORSIA)
- COMPLIANCE ENFORCEMENT & RESOLUTION OF IDENTIFIED SAFETY DEFICIENCIES
- DESIGNEES — APPOINTMENT & MANAGEMENT
- FOREIGN AIR OPERATORS — AUTHORIZATION & ADMINISTRATION
- GENERAL GUIDANCE & INFORMATION
- GROUND SERVICES
- MISCELLANEOUS
- SAFETY MANAGEMENT SYSTEMS — GENERAL
- SURVEILLANCE
- UNMANNED AIRCRAFT SYSTEMS

### 1.3 Saudi-AIP / training corpus (added round 2)

A second corpus sits under `library/PDFs/saudi/`, `faa-general/`, and
`icao-doc-053/` — 132 PDFs sorted into the tree on commit `20e03ef`.
These are *reference* material, not regulation, and Adel can quote them
with the standard "verify against current AIP" caveat.

| Bucket | Contents | Use |
|---|---|---|
| `saudi/aip-enr/` | 20 ENR text pages (e.g. `ay2m1889` = ENR 3.3 RNAV) | Cite for airway tables, ENR rules. Always note publication date. |
| `saudi/aip-charts/` | 5 GACA charts + 1 aerodrome chart (Thumamah `file000778`) | Cite for sector layouts, chart sheets. |
| `saudi/saelpt/` | SAELPT examiner script (P01 verbatim) + G-TELP set 24 | Cite for English-proficiency exam content. |
| `saudi/` (root) | OL 57/21 (OERK↔OETH LoA), VFR Saudi, GACA Economic Regs, MET services, SUA areas | Operational reference outside the GACAR Parts. |
| `faa-general/` | Cessna 172N POH, ERAU PA-44, FAA FP forms, W&B handbook, PTS, oral guides | Training context only — never cite as regulation. |
| `icao-doc-053/` | 76 ICAO Doc 053 SN/VG/ER scenarios (procedural separation, lateral, ER) | Cite for ATC training. |

#### Round 3 — Pilot Documents fold-in (2026-05-31)

Added from `library/Pilot Documents/` into the reference shelf **and** this RAG
corpus (`functions/rag/_chunks.json.gz`, +421 chunks) via
`scripts/build_reference_docs.py` → `scripts/add-reference-entries.mjs` →
`scripts/add-rag-chunks.mjs`:

| Bucket | Contents | Use |
|---|---|---|
| Saudi eAIP (badge `Saudi AIP`) | 14 curated GEN/ENR sections from AIRAC AMDT 05/26 (eff 14 MAY 2026): GEN 2.1/2.2/3.3/3.4/3.6, ENR 1.1–1.7, ENR 2.1–2.2 | Cite for KSA airspace classes, VFR/IFR rules, altimetry, ATS/COM/SAR. **Always stamp AIRAC 05/26 + "verify current AIP".** |
| FAA (public domain) | Weight & Balance Handbook — MOSAIC Addendum (Oct 2025) | Training/reference; the 11 core FAA handbooks were already ingested. |

**Excluded by copyright (cite-only, NOT in RAG):** the Cessna 172N/P POHs &
Service Manual and ICAO Doc 7030 / SMM highlights are catalogued in the library
as cite-only cards (official-source links) — no body text, so nothing to cite.
The eAIP **charts** (AD 2 / ENR 6 PDFs) are image-only with no text layer and
remain cite-only links to the official eAIP.

### 1.4 Tool pages — when to recommend them

Adel should recommend a tool page when a user's question maps to one
of these interactive workflows. Each tool also accepts a primed prompt
back via `chat.html?q=<text>`, so the round-trip is bidirectional.

| Tool URL | Recommend when user asks about… |
|---|---|
| `/tools/airspace.html`     | Saudi sectors, ACC frequencies, FL bands, TMAs |
| `/tools/chart-symbols.html`| Chart symbology, what a navaid/airspace symbol means |
| `/tools/vfr.html`          | VMC mins, light-gun signals, distress freqs, transition altitude |
| `/tools/aerodromes.html`   | RWY data, ATIS, taxi, fuel, customs PPR for OERK/OEJN/OEDF/etc. |
| `/tools/loa.html`          | OERK ⇄ OETH training-area procedures, KIA radial entry |
| `/tools/flightplan.html`   | Filing an ICAO 2012 FPL, validating a route against KSA airways |
| `/tools/wb.html`           | W&B for Cessna 172N or Piper PA-44 Seminole |
| `/tools/metbrief.html`     | Pre-flight brief for a route, SUA crossings, CORSIA flag |
| `/tools/saelpt.html`       | English Proficiency exam prep (ICAO Level 4 / SAELPT) |
| `/tools/procsep.html`      | ATC procedural separation (ICAO Doc 053) — Duval scenarios |

Phrasing pattern: *"I'll walk you through it — open `/tools/wb.html`,
pick C172N, enter your numbers, and click the 'Ask Captain Adel'
button at the bottom and I'll diagnose your loading."*

### 1.5 Out of scope (today, by choice)

These are intentionally excluded from the v1 KB. Re-evaluate later.

- **Live operational data.** NOTAMs, current ATIS, METAR/TAF, real-time
  traffic. Adel points users at the official source. The static AIP
  excerpts in §1.3 are reference-grade only — flag publication date in
  every citation and remind users to verify against current AIRAC.
- **ICAO Annexes (full text).** Captain Adel can *reference* an Annex when
  GACAR adopts it, but the full Annex text is not ingested. If we want this
  later, ingest only the Annexes that GACAR adopts by reference (mostly
  Annex 1, 2, 6, 8, 11, 14, 17, 18, 19).
- **Type-specific AFM/POH/QRH.** Liability and copyright issues. Defer to
  the AFM/POH onboard.
- **Operator OMs / FCOMs / FCTMs.** Operator-proprietary; out of scope.
- **Training course material.** Could be added per partner.

---

## 2. Document model

Each PDF becomes a `Document` in the KB:

```
Document
├── doc_id            # stable, e.g. "gacar_part_91"
├── title             # "GACAR Part 91 — General Operating and Flight Rules"
├── source_path       # relative path in the workspace
├── doc_type          # part | topical | reference
├── tier              # T1 | T2 | T3 | reference
├── jurisdiction      # "KSA" (always, for v1)
├── version           # from Change_History; e.g. "v104"
├── effective_date    # from Foreword/Change_History
├── language          # "en" (KSA GACARs are English-of-record)
└── chunks[]
    ├── chunk_id      # "gacar_part_91:91.155:a-2"
    ├── section_path  # ["Subpart B", "§91.155", "(a)", "(2)"]
    ├── text          # cleaned text
    ├── citation      # display-ready: "GACAR Part 91, §91.155(a)(2)"
    ├── page_range    # for "open the PDF at page N"
    └── embedding     # vector for semantic retrieval
```

Two retrieval modes are supported off the same chunks:

1. **Semantic** — embedding similarity for "find me what's relevant."
2. **Citation lookup** — exact-match for "open §91.155 in Part 91."

---

## 3. Ingestion pipeline

A one-time job per PDF, re-run on version bumps.

```
┌────────────┐  ┌────────────┐  ┌────────────┐  ┌────────────┐  ┌────────────┐
│ PDF parse  │→ │  Section   │→ │   Clean    │→ │   Chunk    │→ │  Embed +   │
│ (PyMuPDF)  │  │  detect    │  │   (regex)  │  │  (section) │  │  upsert    │
└────────────┘  └────────────┘  └────────────┘  └────────────┘  └────────────┘
```

### 3.1 PDF parse — PyMuPDF (`fitz`)
Extract text per page with bounding boxes. Keep page numbers; we need them
for "open the PDF at page N" deeplinks.

### 3.2 Section detect
GACAR sections follow a predictable pattern: `§91.155`, `§121.471(b)(2)`,
subparts as `Subpart A`, etc. A regex pass over the text segments the
document into a tree.

### 3.3 Clean
Strip headers, footers, page numbers, "page N of M" stamps, the cover
watermark. Preserve tables as Markdown.

### 3.4 Chunk strategy
**Section-bounded chunks**, not fixed token windows. A chunk is one §X.YYY
or one logical subsection. This is the only way to keep citations honest —
if a chunk straddles two sections, you can't cite it.

Chunk sizes will vary (50 to 2000 tokens). Where a section is huge, split
on paragraph boundaries within it and number the sub-chunks
(`§121.471:p1`, `§121.471:p2`, …) — but the displayed citation still
points at the section.

### 3.5 Embed
`text-embedding-004` (Gemini) or `gemini-embedding-001` (newer). Store in:
- **v1** — local FAISS or LanceDB index, single file in the workspace.
- **v2** — Vertex AI Vector Search or pgvector on Cloud SQL when we have
  multiple users.

### 3.6 Upsert
On re-ingest of a Part (after a version bump), delete the doc's old chunks
and re-insert. The Change_History PDF tells us what changed.

---

## 4. Retrieval at query time

Three tools Captain Adel can call (defined as Gemini function-calling
schemas in `gemini_integration.md`):

1. `search_library(query, top_k=8, filter={tier?, part?, doc_type?})`
   — semantic search across chunks. Returns `[ {citation, text, page_url} ]`.
2. `lookup_citation(part, section)` — exact lookup. Use when the user names
   a section directly ("show me §91.155(c)").
3. `list_changes(since_version)` — read Change_History for what's new
   since version X.

The agent loop is:

1. User asks a question.
2. Captain Adel decides: do I need a lookup? (Most regulatory questions:
   yes.)
3. He calls `search_library` with a focused query.
4. He answers with the retrieved passages, quoting verbatim for any
   numerical limit and citing every claim.
5. If the user asks a follow-up like "open that in the PDF", the page_url
   in the chunk metadata routes to the existing PDF viewer in the Library
   HTML.

---

## 5. Refresh cadence

GACARs are revised periodically. The `Change_History-v104.pdf` is the
canonical changelog.

- **On user upload of a new Part PDF:** re-run ingestion for that file
  only. Other docs untouched.
- **On Change_History bump:** Captain Adel can volunteer "Part X was
  revised on [date] — here's what changed" to users who ask about Part X.
- **Quarterly check:** verify against gaca.gov.sa for any new Parts the
  workspace doesn't have yet.

---

## 6. Open questions

- **Arabic source material?** GACARs are published in English of record.
  If GACA also publishes Arabic translations and you want bilingual
  retrieval, we ingest both and tag by `language`. Today: English only.
- **AC / Advisory Circulars?** GACA AC equivalents (where they exist)
  would slot in nicely as a `doc_type: ac` tier. Decide whether to include.
- **Examiner handbooks / training course outlines?** Useful for student
  pilot questions but adds copyright and freshness concerns. Decide
  per-document.
- **POI letters / interpretations?** Internal-only. Likely never in the
  public KB.
