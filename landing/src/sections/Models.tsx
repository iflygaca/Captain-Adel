import type { CSSProperties } from 'react'
import { isAr } from '../i18n'

const MODELS_EN = [
  { name: 'Gemini 2.5 Flash', org: 'Google', strategy: 'agentic function-calling', role: 'default English path', status: 'live', license: 'API' },
  { name: 'ALLaM-7B-Instruct', org: 'HUMAIN', strategy: 'retrieve-then-read', role: 'Arabic / in-Kingdom (default)', status: 'candidate', license: 'Apache-2.0' },
  { name: 'Jais', org: 'Inception / G42', strategy: 'retrieve-then-read', role: 'Arabic candidate', status: 'candidate', license: '—' },
  { name: 'Fanar', org: 'QCRI', strategy: 'retrieve-then-read', role: 'Arabic candidate', status: 'candidate', license: '—' },
  { name: 'Qwen2.5-Instruct', org: 'Alibaba', strategy: 'retrieve-then-read', role: 'instruction-following workhorse', status: 'candidate', license: 'Apache-2.0' },
  { name: 'Command R', org: 'Cohere', strategy: 'retrieve-then-read', role: 'grounded-citation eval', status: 'eval-only', license: 'CC-BY-NC ⚠' },
]

const MODELS_AR = [
  { name: 'Gemini 2.5 Flash', org: 'Google', strategy: 'استدعاء وظائف وكيلي', role: 'المسار الإنجليزي الافتراضي', status: 'live', license: 'API' },
  { name: 'ALLaM-7B-Instruct', org: 'HUMAIN', strategy: 'استرجع ثم اقرأ', role: 'العربية / داخل المملكة (افتراضي)', status: 'candidate', license: 'Apache-2.0' },
  { name: 'Jais', org: 'Inception / G42', strategy: 'استرجع ثم اقرأ', role: 'مرشّح عربي', status: 'candidate', license: '—' },
  { name: 'Fanar', org: 'QCRI', strategy: 'استرجع ثم اقرأ', role: 'مرشّح عربي', status: 'candidate', license: '—' },
  { name: 'Qwen2.5-Instruct', org: 'Alibaba', strategy: 'استرجع ثم اقرأ', role: 'صاحب الأعباء التعليمية', status: 'candidate', license: 'Apache-2.0' },
  { name: 'Command R', org: 'Cohere', strategy: 'استرجع ثم اقرأ', role: 'تقييم الاستشهاد المؤسَّس', status: 'eval-only', license: 'CC-BY-NC ⚠' },
]

const MODELS = isAr ? MODELS_AR : MODELS_EN

const STATUS_STYLE: Record<string, { dot: string; text: string; label: string }> = {
  live: { dot: 'bg-[#059669]', text: 'text-[#059669]', label: isAr ? 'مباشر' : 'LIVE' },
  candidate: { dot: 'bg-[#0e7490]', text: 'text-[#0e7490]', label: isAr ? 'مرشّح' : 'CANDIDATE' },
  'eval-only': { dot: 'bg-[#b45309]', text: 'text-[#b45309]', label: isAr ? 'تقييم فقط' : 'EVAL ONLY' },
}

