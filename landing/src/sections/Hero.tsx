import { type CSSProperties } from 'react'
import { isAr } from '../i18n'
import ConsoleDemo from './HeroDemo'

/* Stylized KSA airspace: abstract node map with animated route arcs */
function AirspaceMap() {
  const airports = [
    { id: 'OEJN', city: 'JEDDAH', x: 18, y: 58 },
    { id: 'OERK', city: 'RIYADH', x: 58, y: 46 },
    { id: 'OEDF', city: 'DAMMAM', x: 84, y: 34 },
    { id: 'OEMA', city: 'MADINAH', x: 30, y: 32 },
    { id: 'OEAB', city: 'ABHA', x: 38, y: 84 },
  ]
  const routes: Array<[number, number]> = [
    [0, 1], [1, 2], [0, 3], [1, 4], [3, 1], [0, 4],
  ]
  return (
    <svg viewBox="0 0 100 100" className="w-full h-full" preserveAspectRatio="xMidYMid meet" aria-hidden>
      {/* graticule */}
      {Array.from({ length: 9 }, (_, i) => (
        <line key={'v' + i} x1={(i + 1) * 10} y1="0" x2={(i + 1) * 10} y2="100" strokeWidth=".18" opacity=".55" style={{ stroke: 'var(--color-grid-dark)' }} />
      ))}
      {Array.from({ length: 9 }, (_, i) => (
        <line key={'h' + i} x1="0" y1={(i + 1) * 10} x2="100" y2={(i + 1) * 10} strokeWidth=".18" opacity=".55" style={{ stroke: 'var(--color-grid-dark)' }} />
      ))}
      {/* radar rings */}
      <circle cx="58" cy="46" r="14" fill="none" strokeWidth=".3" style={{ stroke: 'var(--color-grid-dark)' }} />
      <circle cx="58" cy="46" r="26" fill="none" strokeWidth=".3" style={{ stroke: 'var(--color-grid-dark)' }} />
      <circle cx="58" cy="46" r="38" fill="none" strokeWidth=".3" style={{ stroke: 'var(--color-grid-dark)' }} />
      {/* sweep */}
      <g className="anim-sweep-slow" style={{ transformOrigin: '58px 46px' }}>
        <path d="M58 46 L58 8 A38 38 0 0 1 84.9 19.1 Z" fill="rgba(34,211,238,.10)" />
        <line x1="58" y1="46" x2="58" y2="8" strokeWidth=".45" opacity=".9" style={{ stroke: 'var(--color-neon-cyan)' }} />
      </g>
      {/* routes */}
      {routes.map(([a, b], i) => {
        const A = airports[a], B = airports[b]
        const mx = (A.x + B.x) / 2, my = Math.min(A.y, B.y) - 9
        return (
          <path
            key={i}
            d={`M${A.x} ${A.y} Q ${mx} ${my} ${B.x} ${B.y}`}
            fill="none"
            strokeWidth=".42"
            className="anim-dash"
            style={{ animationDelay: `${i * -1.3}s`, stroke: 'var(--color-brand-teal)' }}
            opacity=".8"
          />
        )
      })}
      {/* airport nodes */}
      {airports.map((a, i) => (
        <g key={a.id}>
          <circle cx={a.x} cy={a.y} r="3.4" fill="none" strokeWidth=".3" opacity=".5" style={{ stroke: 'var(--color-neon-cyan)' }} />
          <circle cx={a.x} cy={a.y} r="1.15" className="anim-blip" style={{ animationDelay: `${i * 0.7}s`, fill: 'var(--color-success)' }} />
          <text x={a.x + 2.4} y={a.y - 2.2} fontSize="2.6" fontFamily="JetBrains Mono, monospace" letterSpacing=".4" style={{ fill: 'var(--color-text-secondary)' }}>
            {a.id}
          </text>
        </g>
      ))}
    </svg>
  )
}

