# Third-Party Notices — vendored Claude Code skills

This directory contains skills vendored from third-party, community-maintained sources. They are
developer tooling for Claude Code only; they are not part of any shipped product and are never
served to end users.

## diagram-design

- **Project:** diagram-design — "editorial diagrams your designer won't hate"
- **Author:** Cathryn Lavery (@cathrynlavery)
- **Source:** https://github.com/cathrynlavery/diagram-design
- **License:** MIT (upstream `LICENSE` retained at `.claude/skills/diagram-design/LICENSE`)
- **Pinned upstream commit:** `4da4dfb80b1f3d2f11678726b0db58c33c1d7e9d` (v2.2.0)

### What was vendored

The whole skill — `SKILL.md`, all 30 `references/`, `assets/` (4 templates + 94 worked examples +
the 55-icon sheet), and `scripts/` — plus the three slash commands (`/export-diagram`,
`/import-drawio`, `/import-mermaid`) at `.claude/commands/`. The commands resolve the skill through
`../skills/diagram-design/…`, which keeps working because `commands/` and `skills/` stay siblings
under `.claude/`.

Not vendored: the upstream `.claude-plugin/` and `.codex-plugin/` manifests (this is a vendored
skill, not an installed plugin), `docs/screenshots/`, the repo-root `scripts/` test + lint harness,
and `scripts/fixtures/` (referenced by two reference docs only to say which sample file a worked
example was generated from — not needed at runtime).

### The `scripts/` exception, and why it was made

The existing convention in this file is that upstream `scripts/` are **excluded** to avoid
introducing unreviewed third-party executables. That exclusion is **deliberately widened here**,
because `references/import-drawio.md` and `references/import-mermaid.md` both invoke these two
scripts directly and the commands explicitly forbid reading a `.drawio` file without them —
dropping them would ship two visibly broken commands.

They were reviewed before vendoring (2,141 lines across two files):

- **Imports are stdlib only** — `argparse`, `base64`, `zlib`, `struct`, `re`, `json`, `html`,
  `dataclasses`, `pathlib`, `typing`, `xml.etree.ElementTree`, and `urllib.parse.unquote`
  (string decoding, *not* a network call).
- **No** `subprocess`, `os.system`, `os.popen`, `eval`, `exec`, `__import__`, `pickle`, or socket /
  HTTP client of any kind. No writes outside an explicit `--out` path.
- Both are pure parsers: they decode a diagram file to a normalized JSON structure on stdout. The
  module docstring's own claim — *"this script never makes a design decision"* — matches the code.

One residual note: they parse untrusted XML via `xml.etree.ElementTree`. Modern CPython does not
resolve external entities there, so this is not an XXE vector, but a hostile `.drawio` could still
be a decompression or deeply-nested-input hazard. Treat `.drawio` files from outside the org the way
you'd treat any untrusted input.

### Brand skin — this is a local modification

Upstream ships a neutral editorial skin (white-smoke paper, jet-black ink, atomic-tangerine accent,
Instrument Serif / Geist / Geist Mono) and `SKILL.md` §0 is a first-run gate that refuses to emit
default-skinned diagrams into a branded project. That gate is **pre-satisfied**, so the skill is
usable on first run without an onboarding detour. Two files carry the delta:

1. **`references/style-guide.md`** — the declared single source of truth for tokens. Retokenized to
   the **Captain Adel palette** from `public/assets/css/adel.css`.
   Captain Adel is gold-forward: `--gold` is the product's primary accent, so it maps to `accent`.
   Teal maps to `link` because that stylesheet reserves it for links and focus only — its own
   comment reads `teal — links / focus ONLY, never "verified"`, so teal must never be used in a
   diagram to signal a grounded or verified state. On light paper both are darkened (`gold-deep`,
   and a teal at equivalent value) to hold contrast against ivory.
2. **`assets/template.html`, `template-dark.html`, `template-full.html`** — the scaffolds the skill
   copies to start a diagram. Their `:root` custom properties *and* the literal hex values inside
   their SVG bodies were both retokenized; `template-terminal.html` keeps its fixed terminal palette
   (the style guide states that skin is opt-in and unaffected by brand onboarding) but follows the
   font change.

