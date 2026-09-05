# Captain Adel — brand & presentation audit (August 2026)

A multi-angle audit of how the project presents across **GitHub** (`ay2m/Captain-Adel` + the org),
**the web** (captadel.com, audited from `landing/` + `public/` source and search-engine footprint —
the live site is not reachable from the audit sandbox), and **Hugging Face** (`flygaca`).
Audience assumed: pilots, aviation enthusiasts, and developers evaluating the maker's work.

> One correction up front: captadel.com is **Vite 7 + React 19 + Tailwind** (landing) plus a
> vanilla bilingual HTML/JS app (`public/`) — not Astro. Worth fixing anywhere the stack is
> described externally (CV, LinkedIn, bios).

> This audit's action items are sequenced into [`ROADMAP.md`](../ROADMAP.md)'s
> **🪧 Now/Next — brand & public presence** track — check there for current status.

## Scorecard

| Surface | First impression today | Verdict |
| --- | --- | --- |
| **Repo internals** (README, ROADMAP, docs/, evals, CI) | Excellent — among the best-documented solo repos of this size | 🟢 Strong |
| **Repo reach** | **Private.** Portfolio value to outsiders ≈ zero; every public link to it 404s | 🔴 Blocker |
| **GitHub org page** | Verified domain + socials, but no profile README, no pinned repos, flagship product invisible | 🟡 Underused |
| **captadel.com landing** | Polished, bilingual, genuinely good SEO (hreflang, OG, JSON-LD FAQ) | 🟢 Strong |
| **captadel.com link graph & SERP** | Footer links 404, stale ghost URLs indexed, no og:image on app pages, no human/About | 🟡 Leaky |
| **Hugging Face** | Three **empty scaffolds** public since 29 May — no weights, no data, broken Space | 🔴 Harmful |

The pattern: **the private repo is where all the credibility lives, and the public surfaces are
where all the placeholders live.** Visitors see exactly the inverse of the real quality.

---

## Findings by surface

### 1. GitHub

**What's genuinely strong** (keep and showcase): the README (identity, disclaimer, directory map,
API contract, models table, family table), `ROADMAP.md` (Now/Next/Later with an eval-gated
principle), `docs/` (runbooks, refusal taxonomy, data contract), a real eval harness (83 EN+AR
cases with a parity gate), and a thoughtful CI posture (keyless PR gate, weekly live eval,
report-only coverage/audit, gated deploy with health check).

**Gaps:**

- **The repo is private** while three public surfaces link to it: the landing footer
  ("Squadron" → `github.com/ay2m/Captain-Adel`), the landing JSON-LD `sameAs`, and the README
  of the HF model (indirectly). Every one of those is a 404 for your audience. This is the single
  highest-leverage fact in the audit — see Strategic #1.
- **Badges are broken for everyone**: shields.io cannot read private repos, so the README's CI
  badge renders as an error chip even for collaborators.
- **Repo "About" typo**: description ends "…and *power* the Fly GACA API" → "powers". Set the
  homepage to `https://captadel.com` and add topics
  (`rag`, `llm`, `aviation`, `saudi-arabia`, `arabic-nlp`, `bm25`, `gacar`, `bilingual`, `express`, `gemini`).
- **Stale README section**: "Promotion to its own repo" still describes splitting a
  `captadel/` subtree out of `flygaca/flygaca` — the split already happened (this repo exists,
  created June 2026). Delete the section; it reads as if the repo is a mirror of somewhere else.
- **Family-table link rot**: of the repos listed, only `ay2m/FlyGACA` and
  `ay2m/FlyGACA-ios` are publicly visible today. `ay2m/Office` and the
  per-app metadata repos 404 for outsiders. Either annotate them (`*private*`) or link only what
  resolves.
- **Missing community files**: no `CONTRIBUTING.md`, no `SECURITY.md`, no issue/PR templates.
  For a proprietary repo the point isn't accepting PRs — it's signaling intentionality, and
  (for SECURITY.md) giving researchers a disclosure channel for a service that **handles live
  payments**. Templates in the appendix.
- **Hygiene signals**: 7 open Dependabot PRs (#32–#38, incl. the `express` 4→5 and
  `firebase-admin` 12→14 majors), and GitHub currently reports **43 open dependency alerts on `main`
  (27 high, 15 moderate, 1 low)** — mostly transitive and invisible to visitors while private,
  but the *first* thing a reviewer sees if the repo goes public. No releases/tags, no branch
  protection visible.
