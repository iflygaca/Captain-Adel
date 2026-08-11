import { useEffect, useState } from 'react'
import { isAr } from '../i18n'

function SectionTag({ n, label }: { n: string; label: string }) {
  return (
    <div className="reveal flex items-center gap-3 font-mono2 text-[10px] tracking-[0.3em] uppercase text-[#22d3ee] mb-6">
      <span className="px-2 py-1 border border-[#2d8ea8]">{n}</span>
      <span>{label}</span>
      <span className="flex-1 h-px bg-[#1a2540]" />
    </div>
  )
}

/* animated chat transcript */
const SCRIPT_EN = [
  { who: 'user', text: 'What are the VFR weather minima in controlled airspace?' },
  {
    who: 'adel',
    text: 'Below 10,000 ft MSL in Class C/D/E airspace you need 3 SM flight visibility and cloud clearance of 1,000 ft above, 500 ft below, and 2,000 ft horizontal.',
    cites: ['GACAR Part 91, §91.155'],
  },
  { who: 'user', text: 'And the fuel required for a VFR night flight?' },
  {
    who: 'adel',
    text: 'Fly to the first point of intended landing and then — considering wind and forecast — continue for at least 45 minutes at normal cruising speed.',
    cites: ['GACAR Part 91, §91.151'],
  },
  { who: 'user', text: 'What about suborbital hops over the Empty Quarter?' },
  {
    who: 'adel',
    text: "I can't ground that in the GACAR corpus. I'd rather refuse than guess — the authoritative source is always GACA at gaca.gov.sa.",
    cites: [],
    refusal: true,
  },
] as const

const SCRIPT_AR = [
  { who: 'user', text: 'ما حدود الطقس للطيران البصري في المجال الجوي الخاضع للرقابة؟' },
  {
    who: 'adel',
    text: 'تحت 10,000 قدم فوق مستوى سطح البحر في الأجواء من الفئة C/D/E تحتاج رؤية 3 أميال جوية، وابتعادًا عن السحب 1,000 قدم فوقها و500 قدم تحتها و2,000 قدم أفقيًا.',
    cites: ['GACAR Part 91, §91.155'],
  },
  { who: 'user', text: 'والوقود المطلوب لرحلة بصرية ليلية؟' },
  {
    who: 'adel',
    text: 'أن تطير إلى أول نقطة هبوط مقصودة ثم — مع مراعاة الرياح والتوقعات — تتابع 45 دقيقة إضافية على الأقل بسرعة عادية.',
    cites: ['GACAR Part 91, §91.151'],
  },
  { who: 'user', text: 'وماذا عن القفزات شبه المدارية فوق الربع الخالي؟' },
  {
    who: 'adel',
    text: 'لا أجد سندًا لذلك في نصوص GACAR. أفضّل الاعتذار على التخمين — والمصدر الرسمي دائمًا هو هيئة الطيران المدني gaca.gov.sa.',
    cites: [],
    refusal: true,
  },
] as const

const SCRIPT = isAr ? SCRIPT_AR : SCRIPT_EN

function ChatDemo() {
  const [step, setStep] = useState(0)
  useEffect(() => {
    const io = new IntersectionObserver(
      ([e]) => {
        if (!e.isIntersecting) return
        let i = 0
        const id = setInterval(() => {
          i += 1
          setStep(i)
          if (i >= SCRIPT.length) clearInterval(id)
        }, 900)
        io.disconnect()
      },
      { threshold: 0.4 }
    )
    const el = document.getElementById('chat-demo')
    if (el) io.observe(el)
    return () => io.disconnect()
  }, [])

  return (
    <div id="chat-demo" className="border border-[#1a2540] bg-[#0c1220]">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-[#1a2540]">
        <span className="font-mono2 text-[10px] tracking-[0.2em] uppercase text-[#8b98ad]">{isAr ? 'نص مباشر — captadel.com' : 'live transcript — captadel.com'}</span>
        <span className="flex items-center gap-1.5 font-mono2 text-[10px] text-[#34d399]">
          <span className="w-1.5 h-1.5 rounded-full bg-[#34d399] anim-pulse-dot" /> {isAr ? 'مباشر' : 'LIVE'}
        </span>
      </div>
      <div className="p-5 space-y-4 min-h-[380px]">
        {SCRIPT.slice(0, step).map((m, i) => (
          <div key={i} style={{ animation: 'rise-in .5s cubic-bezier(.22,.61,.36,1) both' }}
            className={m.who === 'user' ? 'flex justify-end' : 'flex justify-start'}>
            {m.who === 'user' ? (
              <div className="max-w-[85%] px-4 py-2.5 bg-[#111a2b] border border-[#1a2540] text-[13px] text-[#e6edf6]">
                {m.text}
              </div>
            ) : (
              <div className={`flex gap-3 max-w-[92%]`}>
                <img
                  src="/media/captain-chip.jpg"
                  alt="Captain Adel"
                  className="w-9 h-9 rounded-full object-cover border border-[#2d8ea8] shrink-0 mt-0.5"
                />
                <div className={`border-l-2 pl-4 py-1 ${'refusal' in m && m.refusal ? 'border-[#fbbf24]' : 'border-[#22d3ee]'}`}>
                <div className="font-mono2 text-[9px] tracking-[0.22em] uppercase text-[#8b98ad] mb-1.5">
                  {isAr ? 'كابتن عادل' : 'CAPTAIN ADEL'} {'refusal' in m && m.refusal && <span className="text-[#fbbf24]">{isAr ? '· اعتذار' : '· REFUSAL'}</span>}
                </div>
                <p className="text-[13px] leading-relaxed text-[#c6d2e2]">{m.text}</p>
                {m.cites.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {m.cites.map((c) => (
                      <span key={c} className="font-mono2 text-[10px] px-2 py-1 bg-[#22d3ee]/10 border border-[#2d8ea8]/50 text-[#22d3ee]">
                        ⧉ {c}
                      </span>
                    ))}
                  </div>
                )}
              </div>
              </div>
            )}
          </div>
        ))}
        {step < SCRIPT.length && <span className="anim-caret text-[#22d3ee] font-mono2">▌</span>}
      </div>
    </div>
  )
}

