import { useZuluClock } from '../hooks/useReveal'
import { isAr, ALT_URL } from '../i18n'

export function RadarMark({ size = 34 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" aria-hidden>
      <circle cx="24" cy="24" r="21" stroke="#2d8ea8" strokeWidth="1.5" opacity=".8" />
      <circle cx="24" cy="24" r="13" stroke="#1a2540" strokeWidth="1" />
      <circle cx="24" cy="24" r="5" stroke="#1a2540" strokeWidth="1" />
      <line x1="24" y1="3" x2="24" y2="45" stroke="#1a2540" strokeWidth="1" />
      <line x1="3" y1="24" x2="45" y2="24" stroke="#1a2540" strokeWidth="1" />
      <g className="anim-sweep" style={{ transformOrigin: '24px 24px' }}>
        <path d="M24 24 L24 3 A21 21 0 0 1 38.8 9.2 Z" fill="url(#sweepGrad)" opacity=".7" />
        <line x1="24" y1="24" x2="24" y2="3" stroke="#22d3ee" strokeWidth="1.6" />
      </g>
      <circle cx="33" cy="15" r="2" fill="#34d399" className="anim-pulse-dot" />
      <circle cx="24" cy="24" r="2" fill="#22d3ee" />
      <defs>
        <linearGradient id="sweepGrad" x1="24" y1="24" x2="24" y2="3" gradientUnits="userSpaceOnUse">
          <stop stopColor="#22d3ee" stopOpacity=".5" />
          <stop offset="1" stopColor="#22d3ee" stopOpacity="0" />
        </linearGradient>
      </defs>
    </svg>
  )
}

const NAV = isAr
  ? [
      { label: 'العقيدة', href: '#doctrine' },
      { label: 'الكابتن', href: '#captain' },
      { label: 'العقل', href: '#brain' },
      { label: 'النماذج', href: '#models' },
      { label: 'الأسئلة', href: '#faq' },
      { label: 'GACAR', href: '#qa' },
      { label: 'API', href: '#api' },
    ]
  : [
      { label: 'The Doctrine', href: '#doctrine' },
      { label: 'The Captain', href: '#captain' },
      { label: 'The Brain', href: '#brain' },
      { label: 'Models', href: '#models' },
      { label: 'FAQ', href: '#faq' },
      { label: 'GACAR Q&A', href: '#qa' },
      { label: 'API', href: '#api' },
    ]

export default function Header() {
  const clockRef = useZuluClock()
  return (
    <header className="fixed top-0 inset-x-0 z-50 border-b border-[#1a2540] bg-[#050810]/80 backdrop-blur-md">
      <div className="mx-auto max-w-7xl px-5 h-16 flex items-center justify-between gap-4">
        <a href="#top" className="flex items-center gap-3 shrink-0">
          <RadarMark />
          <div className="leading-tight">
            <div className="font-mono2 text-[13px] font-semibold tracking-[0.18em] text-[#e6edf6]">
              {isAr ? 'كابتن عادل' : 'CAPTAIN ADEL'}
            </div>
            <div className="font-mono2 text-[9px] tracking-[0.28em] text-[#8b98ad] uppercase">captadel.com</div>
          </div>
        </a>

        <nav className="hidden md:flex items-center gap-7">
          {NAV.map((n) => (
            <a
              key={n.href}
              href={n.href}
              className="nav-link font-mono2 text-[11px] tracking-[0.2em] uppercase text-[#8b98ad] hover:text-[#22d3ee] transition-colors duration-150"
            >
              {n.label}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-4">
          <div className="hidden lg:flex items-center gap-2 font-mono2 text-[10px] tracking-[0.14em] text-[#8b98ad]">
            <span ref={clockRef} />
            <span className="text-[#1a2540]">|</span>
            <span className="flex items-center gap-1.5 text-[#34d399]">
              <span className="w-1.5 h-1.5 rounded-full bg-[#34d399] anim-pulse-dot" />
              {isAr ? 'الأنظمة تعمل' : 'SYSTEMS NOMINAL'}
            </span>
          </div>
          {/* language toggle */}
          <a
            href={ALT_URL}
            hrefLang={isAr ? 'en' : 'ar'}
            className="font-mono2 text-[11px] tracking-[0.1em] px-3 py-2 border border-[#1a2540] text-[#8b98ad] hover:border-[#2d8ea8] hover:text-[#22d3ee] transition-colors duration-150"
            aria-label={isAr ? 'Switch to English' : 'التبديل إلى العربية'}
          >
            {isAr ? 'EN' : 'عربي'}
          </a>
          <a
            href="#api"
            className="btn-swap font-mono2 text-[11px] tracking-[0.16em] uppercase px-4 py-2 border border-[#2d8ea8] text-[#22d3ee] hover:bg-[#22d3ee] hover:text-[#050810] transition-colors duration-150"
          >
            <span className="bs-a">{isAr ? 'اسأل عادل' : 'Ask Adel'}</span>
            <span className="bs-b">{isAr ? 'على التردد' : 'On frequency'}</span>
          </a>
        </div>
      </div>
    </header>
  )
}