- **Org page** (`github.com/FlyGACA`): verified `flygaca.com` domain and socials — good — but no
  org profile README, no pinned repos, and Captain Adel (the flagship) appears nowhere.

### 2. Web (captadel.com)

**What's strong:** bilingual path-driven EN/`/ar/` with real RTL, `hreflang` + canonical +
`x-default`, complete OG/Twitter meta on the landing, layered JSON-LD (WebSite, Organization,
**two FAQPage blocks with real GACAR answers** — great for AI-search citation), robots.txt +
sitemap.xml, `prefers-reduced-motion` discipline, the persistent GACA-independence disclaimer,
and a footer with the legal operator identity (CR/VAT). This is above the bar for indie product
sites.

**Gaps:**

- **Public 404s in the footer**: "FlyGACA / Captain-Adel" (private) and "The Book of Fly GACA"
  (`ay2m/FlyGACA`, not publicly visible). Your most engaged visitors — the developers you're
  targeting — are the ones who click these.
- **JSON-LD `sameAs` is thin and partly dead**: lists the private repo + flygaca.com only.
  Missing: `huggingface.co/flygaca`, `github.com/FlyGACA` (public org), LinkedIn, Instagram.
  `sameAs` is how Google/AI search stitch your entity together across surfaces.
- **Ghost SERP**: Google still indexes pre-relaunch URLs — e.g. `captadel.com/News/gaca/` and
  `captadel.com/gacar-part-1/`. The Worker (`landing/worker/index.js`) serves the landing shell
  with **200** for any extensionless path, so these are soft-404s that never fall out of the
  index cleanly (the canonical tag mitigates, slowly). Add a legacy 301/410 map and register
  the domain in Search Console.
- **Routing check (do this in an incognito tab)**: the committed Worker falls back to the landing
  shell for any path not in `dist/` — including `/chat.html`, which the footer links to. If the
  custom domain sends *all* captadel.com traffic through this Worker, "Ask your first question"
  loops back to the landing instead of opening chat. If production routes app paths to the Node
  service some other way, ignore this — but verify once; it's the primary CTA.
- **App pages have no `og:image` / `twitter:card`** (all 8 `public/*.html`). A shared chat or
  exam link renders as a bare text card. The landing's `media/captain-adel.jpg` already exists.
