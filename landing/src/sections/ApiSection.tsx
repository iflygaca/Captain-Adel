import { useState } from 'react'
import { SectionTag } from './Doctrine'
import { isAr } from '../i18n'

const REQUEST = `POST /v1/chat

{
  "message":  "What are the VFR weather minima?",
  "history":  [],
  "session":  "…stable-per-browser-id",
  "product":  "captadel",        // or "flygaca"
  "provider": "auto"             // gemini | allam | jais | fanar
                               // | qwen | commandr | auto
}`

const RESPONSE = `200 OK

{
  "answer":  "…markdown with grounded citations…",
  "sources": [
    {
      "citation": "GACAR Part 91, §91.155",
      "url":      "https://gaca.gov.sa/…"
    }
  ]
}`

function CodePane({ title, code, accent }: { title: string; code: string; accent: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <div style={{ border: '1px solid var(--color-void-900)', backgroundColor: 'var(--color-void-950)' }}>
      <div className="flex items-center justify-between px-4 py-2.5" style={{ borderBottom: '1px solid var(--color-void-900)' }}>
        <span className="font-mono2 text-[10px] tracking-[0.2em] uppercase" style={{ color: accent }}>{title}</span>
        <button
          onClick={() => { navigator.clipboard?.writeText(code).catch(() => {}); setCopied(true); setTimeout(() => setCopied(false), 1400) }}
          className="font-mono2 text-[10px] tracking-[0.14em] uppercase transition-colors"
          style={{ color: 'var(--color-text-secondary)' }}
          onMouseEnter={(e) => e.currentTarget.style.color = 'var(--color-neon-cyan)'}
          onMouseLeave={(e) => e.currentTarget.style.color = 'var(--color-text-secondary)'}
        >
          {copied ? (isAr ? '✓ نُسخ' : '✓ copied') : (isAr ? 'انسخ' : 'copy')}
        </button>
      </div>
      <pre className="p-5 overflow-x-auto font-mono2 text-[12px] leading-6" style={{ color: 'var(--color-text-secondary)' }}>
        {code.split('\n').map((line, i) => (
          <div key={i}>
            {line.split(/("[^"]*"|GACAR[^"]*§\d+\.\d+|\/v1\/chat|200 OK|POST)/g).map((tok, j) => {
              let style = {}
              if (/^"/.test(tok)) style = { color: 'var(--color-success)' }
              else if (/^(POST|GET)/.test(tok)) style = { color: 'var(--color-neon-cyan)', fontWeight: '600' }
              else if (/^200 OK/.test(tok)) style = { color: 'var(--color-success)', fontWeight: '600' }
              else if (/GACAR/.test(tok)) style = { color: 'var(--color-amber)' }
              return <span key={j} style={style}>{tok}</span>
            })}
          </div>
        ))}
      </pre>
    </div>
  )
}

const ENDPOINTS = isAr
  ? [
      ['GET', '/health', '{ status:"ok", service:"captain-adel" }'],
      ['POST', '/v1/chat', 'إجابة مؤسَّسة + المصادر'],
      ['HDR', 'X-Adel-Api-Key', 'المتصلون الموثوقون يتجاوزون محدّد المتصفح'],
      ['HDR', 'X-Adel-Session', 'جلسة ثابتة لتحديد المعدل'],
    ]
  : [
      ['GET', '/health', '{ status:"ok", service:"captain-adel" }'],
      ['POST', '/v1/chat', 'grounded answer + sources'],
      ['HDR', 'X-Adel-Api-Key', 'trusted callers skip the browser limiter'],
      ['HDR', 'X-Adel-Session', 'stable session for rate limiting'],
    ]

