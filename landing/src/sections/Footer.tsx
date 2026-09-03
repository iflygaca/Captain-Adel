import type { CSSProperties } from 'react'
import { RadarMark } from './Header'
import { useZuluClock } from '../hooks/useReveal'
import { isAr } from '../i18n'

export default function Footer() {
  const clockRef = useZuluClock()
  return (
    <footer className="relative px-5 pt-16 pb-10 overflow-hidden" style={{ borderTopColor: 'var(--color-void-raised)', borderTopWidth: '1px', borderTopStyle: 'solid' }}>
      <div className="mx-auto max-w-7xl">
        {/* CTA band */}
        <div className="reveal relative overflow-hidden mb-14" style={{ border: `1px solid var(--color-void-raised)` }}>
          <img
            src="/media/night-airfield.jpg"
            alt="Piper Arrow III under a starfield on the ramp at night"
            loading="lazy"
            className="absolute inset-0 w-full h-full object-cover"
          />
          <div className="absolute inset-0" style={{ backgroundColor: 'var(--color-void)', opacity: 0.72 }} />
          <div className="relative z-10 flex flex-col md:flex-row items-start md:items-end justify-between gap-8 px-8 md:px-12 py-14">
            <div>
              <div className="font-mono2 text-[10px] tracking-[0.3em] uppercase mb-4" style={{ color: 'var(--color-neon-cyan)' }}>{isAr ? '٠٦ — إذن إقلاع' : '06 — Cleared for takeoff'}</div>
              <h2 className="text-[clamp(1.8rem,4vw,2.8rem)] font-extrabold leading-tight tracking-tight text-white">
                {isAr ? 'كابتن عادل على التردد.' : 'Captain Adel is on frequency.'}
              </h2>
              <p className="mt-3 font-mono2 text-[10px] tracking-[0.18em] uppercase" style={{ color: 'var(--color-text-secondary)' }}>
                {isAr ? 'آرو III على الساحة الليلية — والأسئلة لا تتوقف عند الغروب' : "Arrow III on the night ramp — the questions don't stop at sunset"}
              </p>
            </div>
            <a href="/chat" className="btn-swap magnetic font-mono2 text-[12px] tracking-[0.14em] uppercase px-6 py-3.5 font-semibold transition-colors duration-150 shrink-0" style={{ backgroundColor: 'var(--color-neon-cyan)', color: 'var(--color-void)' }} onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--color-success)'} onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'var(--color-neon-cyan)'}>
              <span className="bs-a">{isAr ? 'اسأل سؤالك الأول ←' : 'Ask your first question →'}</span>
              <span className="bs-b">{isAr ? 'إنه يصغي' : "He's listening"}</span>
            </a>
          </div>
        </div>

        {/* radar ripple field behind the link grid */}
        <div className="relative">
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none overflow-hidden" aria-hidden>
            <svg viewBox="0 0 100 60" className="w-[560px] opacity-40">
              {[0, 1, 2, 3].map((i) => (
                <circle key={i} cx="50" cy="30" r="1.6" fill="none" strokeWidth=".1" className="ripple-ring" style={{ '--i': i, stroke: 'var(--color-neon-cyan)' } as CSSProperties} />
              ))}
            </svg>
          </div>
        <div className="relative grid md:grid-cols-3 gap-10 py-12">
          <div className="flex items-start gap-3">
            <RadarMark size={40} />
            <div>
              <div className="font-mono2 text-[12px] font-semibold tracking-[0.18em]" style={{ color: 'var(--color-text-primary)' }}>{isAr ? 'كابتن عادل' : 'CAPTAIN ADEL'}</div>
              <p className="mt-2 text-[12.5px] leading-relaxed max-w-xs" style={{ color: 'var(--color-text-secondary)' }}>
                {isAr
                  ? 'مدرّب طيران ذكي مستقل للطيران المدني السعودي. عقل واحد — مباشر على captadel.com، ومدمج في Fly GACA عبر الواجهة البرمجية.'
                  : 'An independent AI flight instructor for Saudi civil aviation. One brain — direct on captadel.com, embedded in Fly GACA via API.'}
              </p>
            </div>
          </div>
          <div className="font-mono2 text-[11px] leading-7 tracking-[0.08em]" style={{ color: 'var(--color-text-secondary)' }}>
            <div className="tracking-[0.24em] uppercase text-[10px] mb-3" style={{ color: 'var(--color-neon-cyan)' }}>{isAr ? 'التطبيقات والمراجع' : 'Applications & Tools'}</div>
            <a className="block transition-colors" href="/chat" style={{ color: 'var(--color-text-secondary)' }} onMouseEnter={(e) => e.currentTarget.style.color = 'var(--color-neon-cyan)'} onMouseLeave={(e) => e.currentTarget.style.color = 'var(--color-text-secondary)'}>{isAr ? 'كابتن عادل — المحادثة الذكية ↗' : 'Captain Adel — Smart Chat ↗'}</a>
            <a className="block transition-colors" href="/exam" style={{ color: 'var(--color-text-secondary)' }} onMouseEnter={(e) => e.currentTarget.style.color = 'var(--color-neon-cyan)'} onMouseLeave={(e) => e.currentTarget.style.color = 'var(--color-text-secondary)'}>{isAr ? 'اختبار GACAR التجريبي 🎓' : 'GACAR Mock Exam 🎓'}</a>
            <a className="block transition-colors" href="/tools" style={{ color: 'var(--color-text-secondary)' }} onMouseEnter={(e) => e.currentTarget.style.color = 'var(--color-neon-cyan)'} onMouseLeave={(e) => e.currentTarget.style.color = 'var(--color-text-secondary)'}>{isAr ? 'حاسبة الطيران الملاحية ✈️' : 'Aviation Flight Computer ✈️'}</a>
            <a className="block transition-colors" href="https://flygaca.com" target="_blank" rel="noreferrer" style={{ color: 'var(--color-text-secondary)' }} onMouseEnter={(e) => e.currentTarget.style.color = 'var(--color-neon-cyan)'} onMouseLeave={(e) => e.currentTarget.style.color = 'var(--color-text-secondary)'}>{isAr ? 'Fly GACA — مكتبة الطيران ↗' : 'Fly GACA — Aviation Library ↗'}</a>
            <a className="block transition-colors" href="https://github.com/ay2m" target="_blank" rel="noreferrer" style={{ color: 'var(--color-text-secondary)' }} onMouseEnter={(e) => e.currentTarget.style.color = 'var(--color-neon-cyan)'} onMouseLeave={(e) => e.currentTarget.style.color = 'var(--color-text-secondary)'}>{isAr ? 'Fly GACA على GitHub ↗' : 'Fly GACA on GitHub ↗'}</a>
          </div>
          <div className="font-mono2 text-[11px] leading-7 tracking-[0.08em]" style={{ color: 'var(--color-text-secondary)' }}>
            <div className="tracking-[0.24em] uppercase text-[10px] mb-3" style={{ color: 'var(--color-neon-cyan)' }}>{isAr ? 'الجهة الرسمية' : 'Authority'}</div>
            <a className="block transition-colors" href="https://gaca.gov.sa" target="_blank" rel="noreferrer" style={{ color: 'var(--color-text-secondary)' }} onMouseEnter={(e) => e.currentTarget.style.color = 'var(--color-neon-cyan)'} onMouseLeave={(e) => e.currentTarget.style.color = 'var(--color-text-secondary)'}>{isAr ? 'gaca.gov.sa — المصدر الرسمي' : 'gaca.gov.sa — the authoritative source'}</a>
            <a className="block transition-colors" href="/accessibility" style={{ color: 'var(--color-text-secondary)' }} onMouseEnter={(e) => e.currentTarget.style.color = 'var(--color-neon-cyan)'} onMouseLeave={(e) => e.currentTarget.style.color = 'var(--color-text-secondary)'}>{isAr ? 'إمكانية الوصول ↗' : 'Accessibility ↗'}</a>
            <span className="block">{isAr ? 'PDPL — معالجة داخل المملكة' : 'PDPL — processed in-Kingdom'}</span>
            <span className="block latin">Node 20 · proprietary license</span>
          </div>
        </div>
        </div>

        <div className="pt-8 flex flex-col md:flex-row items-start md:items-center justify-between gap-4" style={{ borderTopColor: 'var(--color-void-raised)', borderTopWidth: '1px', borderTopStyle: 'solid' }}>
          <p className="font-mono2 text-[10px] tracking-[0.1em] leading-relaxed max-w-2xl" style={{ color: 'var(--color-text-secondary)' }}>
            {isAr
              ? 'غير رسمي وتعليمي — كابتن عادل لا يتبع الهيئة العامة للطيران المدني (GACA) ولا يرعاها ولا يشغّلها. المصدر الرسمي لأي نظام هو دائمًا هيئة الطيران المدني.'
              : 'UNOFFICIAL & EDUCATIONAL — Captain Adel is not affiliated with, endorsed by, or operated by the General Authority of Civil Aviation (GACA). The authoritative source for any regulation is always GACA.'}
          </p>
          <div className="flex items-center gap-3 font-mono2 text-[10px] tracking-[0.14em] shrink-0" style={{ color: 'var(--color-text-secondary)' }}>
            <span ref={clockRef} />
            <span className="flex items-center gap-1.5" style={{ color: 'var(--color-success)' }}>
              <span className="w-1.5 h-1.5 rounded-full anim-pulse-dot" style={{ backgroundColor: 'var(--color-success)' }} />
              NOMINAL
            </span>
          </div>
        </div>
      </div>
    </footer>
  )
}
