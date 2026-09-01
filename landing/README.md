<div align="center">

# 🌐 captadel.com — Marketing Landing Platform
### High-Performance Bilingual Landing Site & Interactive AI Showcase
#### الموقع التعريفي لكابتن عادل · العرض التفاعلي · واجهة النشر السحابية

<p align="center">
  <img src="https://img.shields.io/badge/Made%20in-Saudi%20Arabia-006C35?style=for-the-badge&labelColor=0a0e12" alt="صنع في السعودية" />
  <img src="https://img.shields.io/badge/Stack-React%2019%20%2B%20Vite%207-61DAFB?style=for-the-badge&logo=react&logoColor=white&labelColor=0a0e12" alt="React 19" />
  <img src="https://img.shields.io/badge/Edge-Cloudflare%20Workers-F38020?style=for-the-badge&logo=cloudflare&logoColor=white&labelColor=0a0e12" alt="Cloudflare Workers" />
  <img src="https://img.shields.io/badge/Routing-Path--Driven%20i18n-C8A04A?style=for-the-badge&labelColor=0a0e12" alt="Bilingual" />
</p>

</div>

---

## 🧭 Overview & Stack

This directory contains the source code for the public marketing website hosted at [captadel.com](https://captadel.com).

Deployed globally on **Cloudflare Workers** with static asset bindings, the site delivers sub-100ms first-contentful paint across Saudi Arabia and the GCC.

### Technical Architecture
- **Framework:** React 19, TypeScript Strict, Vite 7
- **Styling:** Tailwind CSS 3.4, shadcn/ui design tokens
- **Animations:** Lenis smooth scrolling with strict `prefers-reduced-motion` compliance
- **Internationalization:** Dual HTML entrypoints (`index.html` for English `/`, and `ar/index.html` for RTL Arabic `/ar/`)

---

## 📂 Section & Component Layout

```
landing/
├── src/
│   ├── sections/            # Page content sections
│   │   ├── Header.tsx       # Navigation header with language switcher
│   │   ├── Hero.tsx         # Hero banner with Captain Adel avatar
│   │   ├── HeroDemo.tsx     # Interactive simulator demo
│   │   ├── Doctrine.tsx     # "Cite or Refuse" philosophy
│   │   ├── Brain.tsx        # Hybrid RAG & BGE-M3 explanation
│   │   ├── Models.tsx       # Gemini & ALLaM routing breakdown
│   │   ├── FaqSection.tsx   # Common regulatory questions
│   │   ├── ApiSection.tsx   # Developer API quickstart & docs
│   │   └── Footer.tsx       # Ecosystem links and legal notices
│   ├── hooks/               # Custom hooks (useReveal, useTheme)
│   └── i18n.ts              # Translation helper (pick(en, ar))
├── worker/                  # Cloudflare Worker edge script
│   └── index.js             # Language routing and asset rewrites
└── public/                  # Media assets, video clips, OpenGraph cards
```

---

## ⚡ Local Development

```bash
cd landing
npm install

# Start local Vite dev server
npm run dev
# 🚀 Running at http://localhost:3000 (open http://localhost:3000/ar/ for Arabic)
```

---

## 📦 Building & Production Deployment

```bash
# 1. Type-check and compile static bundles for both languages
npm run build

# 2. Preview production build locally
npm run preview

# 3. Deploy to Cloudflare Workers
npx wrangler deploy
```

---

<div align="center">

<sub>🇸🇦 صنع في السعودية · Made in Saudi Arabia</sub>

</div>
