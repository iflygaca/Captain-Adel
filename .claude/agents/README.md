# Project subagents

Claude Code loads every `*.md` here as a project-scoped subagent (see
[the subagent docs](https://code.claude.com/docs/en/sub-agents)). They are
checked in so every session works from the same rules — the ones that keep an
assistant which *refuses rather than guesses* actually behaving that way.

| Agent | Use it for |
| --- | --- |
| `brain-retrieval` | `src/brain/` — retrieval, routing, grounding, providers, tools |
| `eval-warden` | `evals/` — cases, scoring, Part coverage, the `auto` parity gate |
| `prompt-steward` | System prompt ↔ `authoring/` sync, exam mode, tenant voice, PDPL |
| `site-chrome` | The eight `public/*.html` pages, shared JS, the hand-maintained CSP |

What these encode that a generic agent cannot know: that the corpus is
PDF-extracted and noisy so citation shaping must degrade in tiers; that only
GACAR material may be labelled GACAR; that BM25 must keep working with no
network; that the disclaimer strip and nav are hand-duplicated across all eight
pages on purpose; and that a pure-Arabic query scores no BM25 hits, so an
Arabic eval case demanding `citesPart` is asserting a property the pipeline
doesn't have.

## Conventions

- `name` matches the filename; lowercase and hyphens only.
- `description` says **when to delegate**, in task language. Reviewers say
  "use proactively".
- `model` is omitted so each agent inherits the session's model.
- Every agent's closing instruction is to state which gate it ran and which it
  skipped. The live eval needs `GEMINI_API_KEY`; an agent that could not run it
  must say so rather than implying the bar was met.