/* kinetic headline — letters enter one by one */
function Kinetic({ text, base = 0.3, className = '' }: { text: string; base?: number; className?: string }) {
  return (
    <span className={`kinetic ${className}`} style={{ '--base': `${base}s` } as CSSProperties} aria-label={text}>
      {text.split('').map((ch, i) => (
        <span key={i} className="kl" style={{ '--i': i } as CSSProperties} aria-hidden>
          {ch === ' ' ? ' ' : ch}
        </span>
      ))}
    </span>
  )
}

export default function Hero() {
  return (
    <section id="top" data-scrollfx className="hero-fx relative min-h-[100svh] flex flex-col overflow-hidden noise-bg scanlines">
      {/* map backdrop */}
      <div className="absolute inset-0 flex items-center justify-center opacity-[.22] md:opacity-[.55] pointer-events-none">
        <div className="parallax w-[min(92vw,900px)] aspect-square" data-parallax="0.14">
          <AirspaceMap />
        </div>
      </div>
      {/* radar ripples emanating from the scope center */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none" aria-hidden>
        <svg viewBox="0 0 100 100" className="w-[min(92vw,900px)] aspect-square opacity-70">
          {[0, 1, 2].map((i) => (
            <circle key={i} cx="58" cy="46" r="2.2" fill="none" strokeWidth=".12" className="ripple-ring" style={{ '--i': i, stroke: 'var(--color-neon-cyan)' } as CSSProperties} />
          ))}
        </svg>
      </div>
      <div className="absolute inset-0 bg-gradient-to-b via-transparent pointer-events-none" style={{ backgroundImage: 'linear-gradient(to bottom, rgba(5,8,16,0.7), transparent, var(--color-void))' }} />

      <div className="relative z-10 flex-1 flex items-center mx-auto w-full max-w-7xl px-5 pt-24 pb-14 md:pt-28 md:pb-24">
        <div className="grid lg:grid-cols-[1.25fr_.75fr] gap-10 lg:gap-14 items-center w-full">
          {/* copy */}
          <div>
            <div className="reveal flex items-center gap-3 font-mono2 text-[10px] tracking-[0.3em] uppercase mb-7" style={{ color: 'var(--color-neon-cyan)' }}>
              <span className="w-8 h-px" style={{ backgroundColor: 'var(--color-brand-teal)' }} />
              {isAr ? 'مستقل · غير رسمي · تعليمي' : 'Independent · Unofficial · Educational'}
            </div>
            {isAr ? (
              <h1 className="ar-display" style={{ color: 'var(--color-text-primary)' }}>
                <span className="reveal block text-[clamp(2.2rem,6.4vw,5.4rem)]">مدرّب الطيران الذكي</span>
                <span className="reveal reveal-d1 block mt-2 text-[clamp(2rem,5.6vw,4.8rem)] text-glow" style={{ color: 'var(--color-neon-cyan)' }}>للأجواء السعودية.</span>
              </h1>
            ) : (
              <h1 className="font-black uppercase leading-[0.85] tracking-tight" style={{ color: 'var(--color-text-primary)' }}>
                <span className="block text-[clamp(2.4rem,7vw,6rem)]">
                  <Kinetic text="The AI flight" base={0.35} />
                </span>
                <span className="block text-[clamp(2.4rem,7vw,6rem)]">
                  <Kinetic text="instructor" base={0.75} />
                </span>
                <span className="serif-accent block mt-3 text-[clamp(2.2rem,6vw,5.2rem)] text-glow" style={{ color: 'var(--color-neon-cyan)' }}>
                  <Kinetic text="for Saudi skies." base={1.1} />
                </span>
              </h1>
            )}
            <p className="reveal reveal-d2 mt-7 max-w-xl text-[15px] leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
              {isAr ? (
                <>
                  كابتن عادل يجيب عن أسئلة أنظمة GACAR مع ذكر الجزء والمادة بدقة —
                  ويعتذر بدل أن يخمّن حين لا يجد سندًا للإجابة. عقل واحد يخدم{' '}
                  <span className="font-medium latin" style={{ color: 'var(--color-text-primary)' }}>captadel.com</span> مباشرةً و{' '}
                  <span className="font-medium latin" style={{ color: 'var(--color-text-primary)' }}>Fly GACA</span> عبر واجهته البرمجية.
                </>
              ) : (
                <>
                  Captain Adel answers GACAR questions with the exact Part and section cited —
                  and refuses rather than guess when he can't ground an answer. One brain,
                  serving <span className="font-medium" style={{ color: 'var(--color-text-primary)' }}>captadel.com</span> directly
                  and <span className="font-medium" style={{ color: 'var(--color-text-primary)' }}>Fly&nbsp;GACA</span> over its API.
                </>
              )}
            </p>
            <div className="reveal reveal-d3 mt-9 flex flex-wrap items-center gap-4">
              <a
                href="/chat"
                className="btn-swap magnetic font-mono2 text-[12px] tracking-[0.14em] uppercase px-6 py-3.5 font-semibold transition-colors duration-150"
                style={{ backgroundColor: 'var(--color-neon-cyan)', color: 'var(--color-void)' }}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--color-success)')}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'var(--color-neon-cyan)')}
              >
                <span className="bs-a">{isAr ? 'ابدأ السؤال ←' : 'Start asking →'}</span>
                <span className="bs-b">{isAr ? 'إذن إقلاع' : 'Cleared for takeoff'}</span>
              </a>
              <a
                href="/exam"
                className="btn-swap magnetic font-mono2 text-[12px] tracking-[0.14em] uppercase px-5 py-3.5 border transition-colors duration-150"
                style={{
                  borderColor: 'var(--color-brand-teal)',
                  color: 'var(--color-neon-cyan)'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = 'var(--color-neon-cyan)'
                  e.currentTarget.style.color = 'var(--color-void)'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'transparent'
                  e.currentTarget.style.color = 'var(--color-neon-cyan)'
                }}
              >
                <span className="bs-a">{isAr ? 'الاختبار التجريبي 🎓' : 'Mock Exam 🎓'}</span>
                <span className="bs-b">{isAr ? '٢٥ سؤالاً · ٣٠ د' : '25 Qs · 30 min'}</span>
              </a>
              <a
                href="#doctrine"
                className="link-right font-mono2 text-[12px] tracking-[0.14em] uppercase px-1 py-3.5 transition-colors duration-150"
                style={{ color: 'var(--color-text-secondary)' }}
                onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--color-neon-cyan)')}
                onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--color-text-secondary)')}
              >
                {isAr ? 'اقرأ العقيدة' : 'Read the doctrine'}
              </a>
            </div>
            {/* stat strip */}
            <div className="reveal reveal-d4 mt-9 md:mt-12 grid grid-cols-3 max-w-md divide-x border-y" style={{
              borderColor: 'var(--color-border)',
              '--tw-divide-opacity': '1',
              '--tw-divide-color': 'rgb(26 37 64 / var(--tw-divide-opacity))'
            } as CSSProperties}>
              {(isAr
                ? [
                    ['GACAR', 'مؤسَّس على النصوص'],
                    ['٦', 'مزوّدي نماذج'],
                    ['١٠٠٪', 'استشهد أو اعتذر'],
                  ]
                : [
                    ['GACAR', 'corpus-grounded'],
                    ['6', 'model providers'],
                    ['100%', 'cite or refuse'],
                  ]
              ).map(([big, small]) => (
                <div key={small} className="px-4 py-4">
                  <div className="font-mono2 text-xl font-bold" style={{ color: 'var(--color-text-primary)' }}>{big}</div>
                  <div className="font-mono2 text-[9px] tracking-[0.18em] uppercase mt-1" style={{ color: 'var(--color-text-secondary)' }}>{small}</div>
                </div>
              ))}
            </div>
          </div>

          {/* captain ID card + boot console */}
          <div className="reveal reveal-d2">
            <div className="magnetic backdrop-blur-sm shadow-[0_0_60px_rgba(34,211,238,0.07)]" style={{ border: '1px solid var(--color-void-900)', backgroundColor: 'rgba(12, 18, 32, 0.9)' }}>
              {/* card header */}
              <div className="flex items-center justify-between px-4 py-2.5" style={{ borderBottom: `1px solid var(--color-void-900)` }}>
                <span className="font-mono2 text-[10px] tracking-[0.24em] uppercase" style={{ color: 'var(--color-text-primary)' }}>{isAr ? 'الكابتن عادل' : 'Capt. Adel'}</span>
                <span className="flex items-center gap-2 font-mono2 text-[9px] tracking-[0.2em] uppercase" style={{ color: 'var(--color-success)' }}>
                  <span className="w-1.5 h-1.5 rounded-full anim-pulse-dot" style={{ backgroundColor: 'var(--color-success)' }} />
                  {isAr ? 'على التردد' : 'On frequency'}
                </span>
              </div>
              {/* portrait */}
              <div className="relative h-[240px] md:h-[290px] overflow-hidden" style={{ borderBottom: `1px solid var(--color-void-900)` }}>
                <img
                  src="/media/captain-adel.jpg"
                  alt={isAr ? 'كابتن عادل — مدرّب طيران ذكي' : 'Captain Adel — AI flight instructor'}
                  className="w-full h-full object-cover object-top"
                />
                {/* HUD corner brackets */}
                <span className="absolute top-3 left-3 w-5 h-5" style={{ borderTop: '1px solid var(--color-neon-cyan)', borderLeft: '1px solid var(--color-neon-cyan)', opacity: 0.8 }} />
                <span className="absolute top-3 right-3 w-5 h-5" style={{ borderTop: '1px solid var(--color-neon-cyan)', borderRight: '1px solid var(--color-neon-cyan)', opacity: 0.8 }} />
                <span className="absolute bottom-3 left-3 w-5 h-5" style={{ borderBottom: '1px solid var(--color-neon-cyan)', borderLeft: '1px solid var(--color-neon-cyan)', opacity: 0.8 }} />
                <span className="absolute bottom-3 right-3 w-5 h-5" style={{ borderBottom: '1px solid var(--color-neon-cyan)', borderRight: '1px solid var(--color-neon-cyan)', opacity: 0.8 }} />
                <span className="absolute top-3.5 left-1/2 -translate-x-1/2 font-mono2 text-[8px] tracking-[0.3em] uppercase px-2 py-0.5" style={{ color: 'var(--color-neon-cyan)', backgroundColor: 'rgba(5, 8, 16, 0.6)', opacity: 0.9 }}>
                  {isAr ? 'مدرّب طيران ذكي · GACAR' : 'AI Flight Instructor · GACAR'}
                </span>
                <div className="absolute inset-0 scanlines pointer-events-none" />
                <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t to-transparent" style={{ backgroundImage: 'linear-gradient(to top, var(--color-void-950), transparent)' }} />
              </div>
              {/* status strip */}
              <div className="grid grid-cols-3" style={{ borderBottom: `1px solid var(--color-void-900)` }}>
                {(isAr
                  ? [
                      ['التأسيس', 'مسلّح', 'var(--color-success)'],
                      ['المرجع', 'GACAR', 'var(--color-neon-cyan)'],
                      ['المسار', 'تلقائي', '#fbbf24'],
                    ]
                  : [
                      ['GROUNDING', 'ARMED', 'var(--color-success)'],
                      ['CORPUS', 'GACAR', 'var(--color-neon-cyan)'],
                      ['ROUTE', 'AUTO', '#fbbf24'],
                    ]
                ).map(([k, v, c], idx) => (
                  <div key={k} className="px-3 py-2.5 text-center" style={{ borderRight: idx < 2 ? `1px solid var(--color-void-900)` : undefined }}>
                    <div className="font-mono2 text-[8px] tracking-[0.22em] uppercase" style={{ color: 'var(--color-text-secondary)' }}>{k}</div>
                    <div className="font-mono2 text-[10px] font-semibold tracking-[0.14em] mt-0.5" style={{ color: c }}>{v}</div>
                  </div>
                ))}
              </div>
              {/* boot console → live Q&A demo (HeroDemo.tsx) */}
              <ConsoleDemo />
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