- **No human anywhere.** There is a `linkedin.com/in/captadel` profile ("Empowering Future
  Pilots…", CPL, ATC tower/approach ratings) that no surface links to, and the site never says
  who is behind the product. For a *personal* brand goal this is the biggest missing piece —
  see Strategic #3.
- Minor: `meta name="author"` says "Fly GACA" while the operator line says BDA Company
  International; three contact addresses in circulation (`hello@captadel.com`,
  `hello@flygaca.com`, `i@flygaca.com`). Pick one public address per brand.

### 3. Hugging Face (`huggingface.co/flygaca`)

All three repos were created 29 May 2026 and are **empty scaffolds**:

- **Model `flygaca/CaptAdel`** — only `README.md` + `.gitattributes`. The card itself is
  well-written (intended use, out-of-scope, limitations, eval-table skeleton) but says
  "weights not published yet" and is full of TBDs; `pipeline_tag: sentence-similarity` +
  `library_name: sentence-transformers` on a weightless repo means the code snippet and any
  inference widget fail. Its **Links section points to `github.com/ay2m/FlyGACA` — a 404** —
  and never mentions captadel.com.
- **Dataset `flygaca/gacar-assistant-evals`** — no README, no data, no tags beyond `region:us`.
  (The "41 downloads" are crawlers hitting an empty repo.) Meanwhile the *actual* eval set —
  83 bilingual cases with a scoring harness — sits in the private GitHub repo.
- **Space `flygaca/captain-adel`** — default scaffold: 🚀 emoji, `pink`→`green`, boilerplate
  body ("Check out the configuration reference…"), and `app_file: app.py` with **no `app.py` in
  the repo**, so visitors see an error state, not a demo.

Empty public repos are worse than no repos: they're indexed, they carry your brand name, and
they read as "abandoned." Two of the three are fixable in under an hour (below); making them
*real* is Strategic #2.

---

## Quick wins (≤ 1 hour each)

1. **Triage the HF Space (~20 min).** Until there's a real demo, make it honest and branded
   rather than broken: switch to `sdk: static` with a styled card that pitches the product and
   links to captadel.com (template A). Alternative if you'd rather hide it: Settings → make the
   Space private. Do not leave a build-error page as your only interactive public artifact.
2. **Publish the eval set to the empty dataset repo (~45 min).** Convert `evals/cases.json` to
   JSONL, push it with card template B. This is a deliberate open-sourcing decision out of a
   proprietary repo — but it's your single strongest public evidence of rigor ("83 bilingual
   eval cases gate every prompt/model change"), it's self-authored, and the empty repo shows you
   already intended it. Suggested license: `cc-by-4.0`.
3. **Broken-link + metadata sweep (~30 min).**
   - HF model card: Links → `https://captadel.com`, `https://github.com/ay2m` (org, public),
     `https://hf.co/datasets/flygaca/gacar-assistant-evals`; drop the dead `ay2m/FlyGACA` URL.
   - Landing `Footer.tsx`: while the repo is private, point "Squadron" at the public org page
     and flygaca.com; drop or annotate the Book link.
   - Landing JSON-LD `sameAs`: add HF profile, org page, LinkedIn, Instagram (snippet C).
   - GitHub About: fix "power"→"powers", set homepage, add topics (snippet D).
4. **`og:image` + Twitter card on the 8 app pages (~30 min).** One block (snippet E), pasted
   into each `public/*.html` head per the existing 8-page copy-paste convention. Reuse
   `media/captain-adel.jpg` (or export a 1200×630 with the app's own captain art).
5. **GitHub presentation pass (~45 min).** Org profile README (stub F) + pin `FlyGACA-app` and
   `FlyGACA-ios`; delete the stale "Promotion to its own repo" README section; add `SECURITY.md`
   (template G — you take payments, give researchers a channel) and a 10-line `CONTRIBUTING.md`
   stating the source-visible/proprietary posture (template H).

## Strategic enhancements (prioritized by impact)

1. **Decide the public face of the code.** Right now "GitHub as portfolio" doesn't exist. Three
   viable paths:
   - **A. Make this repo public as source-visible proprietary** (license already forbids reuse;
     GitHub fully supports public + all-rights-reserved). Highest credibility per unit effort —
     the README/ROADMAP/evals are already portfolio-grade. Pre-flight first: scan full git
     history for secrets, decide whether the system prompt (`authoring/`) and the bundled GACAR
     corpus are things you're willing to show, and accept the abuse-surface review.
   - **B. Keep it private, build a public showcase**: a public `FlyGACA/captain-adel-brain`
     README-only repo (architecture, eval methodology, screenshots, links) that everything
     public points at instead.
   - **C. Extract genuinely open pieces** (the eval harness + cases, `exam-core.js`,
     the OpenAI-compatible provider factory) into a small public MIT repo.
   Recommendation: **A** if the pre-flight passes, else **B now + C over time**. Whatever you
   choose, every `sameAs`/footer/model-card link should resolve for a logged-out visitor.
2. **Make the Hugging Face story real (this quarter).** In order: (a) publish the **provider
   parity results** (Gemini vs ALLaM/Jais/Fanar/Qwen on the Arabic subset) as a dataset +
   short writeup — bilingual aviation-RAG evals are genuinely novel content nobody else has;
   (b) train/publish **CaptAdel v0.1 embeddings** — the scaffolding already exists
   (`embeddings.js`, `build:embeddings`, BGE-M3 as base) — and fill the card's TBDs with the
   harness numbers; (c) rebuild the Space as a thin Gradio client on `POST /v1/chat` (server-side
   `X-Adel-Api-Key`, quota'd) so HF becomes a working funnel to captadel.com, not a dead end.
3. **One brand system, one entity graph, one human.** Write a half-page naming matrix — 
   **Captain Adel** = product/persona, **CaptAdel** = handle + domain, **Fly GACA** = family,
   **BDA Company International** = legal operator — and apply it to bios, cards, and metadata.
   Unify on one public email per brand. Cross-link every surface pairwise (site ↔ GitHub org ↔
   HF ↔ LinkedIn) and mirror the full set in `sameAs`. Then decide the persona-vs-person
   question: if a real, rated instructor is behind the name (the `/in/captadel` LinkedIn suggests
   exactly that), an "About the Captain" section — real credentials, why cite-or-refuse — is
   your strongest differentiator against generic AI chat tools, and strong E-E-A-T for search.
4. **SERP + Search Console hygiene.** Add a legacy-URL map to the Worker (301 the old
   `/News/…`, `/gacar-part-*` paths to `/` or to the matching flygaca.com library page; 410 the
   rest), stop serving 200s for arbitrary unknown paths, register both captadel.com and
   flygaca.com in Search Console, and watch the brand SERP — you're competing with a 2016 short
   film named "Captain Adel" for your own name.
5. **Credibility artifacts + cadence.** Tag releases (the repo is at `1.0.0` with no tags) with
   a short changelog; write one technical post — *"Cite-or-refuse: eval-gating a bilingual
   aviation RAG for Saudi GACAR"* — and link it from the README, the HF model card, and
   LinkedIn; set a monthly Dependabot triage habit — burn down the 43 open alerts (27 high)
   and decide the express 4→5 major rather than queueing it; enable branch protection on
   `main`. Note that clearing the alert backlog is a **prerequisite** for Strategic #1's
   "make it public" path. Each is small; together they're the
   difference between "side project" and "operated product."

---

## Appendix — copy-paste templates

### A. Space `README.md` (static placeholder until the real demo)

```yaml
---
title: Captain Adel — كابتن عادل
emoji: 🧑‍✈️
colorFrom: blue
colorTo: indigo
sdk: static
pinned: true
license: apache-2.0
short_description: AI flight instructor for Saudi GACAR — cites or refuses
---
```

Body: two sentences (what it is, unofficial-and-educational), a link to
https://captadel.com, and "Live demo Space coming — the production chat runs at captadel.com."
With `sdk: static`, add an `index.html` (dark navy `#050810`, cyan `#22d3ee` accents to match
the landing) — nothing can build-error.

### B. Dataset card front-matter (`gacar-assistant-evals`)

```yaml
---
license: cc-by-4.0
language: [en, ar]
task_categories: [question-answering, text-retrieval]
tags: [aviation, gacar, saudi-arabia, rag, evaluation, llm-evaluation, bilingual]
pretty_name: GACAR Assistant Evals
size_categories: [n<1K]
---
```

Card sections: What this is (83 bilingual regression cases for a cite-or-refuse GACAR
assistant) · Schema (`question`, `expect`: `citesPart`, `mustInclude`, `mustNotInclude`,
`answerLang`, `kind` …) · How we use it (every prompt/model/retrieval change must
match-or-beat the bar in EN **and** AR; parity gate for new providers) · Provenance
(self-authored; regulations remain GACA's — unofficial, educational) · Link to captadel.com.

### C. JSON-LD `sameAs` (landing, both language shells)

```json
"sameAs": [
  "https://github.com/ay2m",
  "https://huggingface.co/flygaca",
  "https://flygaca.com",
  "https://www.linkedin.com/in/captadel/",
  "https://www.instagram.com/flygaca/"
]
```

(Re-add the repo URL the moment it — or a public showcase repo — is visible.)

### D. GitHub About

- Description: *"An independent AI flight instructor for Saudi civil aviation — cites the exact
  GACAR Part/section, refuses to guess. Lives at captadel.com and powers the Fly GACA API."*
- Homepage: `https://captadel.com` · Topics: `rag` `llm` `aviation` `saudi-arabia` `arabic-nlp`
  `bilingual` `bm25` `gacar` `express` `gemini`

### E. App-page share card (all 8 `public/*.html`, inside `<head>`)

```html
<meta property="og:image" content="https://captadel.com/media/captain-adel.jpg">
<meta property="og:image:alt" content="Captain Adel — AI flight instructor portrait">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:image" content="https://captadel.com/media/captain-adel.jpg">
```

### F. Org profile README (`FlyGACA/.github` → `profile/README.md`)

> **Fly GACA — Saudi Aviation Library** · flygaca.com
> Independent, bilingual (EN/عربي) tools for Saudi civil aviation: the GACAR reference library,
> study apps, and **Captain Adel** (captadel.com) — an AI flight instructor that cites the exact
> regulation or refuses to guess. Unofficial & educational — the authority is always
> [gaca.gov.sa](https://gaca.gov.sa).

### G. `SECURITY.md`

```markdown
# Security policy
Captain Adel is a live service (captadel.com) that handles authentication and payments.
If you find a vulnerability, email **hello@captadel.com** with steps to reproduce.
We acknowledge within 72 hours. Please don't test against production user data or
run automated scanners against the live API; no bounty program yet, but we credit reporters.
```

### H. `CONTRIBUTING.md`

```markdown
# Contributing
Captain Adel is proprietary, source-visible software (see LICENSE) — we don't accept code
contributions, but bug reports and regulation-accuracy corrections are very welcome via
issues. Every behavioural change is eval-gated: see evals/README.md. Security reports:
see SECURITY.md.
```
