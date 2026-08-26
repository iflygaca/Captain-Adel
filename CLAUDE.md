# CLAUDE.md — ay2m/Captain-Adel

Guidance for Claude Code in the Captain Adel flight instructor service repository.

## Repository Context

**ay2m/Captain-Adel** is the AI flight instructor service:
- **Delivery:** Cloud Run (me-central2 Dammam), standalone captadel.com domain
- **Instructor Persona:** Warm, challenging, culturally aware (Saudi); mastery-based progression
- **Data:** Learner profiles (PDPL-compliant), flight-hour tracking, curriculum progress, evaluation metrics
- **Curriculum:** GACAR-aligned syllabi, mock exams, knowledge-retention measurement, aviation-safety-critical content
- **Integration:** Grounded in FlyGACA's regulatory corpus; feeds learner signals back to main platform

Governance, strategy, financial, and legal material live in the separate `ay2m/Office` repo.

## Shared Agents (from ay2m/Office)

All agents below are defined in `ay2m/Office/.claude/agents/` and available to this repo via the family contract
(`contracts/flygaca-family.json`, byte-identical across ay2m/Office, ay2m/FlyGACA, ay2m/Captain-Adel).

### Flight Service Agents

| Agent | Use it for | Tools |
| --- | --- | --- |
| `flight-curriculum-designer` | Syllabus design, mock exam scope, learner progression paths, safety-critical aviation content | Read, Write, Edit, Bash |
| `ml-instructor-trainer` | Model fine-tuning, instructor persona consistency, eval metrics, confusion detection | Read, Bash |
| `flight-data-pipeline-engineer` | Learner data ingestion, flight-hour tracking, currency calculation, PDPL compliance, anonymization | Read, Bash |
| `instructor-deployment-steward` | Cloud Run revision management, captadel.com hosting, webhook routing, version pinning, rollback procedures | Read, Bash |

### Cross-Repo Coordination Agents

| Agent | Use it for | Tools |
| --- | --- | --- |
| `operations-orchestrator` | Routes full-sync, feature-ship, compliance-audit, security-hardening, performance-sprint workflows across family | Read, Edit, Glob, Grep, Bash |
| `cross-repo-sync` | Verifies `contracts/flygaca-family.json` parity across three repos, synchronizes PRs | Read, Edit, Bash |
| `entity-facts-guardian` | Company facts consistency, IBAN/account protection in family contract | Read, Glob, Grep, Bash |

### Governance & Compliance Agents

| Agent | Use it for | Tools |
| --- | --- | --- |
| `ksa-compliance` | PDPL, ZATCA, data residency, learner-data audit, curriculum compliance review | Read, Write, Edit, Glob, Grep, Bash |
| `family-warden` | Family contract byte-identity, repo roster, cross-repo drift sweeps | Read, Edit, Glob, Grep, Bash |

## Workflows (from ay2m/Office/.claude/skills/operations/)

Triggered via slash commands from any repo; coordinate across all three:

| Workflow | Trigger | Participants | Purpose |
| --- | --- | --- | --- |
| `full-sync` | `/full-sync` (or weekly Sunday 18:00 UTC) | entity-facts-guardian, cross-repo-sync, governance-auditor | Verify Office ↔ FlyGACA ↔ Captain-Adel parity (entity facts, contract SHA, decision log) |
| `feature-ship` | `/feature-ship <name>` | flight-curriculum-designer, ml-instructor-trainer, ksa-compliance, cross-repo-sync | Coordinate curriculum feature across service, web, and docs |
| `compliance-audit` | `/compliance-audit` (or quarterly) | ksa-compliance, flight-data-pipeline-engineer | PDPL check, learner-data audit, flight-hour schema audit, breach procedure |
| `security-hardening` | `/security-hardening` | flight-data-pipeline-engineer, ksa-compliance | Data pipeline security, PDPL boundaries, encryption at rest |
| `performance-sprint` | `/perf-sprint` | ml-instructor-trainer, flight-data-pipeline-engineer | Model inference latency, learner-data throughput, curriculum-load performance |

## Conventions & Constraints

### Data Residency & PDPL

- **Data residency:** `me-central2` Dammam only — never `me-central1` (Doha, not PDPL-safe)
- **Learner data:** Name, email, progress only. No passport, address, biometrics, voice recordings, or face data
- **Flight-hour log:** Timestamp, duration, aircraft type, instructor name, exam module — no flight route details, no ADS-B data
- **Audit trail:** Immutable, encrypted at rest, includes who/what/when/why for all mutations
- **Retention:** Learner data 2–7 years post-completion per engagement; deleted or anonymized upon right-to-be-forgotten request
- **Right to be forgotten:** Deletion procedure exists and tested; anonymization preserves aggregate metrics
- **External inference:** Gemini API runs outside Kingdom (US/EU) — **open risk**, documented in curriculum, not hidden

### Curriculum & Pedagogy

- **GACAR alignment:** Every learning objective and exam question cites GACAR section; never fabricate regulations
- **Corpus tiers:**
  - **HOST_SAFE_CORE:** Can appear on learning interface and exam (vetted, approved)
  - **HOST_ORIGINAL:** Can appear in study materials but not public (proprietary instructor notes)
  - **DO_NOT_HOST:** Cite only (external links, reference books, advisory circulars)
- **AIRAC freshness:** Effective date + 28 days for content staleness; 7-day buffer for updates (35-day threshold)
- **Mock exam design:** Three-tier progression (knowledge-check → skill-check → performance-check); mastery gates per level
- **Knowledge retention:** Spaced-repetition schedule (1d, 3d, 7d, 30d); confusion detection flags topics for re-teaching
- **Safety-critical content:** Marked explicitly; never simplified or speculated; backed by SOP references

