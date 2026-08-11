# captadel.com — the landing page

The marketing landing for **Captain Adel** (كابتن عادل), served at
[captadel.com](https://captadel.com) by the Cloudflare Worker `captadel`.
This directory is the **source of truth** for that site — the deployed thing
is the built `dist/` of this app, uploaded as Worker static assets.

Not to be confused with the rest of this repo: the Node service in `../src/`
plus the vanilla pages in `../public/` are the **product app** (chat, mock
exam, account, billing) and the `/v1/chat` API. The landing is a separate,
fully static Vite app that only *documents* that API — it makes no live calls.

## Stack

- Vite 7 + React 19 + TypeScript, Tailwind CSS 3.4, shadcn/ui, Lenis smooth scroll
- Two build entries: `index.html` (English, `/`) and `ar/index.html` (Arabic, `/ar/`)
- Language is **path-driven** (`src/i18n.ts`): `/ar/…` renders RTL Arabic, everything else LTR English; strings live inline via `pick(en, ar)`
- Sections in `src/sections/` (Hero, Ticker, Cinematic, Doctrine, MeetCaptain, Gallery, Brain, Models, FAQ, GacarQa, ApiSection, Footer); scroll/reveal/parallax/magnetic behaviour in `src/hooks/useReveal.ts`
- Media (captain art, cockpit video) in `public/media/`

## Develop

```bash
cd landing
npm install        # or: npm ci
npm run dev        # http://localhost:3000  (open /ar/ for Arabic)
```

## Build

```bash
npm run build      # tsc -b && vite build  →  dist/  (both entries)
npm run preview    # serve the built dist/ locally
```

## Deploy (manual, on purpose)

Deploys are **not** wired into CI — publish deliberately, from your machine:

```bash
cd landing
npm run build
npx wrangler deploy        # uses wrangler.toml → Worker "captadel"
```

Auth: either `npx wrangler login` (browser) or set `CLOUDFLARE_API_TOKEN`
(token needs *Workers Scripts: Edit*). `wrangler.toml` targets the existing
`captadel` Worker with a static-assets binding (`dist/` → `ASSETS`), and
`worker/index.js` is the tiny edge script that serves those assets and
rewrites extensionless paths to the right language shell (`/ar/…` → Arabic,
otherwise English). If you ever edit the Worker in the Cloudflare dashboard,
mirror the change into `worker/index.js` so this repo stays the source of truth.

## Conventions

- Keep every visible string bilingual via `pick()` / `isAr` — no
  English-only UI. Arabic display headlines take the `ar-display` class.
- Anything animated must respect `prefers-reduced-motion` (see the guards in
  `useReveal.ts` and `index.css`).
- SEO lives in the two HTML shells (meta/OG/JSON-LD/hreflang) plus
  `public/robots.txt` and `public/sitemap.xml` — update both languages together.
