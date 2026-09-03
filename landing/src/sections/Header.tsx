import { useState } from 'react'
import { useZuluClock } from '../hooks/useReveal'
import { isAr, ALT_URL } from '../i18n'
import { NAV } from '../nav'
import MobileNav from './MobileNav'

export function RadarMark({ size = 34 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" aria-hidden style={{ '--radar-brand': 'var(--color-brand-teal)', '--radar-void-raised': 'var(--color-void-raised)', '--radar-neon-cyan': 'var(--color-neon-cyan)', '--radar-success': 'var(--color-success)' } as any}>
      <circle cx="24" cy="24" r="21" strokeWidth="1.5" opacity=".8" style={{ stroke: 'var(--color-brand-teal)' }} />
      <circle cx="24" cy="24" r="13" strokeWidth="1" style={{ stroke: 'var(--color-void-raised)' }} />
      <circle cx="24" cy="24" r="5" strokeWidth="1" style={{ stroke: 'var(--color-void-raised)' }} />
      <line x1="24" y1="3" x2="24" y2="45" strokeWidth="1" style={{ stroke: 'var(--color-void-raised)' }} />
      <line x1="3" y1="24" x2="45" y2="24" strokeWidth="1" style={{ stroke: 'var(--color-void-raised)' }} />
      <g className="anim-sweep" style={{ transformOrigin: '24px 24px' }}>
        <path d="M24 24 L24 3 A21 21 0 0 1 38.8 9.2 Z" fill="url(#sweepGrad)" opacity=".7" />
        <line x1="24" y1="24" x2="24" y2="3" strokeWidth="1.6" style={{ stroke: 'var(--color-neon-cyan)' }} />
      </g>
      <circle cx="33" cy="15" r="2" className="anim-pulse-dot" style={{ fill: 'var(--color-success)' }} />
      <circle cx="24" cy="24" r="2" style={{ fill: 'var(--color-neon-cyan)' }} />
      <defs>
        <linearGradient id="sweepGrad" x1="24" y1="24" x2="24" y2="3" gradientUnits="userSpaceOnUse">
          <stop stopOpacity=".5" style={{ stopColor: 'var(--color-neon-cyan)' }} />
          <stop offset="1" stopOpacity="0" style={{ stopColor: 'var(--color-neon-cyan)' }} />
        </linearGradient>
      </defs>
    </svg>
  )
}

export default function Header() {
  const clockRef = useZuluClock()
  const [menuOpen, setMenuOpen] = useState(false)
  return (
    <header className="fixed top-0 inset-x-0 z-50 backdrop-blur-md" style={{ borderBottomColor: 'var(--color-void-raised)', borderBottomWidth: '1px', borderBottomStyle: 'solid', backgroundColor: 'var(--color-void)', backgroundImage: 'linear-gradient(180deg, rgba(9, 10, 15, 0.8) 0%, rgba(9, 10, 15, 0.8) 100%)' }}>
      <div className="mx-auto max-w-7xl px-5 h-16 flex items-center justify-between gap-4">
        <a href="#top" className="flex items-center gap-3 shrink-0">
          <RadarMark />
          <div className="leading-tight">
            <div className="font-mono2 text-[13px] font-semibold tracking-[0.18em]" style={{ color: 'var(--color-text-primary)' }}>
              {isAr ? 'كابتن عادل' : 'CAPTAIN ADEL'}
            </div>
            <div className="font-mono2 text-[9px] tracking-[0.28em] uppercase" style={{ color: 'var(--color-text-secondary)' }}>captadel.com</div>
          </div>
        </a>

        <nav className="hidden md:flex items-center gap-7">
          {NAV.map((n) => (
            <a
              key={n.href}
              href={n.href}
              className="nav-link font-mono2 text-[11px] tracking-[0.2em] uppercase transition-colors duration-150"
              style={{ color: 'var(--color-text-secondary)' }}
              onMouseEnter={(e) => e.currentTarget.style.color = 'var(--color-neon-cyan)'}
              onMouseLeave={(e) => e.currentTarget.style.color = 'var(--color-text-secondary)'}
            >
              {n.label}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-4">
          <div className="hidden lg:flex items-center gap-2 font-mono2 text-[10px] tracking-[0.14em]" style={{ color: 'var(--color-text-secondary)' }}>
            <span ref={clockRef} />
            <span style={{ color: 'var(--color-void-raised)' }}>|</span>
            <span className="flex items-center gap-1.5" style={{ color: 'var(--color-success)' }}>
              <span className="w-1.5 h-1.5 rounded-full anim-pulse-dot" style={{ backgroundColor: 'var(--color-success)' }} />
              {isAr ? 'الأنظمة تعمل' : 'SYSTEMS NOMINAL'}
            </span>
          </div>
          {/* language toggle — phones get it inside the menu instead */}
          <a
            href={ALT_URL}
            hrefLang={isAr ? 'en' : 'ar'}
            className="hidden md:inline-block font-mono2 text-[11px] tracking-[0.1em] px-3 py-2 transition-colors duration-150"
            style={{ borderColor: 'var(--color-void-raised)', color: 'var(--color-text-secondary)', border: `1px solid var(--color-void-raised)` }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = 'var(--color-brand-teal)'
              e.currentTarget.style.color = 'var(--color-neon-cyan)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = 'var(--color-void-raised)'
              e.currentTarget.style.color = 'var(--color-text-secondary)'
            }}
            aria-label={isAr ? 'Switch to English' : 'التبديل إلى العربية'}
          >
            {isAr ? 'EN' : 'عربي'}
          </a>
          <a
            href="/chat"
            className="!hidden md:!inline-flex btn-swap font-mono2 text-[11px] tracking-[0.16em] uppercase px-4 py-2 transition-colors duration-150"
            style={{ borderColor: 'var(--color-brand-teal)', color: 'var(--color-neon-cyan)', border: `1px solid var(--color-brand-teal)` }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = 'var(--color-neon-cyan)'
              e.currentTarget.style.color = 'var(--color-void)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'transparent'
              e.currentTarget.style.color = 'var(--color-neon-cyan)'
            }}
          >
            <span className="bs-a">{isAr ? 'اسأل عادل' : 'Ask Adel'}</span>
            <span className="bs-b">{isAr ? 'على التردد' : 'On frequency'}</span>
          </a>

          {/* burger — the only way into a section on a phone */}
          <button
            type="button"
            className={`mnav-burger md:hidden ${menuOpen ? 'is-open' : ''}`}
            aria-label={menuOpen ? (isAr ? 'إغلاق القائمة' : 'Close menu') : (isAr ? 'فتح القائمة' : 'Open menu')}
            aria-expanded={menuOpen}
            aria-controls="mobile-nav"
            onClick={() => setMenuOpen((v) => !v)}
          >
            <span aria-hidden />
            <span aria-hidden />
          </button>
        </div>
      </div>

      <MobileNav open={menuOpen} onClose={() => setMenuOpen(false)} />
    </header>
  )
}
