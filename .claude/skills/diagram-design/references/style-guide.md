# Style Guide

**The single source of truth for colors, typography, and tokens.** Every diagram draws from this — not from hex values inlined in other reference files. If you want to change the visual skin of Schematic, change this file.

Skinned to the **Captain Adel palette** — night paper, gold accent, teal links. Values mirror `public/assets/css/adel.css`; change them there first, then mirror here.

To generate your own from a website URL, see [`onboarding.md`](onboarding.md).

---

## Tokens

### Semantic roles

Every token is referred to by **semantic role**, not by its hex value. Type references (`type-*.md`) and SKILL.md say `accent`, not a hex value.

| Role | Purpose | Light | Dark |
|---|---|---|---|
| `paper` | Page background, default node fill | `#f5f2ed` (ivory) | `#090c10` (night) |
| `paper-2` | Diagram container bg, secondary fill | `#fbf8f2` (ivory-warm) | `#11161c` (panel) |
| `ink` | Primary text, primary stroke | `#090c10` (night) | `#eef2f6` (ink) |
| `muted` | Secondary text, default arrow stroke | `#3f4a55` (ink-soft) | `#9daab7` (ink-dim) |
| `soft` | Sublabels, boundary labels | `#7a8590` (ink-mute) | `#6b7886` (ink-faint) |
| `rule` | Hairline borders | `rgba(9,12,16,0.12)` | `rgba(238,242,246,0.12)` |
| `rule-solid` | Stronger borders, baselines | `#e5dfd3` (ivory-edge) | `#232c36` (line) |
| `accent` | Focal / 1–2 max per diagram | `#a9853a` (gold-deep) | `#c8a04a` (gold) |
| `accent-tint` | Fill for accent-bordered boxes | `rgba(169,133,58,0.08)` | `rgba(200,160,74,0.12)` |
| `link` | HTTP/API calls, external arrows | `#3d7f96` (teal-deep) | `#57aec9` (accent teal) |

> **Brand palette source:** these tokens mirror `public/assets/css/adel.css`. Captain Adel is
> **gold-forward**: `--gold` is the product's primary accent (verdict chrome, exam timer), so
> `accent` maps to gold. Teal is reserved in that stylesheet for *links and focus only* — its own
> comment reads `teal — links / focus ONLY, never "verified"` — so `link` maps to teal and must
> never be used to signal a grounded/verified state in a diagram. On light paper both are darkened
> (`gold-deep`, a teal at equivalent value) to hold contrast against ivory.

> **Note:** the pre-baked example HTML files in `assets/` were built under the upstream skin and
> still show it. They are reference for *layout and structure*, not colour. New diagrams the
> skill produces use the tokens above.

### Inversion rule (light → dark)

Any `rgba(<ink>, X)` in light becomes `rgba(<dark ink>, X)` in dark. Same opacities, RGB flipped. The accent gets a slight hue-shift brighter to read on dark paper.

### Series palette (multi-series chart types only)

A small set of desaturated, editorial-tone colors for chart types that genuinely need to distinguish multiple overlapping entities (currently: **radar**). The "1-focal" rule still holds — `accent` is reserved for the focal series; the palette below covers the rest.

| Token | Light | Dark | Notes |
|---|---|---|---|
| `series-1` | `#7c8f6f` (sage) | `#9caf8f` | Non-focal series |
| `series-2` | `#5e7a9b` (dusty-blue) | `#82a0c0` | Non-focal series |
| `series-3` | `#b8915a` (mustard) | `#d3ad7a` | Non-focal series |
| `series-4` | `#9c6b50` (rust-brown) | `#b88670` | Non-focal series |
| `series-5` | `#6e6479` (slate) | `#8d8298` | Non-focal series |

Fills sit at `0.18` opacity light, `0.22` dark; strokes use the full color. **Don't backfill these tokens to non-chart types** — architecture, swimlane, etc. continue to use muted-ink variants. The series palette is opt-in for diagrams where overlapping shapes demand distinguishable color, not a license to add color elsewhere.

### Terminal skin (opt-in alternate)

A self-contained palette for the terminal-window primitive (see [primitive-terminal.md](primitive-terminal.md)) — a CLI-chrome register for dev-tool posts and technical social cards. It does not replace the default skin above and isn't affected by onboarding; it's a second, fixed skin you opt into per-diagram.

| Token | Hex | Purpose |
|---|---|---|
| `terminal-page` | `#0a0a0a` | Page background behind the window |
| `terminal-paper` | `#141414` | Window body, node fill |
| `terminal-bar` | `#1b1b1b` | Titlebar strip |
| `terminal-border` | `#2b2b2b` | Window border, hairlines |
| `terminal-ink` | `#f5f5f5` | Primary text, primary stroke (near-white; the terminal skin is fixed and does not track brand `ink`) |
| `terminal-muted` | `#9a9a9a` | Secondary text, sublabels, ring stroke |
| `terminal-soft` | `#5c5c5c` | Tertiary — inactive dots, spokes |
| `terminal-accent` | `#ff5a36` | The one accent — focal station, prompt sign, active dot |
| `terminal-accent-tint` | `rgba(255,90,54,0.12)` | Fill for accent-bordered boxes |