export default function Models() {
  return (
    <section id="models" className="paper relative py-16 md:py-28 px-5 overflow-hidden">
      <span className="ghost-word" aria-hidden>ROSTER</span>
      <div className="relative z-10 mx-auto max-w-7xl">
        <div className="reveal flex items-center gap-3 font-mono2 text-[10px] tracking-[0.3em] uppercase text-[#0e7490] mb-6">
          <span className="px-2 py-1 border border-[#0e7490]/50">03</span>
          <span>{isAr ? 'خط الطيران — قائمة النماذج' : 'The flight line — model roster'}</span>
          <span className="flex-1 h-px bg-[#d8d3c6]" />
        </div>
        <div className="flex flex-wrap items-end justify-between gap-6 mb-12">
          <h2 className="reveal max-w-2xl text-[clamp(1.9rem,4vw,3rem)] font-extrabold leading-[1.05] tracking-tight text-[#10151f]">
            {isAr ? (
              <>ستة مزوّدين. مصنع واحد.{' '}
              <span className="font-normal text-[#0e7490]">وبوابة تكافؤ</span> قبل أن يحمل أيٌّ منهم ركّابًا.</>
            ) : (
              <>Six providers. One factory.{' '}
              <span className="serif-accent font-normal text-[#0e7490]">A parity gate</span> before
              any of them carries passengers.</>
            )}
          </h2>
          <p className="reveal reveal-d1 max-w-sm text-[13px] leading-relaxed text-[#5b6472]">
            {isAr ? (
              <>كل مزوّد غير Gemini مبني من عميل واحد متوافق مع OpenAI — إضافة آخر بضعة أسطر. <span className="font-mono2 text-[#0e7490] latin">auto</span> يوجّه
              الأسئلة العربية إلى أول مزوّد عربي مُعدّ.</>
            ) : (
              <>Every non-Gemini provider is built from a single OpenAI-compatible client — adding
              another is a few lines. <span className="font-mono2 text-[#0e7490]">auto</span> routes
              Arabic-dominant questions to the first configured Arabic provider.</>
            )}
          </p>
        </div>

        {/* phones: stacked cards — the 5-column table clipped to 2 columns at 390px */}
        <div className="reveal reveal-d2 md:hidden grid gap-3">
          {MODELS.map((m, i) => {
            const s = STATUS_STYLE[m.status]
            return (
              <div
                key={m.name}
                className="border border-[#d8d3c6] bg-[#faf8f2] p-4 shadow-[0_1px_0_#d8d3c6]"
                style={{ '--i': i } as CSSProperties}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-[15px] font-semibold text-[#10151f]">{m.name}</div>
                    <div className="font-mono2 text-[10px] tracking-[0.12em] text-[#5b6472] mt-0.5">{m.org}</div>
                  </div>
                  <span className={`flex shrink-0 items-center gap-1.5 font-mono2 text-[9.5px] tracking-[0.18em] ${s.text}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
                    {s.label}
                  </span>
                </div>
                <dl className="mt-3 pt-3 border-t border-[#e6e1d4] grid gap-2 text-[12.5px]">
                  {([
                    [isAr ? 'الاستراتيجية' : 'Strategy', <span className="font-mono2 text-[11.5px] text-[#0e7490]">{m.strategy}</span>],
                    [isAr ? 'التكليف' : 'Assignment', <span className="text-[#5b6472]">{m.role}</span>],
                    [isAr ? 'الرخصة' : 'License', <span className="font-mono2 text-[11px] text-[#5b6472]">{m.license}</span>],
                  ] as const).map(([k, v]) => (
                    <div key={k} className="flex items-baseline justify-between gap-4">
                      <dt className="font-mono2 text-[9.5px] tracking-[0.18em] uppercase text-[#5b6472] shrink-0">{k}</dt>
                      <dd className="text-end">{v}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            )
          })}
        </div>

        <div className="reveal reveal-d2 hidden md:block border border-[#d8d3c6] bg-[#faf8f2] shadow-[0_1px_0_#d8d3c6,0_12px_32px_-16px_rgba(16,21,31,0.18)] overflow-x-auto">
          <table className="w-full min-w-[760px] text-left">
            <thead>
              <tr className="border-b border-[#d8d3c6] font-mono2 text-[10px] tracking-[0.22em] uppercase text-[#5b6472]">
                <th className="px-5 py-4 font-medium">{isAr ? 'المزوّد' : 'Provider'}</th>
                <th className="px-5 py-4 font-medium">{isAr ? 'الاستراتيجية' : 'Strategy'}</th>
                <th className="px-5 py-4 font-medium">{isAr ? 'التكليف' : 'Assignment'}</th>
                <th className="px-5 py-4 font-medium">{isAr ? 'الرخصة' : 'License'}</th>
                <th className="px-5 py-4 font-medium text-right">{isAr ? 'الحالة' : 'Status'}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#e6e1d4]">
              {MODELS.map((m) => {
                const s = STATUS_STYLE[m.status]
                return (
                  <tr key={m.name} className="group hover:bg-[#efeadf] transition-colors duration-150">
                    <td className="px-5 py-4">
                      <div className="text-[14px] font-semibold text-[#10151f]">{m.name}</div>
                      <div className="font-mono2 text-[10px] tracking-[0.12em] text-[#5b6472] mt-0.5">{m.org}</div>
                    </td>
                    <td className="px-5 py-4 font-mono2 text-[11.5px] text-[#0e7490]">{m.strategy}</td>
                    <td className="px-5 py-4 text-[12.5px] text-[#5b6472]">{m.role}</td>
                    <td className="px-5 py-4 font-mono2 text-[11px] text-[#5b6472]">{m.license}</td>
                    <td className="px-5 py-4">
                      <span className={`flex items-center justify-end gap-2 font-mono2 text-[10px] tracking-[0.18em] ${s.text}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
                        {s.label}
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        <p className="reveal reveal-d3 mt-6 font-mono2 text-[10px] tracking-[0.14em] text-[#5b6472]">
          ⚠ Command R is CC-BY-NC — evaluation and research only. Vision systems (Baseer, Sawaher) are not chat models and do not fit this text-only RAG path.
        </p>
      </div>
    </section>
  )
}