export default function ApiSection() {
  return (
    <section id="api" className="relative py-16 md:py-28 px-5 overflow-hidden" style={{ backgroundColor: 'var(--color-void)' }}>
      <span className="ghost-word" aria-hidden>/v1/chat</span>
      <div className="relative z-10 mx-auto max-w-7xl">
        <SectionTag n="04" label={isAr ? 'الواجهة البرمجية — عقل واحد، وجهان' : 'The API — one brain, two faces'} />
        <div className="grid lg:grid-cols-[.9fr_1.1fr] gap-14 items-start">
          <div>
            <h2 className="reveal text-[clamp(1.9rem,4vw,3rem)] font-extrabold leading-[1.05] tracking-tight" style={{ color: 'var(--color-text-primary)' }}>
              {isAr ? (
                <>العقل نفسه الذي يشغّل <span className="latin" style={{ color: 'var(--color-neon-cyan)' }}>Fly GACA</span> — خلف نقطة وصول واحدة.</>
              ) : (
                <>The same brain that powers <span style={{ color: 'var(--color-neon-cyan)' }}>Fly&nbsp;GACA</span> — behind one endpoint.</>
              )}
            </h2>
            <p className="reveal reveal-d1 mt-6 text-[15px] leading-relaxed max-w-lg" style={{ color: 'var(--color-text-secondary)' }}>
              {isAr
                ? 'captadel.com يخدم الطيارين والطلاب مباشرة؛ وFly GACA يتصل بالعقل نفسه عبر الواجهة البرمجية. خدمة Node واحدة تشغّل الموقع وواجهة المحادثة وقياس الحصص وطبقة الفوترة — وتُنشر داخل المملكة وفق نظام حماية البيانات الشخصية PDPL.'
                : 'captadel.com serves pilots and students directly; Fly GACA plugs into the identical brain over the API. A single Node service ships the site, the chat API, quota metering, and the billing layer — deployed in-Kingdom under PDPL.'}
            </p>
            <div className="reveal reveal-d2 mt-10" style={{ borderTop: '1px solid var(--color-void-900)', borderBottom: '1px solid var(--color-void-900)' }}>
              {ENDPOINTS.map(([m, p, d], i) => (
                <div key={i} className="flex items-center gap-4 py-4" style={{ borderBottom: i < ENDPOINTS.length - 1 ? '1px solid var(--color-void-900)' : 'none' }}>
                  <span
                    className="font-mono2 text-[10px] tracking-[0.18em] w-11 shrink-0"
                    style={{ color: m === 'GET' ? 'var(--color-success)' : m === 'POST' ? 'var(--color-neon-cyan)' : 'var(--color-amber)' }}
                  >
                    {m}
                  </span>
                  <span className="font-mono2 text-[12.5px]" style={{ color: 'var(--color-text-primary)' }}>{p}</span>
                  <span className="ml-auto text-[11.5px] text-right" style={{ color: 'var(--color-text-secondary)' }}>{d}</span>
                </div>
              ))}
            </div>
            <a
              href="https://github.com/ay2m/Captain-Adel"
              target="_blank"
              rel="noreferrer"
              className="reveal reveal-d3 inline-flex items-center gap-2 mt-8 font-mono2 text-[12px] tracking-[0.14em] uppercase px-6 py-3.5 transition-colors duration-150"
              style={{ borderColor: 'var(--color-brand-teal-dark)', border: '1px solid var(--color-brand-teal-dark)', color: 'var(--color-neon-cyan)' }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = 'var(--color-neon-cyan)'
                e.currentTarget.style.color = 'var(--color-void)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'transparent'
                e.currentTarget.style.color = 'var(--color-neon-cyan)'
              }}
            >
              {isAr ? '⌥ مستودع Captain-Adel على GitHub ←' : '⌥ Captain-Adel on GitHub →'}
            </a>
          </div>
          <div className="space-y-6">
            <div className="reveal reveal-d1"><CodePane title="request" code={REQUEST} accent="var(--color-neon-cyan)" /></div>
            <div className="reveal reveal-d2"><CodePane title="response — grounded" code={RESPONSE} accent="var(--color-success)" /></div>
          </div>
        </div>
      </div>
    </section>
  )
}