export default function Doctrine() {
  return (
    <section id="doctrine" className="relative py-28 px-5 overflow-hidden">
      <span className="ghost-word" aria-hidden>GROUND</span>
      <div className="relative z-10 mx-auto max-w-7xl">
        <SectionTag n="01" label={isAr ? 'العقيدة — استشهد أو اعتذر' : 'The doctrine — cite or refuse'} />
        <div className="grid lg:grid-cols-2 gap-14 items-start">
          <div>
            <h2 className="reveal text-[clamp(1.9rem,4vw,3rem)] font-extrabold leading-[1.05] tracking-tight text-[#e6edf6]">
              {isAr ? (
                <>كل إجابة تحمل <span className="text-[#22d3ee]">استشهادها</span>. وإلا فلن تغادر الأرض.</>
              ) : (
                <>Every answer carries its <span className="text-[#22d3ee]">citation</span>. Or it
                doesn't leave the ground.</>
              )}
            </h2>
            <p className="reveal reveal-d1 mt-6 text-[15px] leading-relaxed text-[#8b98ad] max-w-lg">
              {isAr
                ? 'لا مكان للتخمين الواثق في الطيران. الاسترجاع يتم برمجيًا من نصوص GACAR، تُسلَّم المقاطع المستشهَد بها إلى النموذج، وعادل يجيب منها فقط. وإن لم تكفِ النصوص، يقول ذلك — في كل مرة.'
                : "Aviation is no place for confident guessing. Retrieval runs in code over the GACAR corpus, the cited passages are handed to the model, and Adel answers only from them. If the corpus can't support the question, he says so — every time."}
            </p>
            <div className="mt-10 space-y-0 divide-y divide-[#1a2540] border-y border-[#1a2540]">
              {(isAr
                ? [
                    ['مؤسَّس', 'الاسترجاع هو مصدر الحقيقة — استرجاع أولًا، وقراءة ثانيًا.', 'mint'],
                    ['بنيوي', 'الاستشهادات تُستخرج وتُتحقق بنيويًا، لا تُؤخذ على ثقة من النموذج.', 'cyan'],
                    ['محصَّن', 'تحقق من المدخلات وتحصين ضد الحقن يحرسان كل طلب.', 'amber'],
                    ['بوابة تقييم', 'لا يُطلَق أي مزوّد حتى يطابق أو يتفوق على Gemini في بوابة التكافؤ.', 'mint'],
                  ]
                : [
                    ['GROUNDED', 'RAG is the source of truth for facts — retrieval first, reading second.', 'mint'],
                    ['STRUCTURAL', 'Citations are extracted and verified structurally, not trusted from the model.', 'cyan'],
                    ['HARDENED', 'Input validation plus soft injection hardening guard every request.', 'amber'],
                    ['EVAL-GATED', 'No provider ships until it matches-or-beats Gemini on the parity gate.', 'mint'],
                  ]
              ).map(([k, v, c], i) => (
                <div key={k} className={`reveal reveal-d${i + 1} flex gap-5 py-5`}>
                  <span className={`mt-1 w-2 h-2 rounded-full shrink-0 ${c === 'mint' ? 'bg-[#34d399] anim-pulse-dot' : c === 'amber' ? 'bg-[#fbbf24]' : 'bg-[#22d3ee] anim-pulse-cyan'}`} />
                  <div>
                    <div className="font-mono2 text-[11px] tracking-[0.22em] uppercase text-[#e6edf6]">{k}</div>
                    <p className="mt-1 text-[13px] leading-relaxed text-[#8b98ad]">{v}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="reveal reveal-d2 lg:sticky lg:top-24">
            <ChatDemo />
          </div>
        </div>
      </div>
    </section>
  )
}

export { SectionTag }
