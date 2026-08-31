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
    <div className="border border-[#1a2540] bg-[#0c1220]">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-[#1a2540]">
        <span className="font-mono2 text-[10px] tracking-[0.2em] uppercase" style={{ color: accent }}>{title}</span>
        <button
          onClick={() => { navigator.clipboard?.writeText(code).catch(() => {}); setCopied(true); setTimeout(() => setCopied(false), 1400) }}
          className="font-mono2 text-[10px] tracking-[0.14em] uppercase text-[#8b98ad] hover:text-[#22d3ee] transition-colors"
        >
          {copied ? (isAr ? '✓ نُسخ' : '✓ copied') : (isAr ? 'انسخ' : 'copy')}
        </button>
      </div>
      <pre className="p-5 overflow-x-auto font-mono2 text-[12px] leading-6 text-[#c6d2e2]">
        {code.split('\n').map((line, i) => (
          <div key={i}>
            {line.split(/("[^"]*"|GACAR[^"]*§\d+\.\d+|\/v1\/chat|200 OK|POST)/g).map((tok, j) => {
              let cls = ''
              if (/^"/.test(tok)) cls = 'text-[#34d399]'
              else if (/^(POST|GET)/.test(tok)) cls = 'text-[#22d3ee] font-semibold'
              else if (/^200 OK/.test(tok)) cls = 'text-[#34d399] font-semibold'
              else if (/GACAR/.test(tok)) cls = 'text-[#fbbf24]'
              return <span key={j} className={cls}>{tok}</span>
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
    <section id="api" className="relative py-16 md:py-28 px-5 bg-[#070b14] overflow-hidden">
      <span className="ghost-word" aria-hidden>/v1/chat</span>
      <div className="relative z-10 mx-auto max-w-7xl">
        <SectionTag n="04" label={isAr ? 'الواجهة البرمجية — عقل واحد، وجهان' : 'The API — one brain, two faces'} />
        <div className="grid lg:grid-cols-[.9fr_1.1fr] gap-14 items-start">
          <div>
            <h2 className="reveal text-[clamp(1.9rem,4vw,3rem)] font-extrabold leading-[1.05] tracking-tight text-[#e6edf6]">
              {isAr ? (
                <>العقل نفسه الذي يشغّل <span className="text-[#22d3ee] latin">Fly GACA</span> — خلف نقطة وصول واحدة.</>
              ) : (
                <>The same brain that powers <span className="text-[#22d3ee]">Fly&nbsp;GACA</span> — behind one endpoint.</>
              )}
            </h2>
            <p className="reveal reveal-d1 mt-6 text-[15px] leading-relaxed text-[#8b98ad] max-w-lg">
              {isAr
                ? 'captadel.com يخدم الطيارين والطلاب مباشرة؛ وFly GACA يتصل بالعقل نفسه عبر الواجهة البرمجية. خدمة Node واحدة تشغّل الموقع وواجهة المحادثة وقياس الحصص وطبقة الفوترة — وتُنشر داخل المملكة وفق نظام حماية البيانات الشخصية PDPL.'
                : 'captadel.com serves pilots and students directly; Fly GACA plugs into the identical brain over the API. A single Node service ships the site, the chat API, quota metering, and the billing layer — deployed in-Kingdom under PDPL.'}
            </p>
            <div className="reveal reveal-d2 mt-10 divide-y divide-[#1a2540] border-y border-[#1a2540]">
              {ENDPOINTS.map(([m, p, d], i) => (
                <div key={i} className="flex items-center gap-4 py-4">
                  <span className={`font-mono2 text-[10px] tracking-[0.18em] w-11 shrink-0 ${m === 'GET' ? 'text-[#34d399]' : m === 'POST' ? 'text-[#22d3ee]' : 'text-[#fbbf24]'}`}>{m}</span>
                  <span className="font-mono2 text-[12.5px] text-[#e6edf6]">{p}</span>
                  <span className="ml-auto text-[11.5px] text-[#8b98ad] text-right">{d}</span>
                </div>
              ))}
            </div>
            <a
              href="https://github.com/ay2m/Captain-Adel"
              target="_blank"
              rel="noreferrer"
              className="reveal reveal-d3 inline-flex items-center gap-2 mt-8 font-mono2 text-[12px] tracking-[0.14em] uppercase px-6 py-3.5 border border-[#2d8ea8] text-[#22d3ee] hover:bg-[#22d3ee] hover:text-[#050810] transition-colors duration-150"
            >
              {isAr ? '⌥ مستودع Captain-Adel على GitHub ←' : '⌥ Captain-Adel on GitHub →'}
            </a>
          </div>
          <div className="space-y-6">
            <div className="reveal reveal-d1"><CodePane title="request" code={REQUEST} accent="#22d3ee" /></div>
            <div className="reveal reveal-d2"><CodePane title="response — grounded" code={RESPONSE} accent="#34d399" /></div>
          </div>
        </div>
      </div>
    </section>
  )
}