### Model & Persona

- **Warm, challenging Saudi persona:** Encourages mastery; does not patronize; culturally aware (prayer times, holidays, values)
- **Confusion detection:** Tracks conceptual gaps across attempts; re-teaches via analogy or first-principles
- **Progression gating:** Learner cannot advance without demonstrating mastery (≥80% on skill-checks)
- **Feedback loop:** Learner interactions → confusion signals → curriculum refinement (monthly review)
- **Model fine-tuning:** Performed on curated mastery and confusion data; never on raw learner responses (PDPL safe)

### Flight Data Tracking

- **Flight-hour schema:** `date | duration_minutes | aircraft_type | instructor_id | module | notes`
  - `aircraft_type`: e.g., "Cessna 172", "Diamond DA40", "Piper PA-28"
  - `module`: e.g., "ELPT", "AIP", "PPL" (exam module learner is training for)
  - `notes`: Instructor feedback (kept minimal, anonymized in aggregate reports)
- **Currency calculation:** Rolling 12-month flight-hour total; regulatory currency per exam module
- **No external flight-ops data:** Do not pull from flight-tracking APIs, ADS-B, or airline crew systems
- **No voice/audio:** Instructor-learner conversations never recorded; interaction logged as text-only event markers

### API & Backend Security

- **Parameterized queries:** Always — no SQL concatenation
- **HttpOnly JWT:** Tokens never in localStorage or URLs; always secure, httpOnly flags
- **Server-owned entitlements:** Backend verifies learner enrollment, module access; frontend never trusts roles
- **Error responses:** Generic to client — no stack traces, SQL errors, schema details
- **CORS whitelist:** `captadel.com` + FlyGACA domain only; never `*`
- **Rate limiting:** Brute-force protection on auth endpoints (10 failed auth per 15min per IP)
- **Inference isolation:** Gemini API calls logged but never echo learner PII in request/response logs

### Infrastructure

- **Cloud Run:** me-central2 Dammam region only; auto-scaling 0–10 instances; 60s timeout for inference
- **Database:** Cloud SQL PostgreSQL; Unix socket only (no public IP); automated daily backups encrypted at rest
- **Secrets:** Service account keys in Secret Manager; never committed to repo; rotated quarterly
- **Monitoring:** Cloud Logging + Cloud Trace for inference latency, learner-data throughput; alerts on PDPL-boundary violations

## When to Use Each Agent

- **Designing syllabus or mock exam?** → `flight-curriculum-designer` for mastery gates, GACAR alignment, safety-critical markers
- **Fine-tuning instructor model?** → `ml-instructor-trainer` for persona consistency, eval metrics, confusion-signal handling
- **Ingesting flight-hour logs or learner data?** → `flight-data-pipeline-engineer` for PDPL schema, currency calculation, anonymization
- **Deploying new service version?** → `instructor-deployment-steward` for Cloud Run revision, webhook routing, rollback
- **Cross-repo curriculum feature (e.g., new PPL mock exam)?** → `/feature-ship <name>` to coordinate curriculum design → model training → FlyGACA integration → docs
- **Quarterly compliance check?** → `/compliance-audit` for PDPL, learner-data audit, flight-hour schema review
- **Data pipeline or model security review?** → `/security-hardening` for encryption, PDPL boundary checking, inference isolation
- **Model latency or data throughput issues?** → `/perf-sprint` for inference optimization, learner-data ETL tuning, curriculum-load profiling

## Repo Structure & CI

### Files in Scope

- `src/` — Instructor service (Node.js or Python), instructor persona, model fine-tuning config
- `data/` — Curriculum metadata, mock exam definitions, learner progression schemas
- `migrations/` — Database schemas (forward-only), learner-data audit trail setup
- `tests/` — Unit tests for data pipeline, model inference, curriculum gates, PDPL compliance
- Linting, type-checking, test suite via `npm run` or equivalent

### Files Out of Scope

- Governance, strategy, financial, legal, HR material → see `ay2m/Office`
- Product code, web app, API backend → see `ay2m/FlyGACA`

### CI Gates

- Linting & type-checking (`npm run lint`, `npm run type-check`)
- Unit tests (`npm test`)
- Family contract parity (`tests/family-contract.test.js`)
- PDPL compliance audit (data-schema validation, no PII in logs)

## See Also

- **Family context & strategy:** [`ay2m/Office/00-strategy/the-book-of-fly-gaca.html`](https://github.com/ay2m/Office/blob/main/00-strategy/the-book-of-fly-gaca.html)
- **GACAR curriculum specs:** [`ay2m/Office/10-academy-curriculum/`](https://github.com/ay2m/Office/blob/main/10-academy-curriculum/)
- **Compliance & PDPL:** [`ay2m/Office/04-compliance-ksa/`](https://github.com/ay2m/Office/blob/main/04-compliance-ksa/)
- **Agent workforce plan:** [`ay2m/Office/06-operations-it/agent-workforce-plan.md`](https://github.com/ay2m/Office/blob/main/06-operations-it/agent-workforce-plan.md)
- **Family contract:** [`ay2m/Office/contracts/flygaca-family.json`](https://github.com/ay2m/Office/blob/main/contracts/flygaca-family.json)
- **FlyGACA integration:** [`ay2m/FlyGACA/CLAUDE.md`](https://github.com/ay2m/FlyGACA/blob/main/CLAUDE.md)