**Typography was changed for a correctness reason, not taste.** Upstream's display and sans faces
(Instrument Serif, Geist) have **no Arabic coverage**. Every Fly GACA surface is bilingual EN/AR, so
an Arabic node label would fall back mid-diagram or render as tofu. The display face is now
**Cairo** (already the brand's Arabic/heading face), sans is **Inter**, mono is **JetBrains Mono**.
This knowingly overrides upstream's *"Never JetBrains Mono as a blanket 'dev' font"* rule — here it
is not a generic dev default, it is the declared brand mono. The intent behind that rule (mono is
for technical content only) is preserved in full.

**The 94 `assets/example-*.html` files were deliberately left byte-identical to upstream.** They are
reference for *layout and structure*, which is what the `type-*.md` docs cite them for — not colour.
Keeping them pristine means a future upstream re-sync is a clean diff, with our delta confined to
the style guide and the four templates.

### Updating from upstream

`.claude/settings.json` registers the upstream repo as a Claude Code marketplace, so
`/plugin install diagram-design@diagram-design` pulls the latest version. It is **registered but not
enabled** on purpose: enabling it alongside the vendored copy puts two skills named
`diagram-design` on the path. Use the plugin to review what changed upstream, then port the delta
into the vendored copy — re-applying the brand skin above — rather than running both.

### Captain Adel guardrail

Diagrams are **documentation artifacts** for `docs/` and design reviews. They are never served by
`src/server.js` and never referenced from `public/`, so the hand-maintained CSP in `src/server.js`
does not need an entry for the Google Fonts CDN the templates load — that request only happens when
you open a diagram HTML file directly. **If a diagram is ever moved under `public/`, the CSP must be
edited first.**

The colour semantics above are load-bearing: teal is links/focus only and must never stand for a
grounded or verified answer in a diagram, mirroring the rule in `public/assets/css/adel.css`.

## Anthropic-Cybersecurity-Skills

- **Project:** Anthropic-Cybersecurity-Skills (a community project — **not affiliated with
  Anthropic PBC**, despite the name)
- **Author:** Mahipal Jangra (@mukul975)
- **Source:** https://github.com/mukul975/Anthropic-Cybersecurity-Skills
- **License:** Apache License 2.0 (each vendored skill folder retains its upstream `LICENSE`)
- **Pinned upstream commit:** `4c0b700ac5d280ba46695062077f0fe922ce3602`

### What was vendored, and why these

Upstream ships 817 skills across 29 domains. Only a defensive subset that maps onto this service's
actual attack surface was taken — an LLM-backed Express API with a RAG brain, a hand-maintained CSP
and card payments. The other domains (malware analysis, forensics, OT/ICS, red teaming) have no
bearing on it and were **not** vendored.

| Vendored skill | Maps to in this repo |
| --- | --- |
| `detecting-indirect-prompt-injection` | `src/brain/guards.js` soft-injection detection |
| `testing-prompt-injection-in-rag-pipelines` | `src/brain/retrieve.js` retrieve-then-read over `_chunks.json.gz` |
| `defending-llms-with-guardrails` | `src/brain/grounding.js` — the cite-or-refuse layer |
| `testing-for-system-prompt-leakage` | `src/brain/system-prompt.js` + `authoring/` — validates that no credentials or routing logic live in the prompt |
| `securing-agentic-ai-tool-invocation` | `src/brain/tools/` and the Gemini agentic function-calling path |
| `performing-security-headers-audit` | the hand-maintained CSP in `src/server.js` |
| `testing-api-security-with-owasp-top-10` | `/v1/chat`, `/v1/billing/*`, the `X-Adel-Api-Key` trusted tier |
| `implementing-secret-scanning-with-gitleaks` | `.env.example` — see the CLAUDE.md warning about the committed `GEMINI_API_KEY` |

### What was intentionally omitted

For each vendored skill, only `SKILL.md`, `references/**`, and the upstream `LICENSE` were copied.
The bundled `scripts/` and `assets/` were **deliberately excluded** to avoid introducing unreviewed
third-party executables — every one of the 817 upstream skills ships a `scripts/` directory. If a
skill's workflow refers to a helper script, consult the pinned upstream commit above rather than
running anything from here.

### Updating from upstream

`.claude/settings.json` registers the upstream repo as a Claude Code marketplace, so
`/plugin install cybersecurity-skills@anthropic-cybersecurity-skills` pulls the full 817-skill set
on demand. As with `diagram-design`, it is **registered but not enabled** on purpose: enabling it
alongside these vendored copies would put two skills of each vendored name on the path. Use the
plugin to review what changed upstream, or to reach a skill outside the curated set, then port any
delta into the vendored copy rather than running both.

### Captain Adel guardrail

These skills are **advisory developer tooling**. Where any of them conflicts with this repo's
`CLAUDE.md` conventions, **CLAUDE.md wins** — in particular the PDPL in-Kingdom hosting rule, the
fail-open quota behaviour, and the rule that suspicious turns are *flagged* (a hardening note
appended to the system instruction) rather than rejected, and that `/v1/chat` never 401s on bad
auth. A generic hardening recommendation must not be applied in a way that turns those into hard
failures.

`testing-for-system-prompt-leakage` and `testing-prompt-injection-in-rag-pipelines` are written for
red-team engagements. Use them **only against this service's own endpoints**, and prefer a local
run or the eval harness (`evals/`) over probing production — real user questions are personal data
under PDPL.
