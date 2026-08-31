---
name: skill-creator
description: Use when adding a new skill to .claude/skills/, or substantially
  revising an existing one — drafting SKILL.md, deciding what belongs in a
  skill versus an agent, keeping frontmatter consistent with this repo's
  convention, and avoiding an unfocused or overfit skill.
domain: engineering
subdomain: tooling
tags:
- meta
- skill-authoring
- claude-code
version: '1.0'
author: adapted-from-anthropics-skills
license: Apache-2.0
---
# Skill Creator

> Adapted from the `skill-creator` skill in
> [anthropics/skills](https://github.com/anthropics/skills/tree/main/skills/skill-creator)
> (Apache-2.0 — see `LICENSE` in this folder). Rewritten and condensed for
> this repo's own skill/agent conventions, not a verbatim copy.

## When to reach for this

Before adding a new folder under `.claude/skills/`, or when an existing
`SKILL.md` has drifted from what it actually does.

## Skill vs. agent — decide this first

This repo already draws the line one way: an **agent** (`.claude/agents/`)
owns a piece of the codebase and holds state/judgment across a session
(`brain-retrieval`, `eval-warden`, `prompt-steward`, etc. — see CLAUDE.md's
table). A **skill** (`.claude/skills/`) is a reusable *procedure* invoked when
a situational trigger fires — it doesn't own a directory, it teaches a way of
working (how to debug, how to test a webapp, how to red-team a prompt). If
what you're writing needs to "remember" project-specific facts and defend a
directory, it's an agent. If it's a transferable method, it's a skill.

## Workflow

**1. Capture intent.** What triggers this skill? What should the model do
differently once it's loaded? Write the triggering conditions before the
instructions — a vague trigger means the skill won't fire when needed or
fires when it shouldn't.

**2. Draft `SKILL.md`.** Match this repo's existing frontmatter shape (see
any file under `.claude/skills/*/SKILL.md` for the pattern):

```yaml
---
name: <kebab-case, matches folder name>
description: <specific — what it's for AND when to use it, third person>
domain: <e.g. engineering, cybersecurity>
subdomain: <narrower>
tags: [...]
version: '1.0'
author: <you or the adaptation source>
license: <license of this skill's content>
---
```

Keep the body focused — a short Overview, a When-to-Use section, then the
actual procedure. Push long reference material into a `references/` folder
(see `testing-prompt-injection-in-rag-pipelines/references/` for the
pattern) rather than bloating `SKILL.md` itself.

**3. Push for generalization, not overfitting.** A skill written to solve
today's exact bug will misfire or stay silent next time the situation is
slightly different. Prefer principles and decision trees over a single
worked example; keep one worked example as illustration, not as the whole
skill.

**4. Make the description a little assertive.** Under-triggering is the more
common failure — a skill nobody reaches for is dead weight. State plainly
what the skill is for and the concrete situations that should trigger it
(as this file's own `description` field tries to do).

**5. License and attribute.** If a skill is adapted from external material
(as this one is), keep that source's license file in the folder and say so
in the skill body — don't strip attribution to make it look native. If it's
original, `author` can just be a person or agent name and `license` can
follow the repo default.

## Anti-patterns to avoid

- A skill that duplicates what an existing agent already owns (check
  CLAUDE.md's agent table first)
- Instructions phrased as rigid MUSTs with no reasoning — explain *why*, so
  the model can generalize past the literal wording
- A skill with no clear trigger condition in its `description`
- Vendoring third-party content without checking its license first