**1-accent rule still holds.** Everything that isn't `terminal-ink` or `terminal-muted`/`terminal-soft` should be `terminal-accent` — never introduce a second hue.

---

## Typography

| Role | Family | Size | Weight | Usage |
|---|---|---|---|---|
| `title` | Cairo | 1.75rem | 600 | Page H1 |
| `node-name` | Inter | 12px | 600 | Human-readable labels |
| `sublabel` | JetBrains Mono | 9px | 400 | Port, protocol, URL, field type |
| `eyebrow` | JetBrains Mono | 7–8px | 500, tracked 0.18em, uppercase | Type tags, axis labels |
| `arrow-label` | JetBrains Mono | 8px | 400, tracked 0.06em | Arrow annotations |
| `callout` | Cairo *italic* | 14px | 400 | Editorial asides only |

### Font stack

```html
<link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet">
```

**Why these, and not the upstream default.** Upstream ships Instrument Serif / Geist / Geist Mono.
Every Fly GACA surface is bilingual EN/AR, and **Instrument Serif and Geist have no Arabic
coverage** — an Arabic node label would fall back to a system face mid-diagram, or render as tofu.
**Cairo** is already the brand's heading + Arabic face (it is the heading font in the Office print
pipeline, `tools/print/fonts/Cairo-arabic.woff2`), so it carries both scripts in one family.
**Inter** is the brand's document body face, and **JetBrains Mono** is the family-wide code face
(`--font-mono` in the app, `tools/print/fonts/JetBrainsMono-latin.woff2` in Office).

> Upstream's style guide says *"Never JetBrains Mono as a blanket 'dev' font."* That rule is
> **deliberately overridden here**: JetBrains Mono is not a generic dev-font default in this org, it
> is the declared brand mono. The intent behind the upstream rule — mono is for *technical* content
> only — still holds in full.

**Load-bearing rule:** Mono is for *technical* content (ports, commands, URLs, field types). Names go
in Inter. Page title is Cairo. Italic Cairo is reserved for annotation callouts (see
[primitive-annotation.md](primitive-annotation.md)).

---

## Stroke, radius, spacing

| Token | Value | Use |
|---|---|---|
| `stroke-thin` | `0.8` | Tag-box outlines, leaf nodes |
| `stroke-default` | `1` | Most strokes |
| `stroke-strong` | `1.2` | Emphasis strokes |
| `radius-sm` | `4` | Small tags |
| `radius-md` | `6` | Node boxes |
| `radius-lg` | `8` | Containers, rings |
| `grid` | `4` | Every coord, size, and gap is divisible by 4 (hard rule) |

---

## Node type → treatment

Semantic role combinations — reference these by name in type specs.

| Type | Fill | Stroke |
|---|---|---|
| `focal` (1–2 max) | `accent-tint` | `accent` |
| `backend` | `#ffffff` (white) | `ink` |
| `store` | `ink @ 0.05` | `muted` |
| `external` | `ink @ 0.03` | `ink @ 0.30` |
| `input` | `muted @ 0.10` | `soft` |
| `optional` | `ink @ 0.02` | `ink @ 0.20` dashed `4,3` |
| `security` | `accent @ 0.05` | `accent @ 0.50` dashed `4,4` |

---

## Customizing the skin

Three options:

1. **Run onboarding** — see [`onboarding.md`](onboarding.md). Drop a URL; the skill extracts the palette + fonts and rewrites this file.
2. **Edit by hand** — change the hex values in the tables above. Run the pre-output taste gate afterward to verify the accent still reads as "focal" against the new paper color.
3. **Brand handoff** — paste your existing design-token JSON into a new section here and map its tokens to the semantic roles above.

### Constraints (don't break these)

- **Contrast**: `ink` must hit WCAG AA on `paper`. `muted` must hit AA on `paper` for 11px+ text.
- **One accent**: pick one color for `accent`. Two accents erases the focal signal.
- **No rainbow palette**: if your brand ships 8 colors, pick 3 (paper, ink, accent). The rest become `muted` variants.
- **Display + sans + mono**: three families, not more. The upstream rule said to keep Instrument Serif for `title`/`callout` even under an all-sans brand, because the contrast is load-bearing. That contrast requirement still holds — here it is carried by **Cairo** (heavier, wider, Arabic-capable) against **Inter**, rather than by a serif.
- **Paper is warm-neutral, not pure white**: pure white turns the design sterile. Pick a cream, bone, or light grey with a hint of warmth.
- **Dot pattern is optional, not default**: the 22×22 dot pattern is an opt-in "dotted paper" variant (good for long-form editorial hero diagrams). The default background is a clean `paper` fill, no pattern. When the pattern is enabled, it should sit at ~10% opacity of `ink` on `paper` — visible but quiet.
- **Container is clean by default**: the diagram sits directly on the page paper, no secondary container background or border. A framed variant (`paper-2` bg + `rule` border + 8px radius + padding) is available as an opt-in for card-heavy layouts, but don't reach for it by default — the extra chrome fights the figure.
