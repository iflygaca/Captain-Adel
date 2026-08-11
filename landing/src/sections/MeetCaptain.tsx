import { useEffect, useRef, useState } from 'react'
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

const RECORD: Array<[string, string]> = isAr
  ? [
      ['النداء', 'ADEL-1'],
      ['القاعدة', 'الرياض — OERK'],
      ['الرتبة', 'مدرّب طيران ذكي · GACAR'],
      ['اللغات', 'العربية · ENGLISH'],
      ['أول عاداته', 'يستشهد بالمادة قبل الإجابة'],
      ['الإرسال', '٢٤/٧ · على التردد'],
    ]
  : [
      ['CALLSIGN', 'ADEL-1'],
      ['HOME BASE', 'OERK — RIYADH'],
      ['RATING', 'AI FLIGHT INSTRUCTOR · GACAR'],
      ['LANGUAGES', 'العربية · ENGLISH'],
      ['FIRST HABIT', 'CITES THE PART BEFORE THE ANSWER'],
      ['DISPATCH', '24/7 · ON FREQUENCY'],
    ]

type QA = {
  q: string
  a: string
  cites: string[]
  rtl?: boolean
  note?: string
}

const FREQUENCY: QA[] = isAr ? [
  {
    q: 'ما الحد الأدنى للوقود في رحلة بصرية ليلية؟',
    a: 'يكفي للطيران إلى أول نقطة هبوط مقصودة ثم — مع مراعاة الرياح والتوقعات — 45 دقيقة إضافية على الأقل بسرعة عادية. بلا اختصارات — الوقود هو الخيار الذي لن تندم على حمله أبدًا.',
    cites: ['GACAR Part 91, §91.151'],
    rtl: true,
  },
  {
    q: 'ما حدود الرؤية والابتعاد عن السحب للطيران البصري؟',
    a: 'في المجال الجوي الخاضع للرقابة وتحت 10,000 قدم: رؤية 3 أميال جوية، والابتعاد عن السحب 1,000 قدم فوقها و500 قدم تحتها و2,000 قدم أفقيًا. احفظها كما تحفظ اسمك — الفحص يسأل عنها دائمًا.',
    cites: ['GACAR Part 91, §91.155'],
    rtl: true,
  },
  {
    q: 'هل يمكنك اعتماد أول طيران منفرد لي؟',
    a: 'هذا يبقى من صلاحية مدرّب بشري — اعتمادات الطيران المنفرد امتياز من الجزء 61 لا أملكه ولن أدّعيه. لكن اسألني عن متطلباته وسأدرّبك عليها حتى تصبح ردّ فعل.',
    cites: ['GACAR Part 61, §61.87'],
    note: 'يعرف حدوده',
    rtl: true,
  },
] : [
  {
    q: 'Minimum fuel for a VFR night flight?',
    a: 'Enough to fly to the first point of intended landing and then, considering wind and forecast, at least 45 minutes at normal cruising speed. No shortcuts — fuel is the option you never regret carrying.',
    cites: ['GACAR Part 91, §91.151'],
  },
  {
    q: 'ما حدود الرؤية والابتعاد عن السحب للطيران البصري؟',
    a: 'في المجال الجوي الخاضع للرقابة وتحت 10,000 قدم: رؤية 3 أميال جوية، والابتعاد عن السحب 1,000 قدم فوقها و500 قدم تحتها و2,000 قدم أفقيًا. احفظها كما تحفظ اسمك — الفحص يسأل عنها دائمًا.',
    cites: ['GACAR Part 91, §91.155'],
    rtl: true,
  },
  {
    q: 'Can you sign off my first solo?',
    a: "That one stays with a human CFI — solo endorsements are a Part 61 privilege I don't hold, and I won't pretend otherwise. But ask me the solo requirements and I'll drill you until they're reflexes.",
    cites: ['GACAR Part 61, §61.87'],
    note: 'KNOWS HIS LIMITS',
  },
]

function FrequencyDemo() {
  const [active, setActive] = useState<QA | null>(null)
  const [typed, setTyped] = useState(0)
  const timer = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    if (!active) return
    setTyped(0)
    timer.current = setInterval(() => {
      setTyped((t) => {
        if (t >= active.a.length) {
          if (timer.current) clearInterval(timer.current)
          return t
        }
        return t + 2
      })
    }, 18)
    return () => {
      if (timer.current) clearInterval(timer.current)
    }
  }, [active])

  return (
    <div className="reveal mt-16 border border-[#1a2540] bg-[#0c1220]/80">
      <div className="flex items-center justify-between px-5 py-3 border-b border-[#1a2540]">
        <span className="font-mono2 text-[10px] tracking-[0.24em] uppercase text-[#8b98ad]">
          {isAr ? 'على التردد — جرّبه' : 'On the frequency — try him'}
        </span>
        <span className="flex items-center gap-2 font-mono2 text-[9px] tracking-[0.2em] uppercase text-[#34d399]">
          <span className="w-1.5 h-1.5 rounded-full bg-[#34d399] anim-pulse-dot" />
          {isAr ? 'مباشر' : 'Live'}
        </span>
      </div>
      <div className="p-5 md:p-6">
        <div className="flex flex-wrap gap-3">
          {FREQUENCY.map((item) => (
            <button
              key={item.q}
              onClick={() => setActive(item)}
              dir={item.rtl ? 'rtl' : 'ltr'}
              className={`font-mono2 text-[11px] tracking-[0.06em] px-4 py-2.5 border transition-colors duration-150 ${
                active?.q === item.q
                  ? 'border-[#22d3ee] text-[#22d3ee] bg-[#22d3ee]/5'
                  : 'border-[#1a2540] text-[#8b98ad] hover:border-[#2d8ea8] hover:text-[#e6edf6]'
              }`}
            >
              {item.q}
            </button>
          ))}
        </div>

        {active ? (
          <div className="mt-6 flex gap-3">
            <img
              src="/media/captain-chip.jpg"
              alt="Captain Adel"
              className="w-9 h-9 rounded-full object-cover border border-[#2d8ea8] shrink-0"
            />
            <div className="flex-1 border-l-2 border-[#2d8ea8] bg-[#111a2b]/70 px-4 py-3">
              <p
                dir={active.rtl ? 'rtl' : 'ltr'}
                className={`text-[14px] leading-relaxed text-[#e6edf6] ${active.rtl ? 'text-right' : ''}`}
              >
                {active.a.slice(0, typed)}
                {typed < active.a.length && <span className="anim-caret text-[#22d3ee]">▌</span>}
              </p>
              {typed >= active.a.length && (
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {active.cites.map((c) => (
                    <span
                      key={c}
                      className="font-mono2 text-[9px] tracking-[0.14em] uppercase px-2 py-1 border border-[#22d3ee]/40 text-[#22d3ee]"
                    >
                      ⧉ {c}
                    </span>
                  ))}
                  {active.note && (
                    <span className="font-mono2 text-[9px] tracking-[0.14em] uppercase px-2 py-1 border border-[#fbbf24]/40 text-[#fbbf24]">
                      {active.note}
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="mt-6 border border-dashed border-[#1a2540] px-4 py-6 text-center font-mono2 text-[10px] tracking-[0.2em] uppercase text-[#8b98ad]">
            {isAr ? 'اضغط زر الإرسال — اختر سؤالًا وعادل يجيب بالاستشهاد' : 'Key the mic — pick a question and Adel answers with the citation'}
          </div>
        )}
      </div>
    </div>
  )
}

export default function MeetCaptain() {
  return (
    <section id="captain" className="relative py-28 md:py-36 overflow-hidden">
      <span className="ghost-word top-8 right-[-2rem]" aria-hidden style={{ fontFamily: "'Segoe UI', system-ui, sans-serif" }}>
        كابتن
      </span>
      <div className="relative mx-auto max-w-7xl px-5">
        <SectionTag n="02" label={isAr ? 'الكابتن — الملف الشخصي' : 'The Captain — Personnel File'} />

        <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-start">
          {/* instructor portrait */}
          <figure className="reveal clip-reveal relative border border-[#1a2540]">
            <img
              src="/media/captain-instructor.jpg"
              alt={isAr ? 'كابتن عادل يشرح مسارًا على خريطة زجاجية' : 'Captain Adel briefing a route on a glass chart'}
              className="w-full object-cover"
            />
            <span className="absolute top-3 left-3 w-5 h-5 border-t border-l border-[#22d3ee]/80" />
            <span className="absolute top-3 right-3 w-5 h-5 border-t border-r border-[#22d3ee]/80" />
            <span className="absolute bottom-12 left-3 w-5 h-5 border-b border-l border-[#22d3ee]/80" />
            <span className="absolute bottom-12 right-3 w-5 h-5 border-b border-r border-[#22d3ee]/80" />
            <div className="absolute inset-0 scanlines pointer-events-none" />
            <figcaption className="absolute inset-x-0 bottom-0 px-4 py-2.5 bg-[#050810]/85 border-t border-[#1a2540] font-mono2 text-[9px] tracking-[0.22em] uppercase text-[#8b98ad]">
              {isAr ? 'غرفة الإحاطة — حيث تكفّ GACAR عن الملل' : 'Briefing room — where GACAR stops being boring'}
            </figcaption>
          </figure>

          {/* dossier */}
          <div>
            <h2 className="reveal text-[clamp(2rem,4.5vw,3.4rem)] font-extrabold leading-[1.02] tracking-tight text-[#e6edf6]">
              {isAr ? <>كابتن عادل <span className="text-[#22d3ee] latin text-[0.55em]">/ Captain Adel</span></> : <>Captain Adel <span className="text-[#22d3ee]">/ كابتن عادل</span></>}
            </h2>
            <p className="reveal reveal-d1 mt-5 max-w-lg text-[15px] leading-relaxed text-[#8b98ad]">
              {isAr
                ? 'تربّى على نصوص GACAR وصقله كل طالب تجمد أمام سؤال في فحص الطيران. يعلّم كما يفعل كابتن الخط المحنّك — هادئ، دقيق، وعاجز تمامًا عن الادعاء.'
                : 'Raised on the GACAR corpus and polished by every student who ever blanked on a checkride question. He teaches the way a good line captain does — calm, exact, and completely unable to bluff.'}
            </p>

            {/* service record */}
            <div className="reveal reveal-d2 mt-8 border border-[#1a2540] divide-y divide-[#1a2540]">
              {RECORD.map(([k, v]) => (
                <div key={k} className="flex items-baseline justify-between gap-4 px-4 py-2.5">
                  <span className="font-mono2 text-[9px] tracking-[0.24em] uppercase text-[#8b98ad] shrink-0">{k}</span>
                  <span className="font-mono2 text-[11px] tracking-[0.1em] text-[#e6edf6] text-right">{v}</span>
                </div>
              ))}
            </div>

            {/* signature doctrine */}
            <blockquote className="reveal reveal-d3 mt-8 border-l-2 border-[#34d399] pl-5">
              <p className="text-xl md:text-2xl font-bold text-[#e6edf6] leading-snug">
                {isAr ? '«استشهد، أو كأن شيئًا لم يكن»' : '“Cite it, or it didn\'t happen.”'}
              </p>
              <p dir={isAr ? 'ltr' : 'rtl'} className={`mt-2 text-lg font-semibold text-[#34d399] ${isAr ? 'text-left' : 'text-right'}`}>
                {isAr ? '“Cite it, or it didn’t happen.”' : '«الاستشهاد أو الصمت»'}
              </p>
              <footer className="mt-2 font-mono2 text-[9px] tracking-[0.24em] uppercase text-[#8b98ad]">
                {isAr ? '— أمره الدائم، باللغتين' : '— his standing order, in both languages'}
              </footer>
            </blockquote>
          </div>
        </div>

        <FrequencyDemo />

        {/* captain's log — field scenes */}
        <div className="reveal mt-16 flex items-center gap-3 font-mono2 text-[10px] tracking-[0.3em] uppercase text-[#22d3ee] mb-8">
          <span className="w-8 h-px bg-[#2d8ea8]" />
          {isAr ? 'سجل الكابتن — مذكرات ميدانية' : "Captain's log — field notes"}
          <span className="flex-1 h-px bg-[#1a2540]" />
        </div>
        <div className="h-snap reveal -mx-5 px-5">
          {(isAr
            ? [
                { src: '/media/log-walkaround.jpg', alt: 'كابتن عادل يجري الفحص الخارجي عند الفجر', cap: 'الفحص الخارجي — التفتيش لا يكذب أبدًا' },
                { src: '/media/log-debrief.jpg', alt: 'كابتن عادل يدوّن ملاحظات ما بعد الرحلة مع قهوة عربية', cap: 'ما بعد الرحلة — القهوة تبرد والجزء 91 لا' },
                { src: '/media/log-holding.jpg', alt: 'كابتن عادل ينتظر عند نقطة انتظار المدرج وقت الغسق', cap: 'نقطة الانتظار — الصبر إجراء منشور' },
                { src: '/media/captain-instructor.jpg', alt: 'كابتن عادل يشرح مسارًا على خريطة زجاجية', cap: 'غرفة الإحاطة — حيث تكفّ GACAR عن الملل' },
              ]
            : [
                { src: '/media/log-walkaround.jpg', alt: 'Captain Adel performing a pre-flight walkaround at dawn', cap: 'Walkaround — the preflight never lies' },
                { src: '/media/log-debrief.jpg', alt: 'Captain Adel writing debrief notes over Arabic coffee', cap: 'Debrief — coffee goes cold over Part 91' },
                { src: '/media/log-holding.jpg', alt: 'Captain Adel waiting at a runway holding point at dusk', cap: 'Holding point — patience is a published procedure' },
                { src: '/media/captain-instructor.jpg', alt: 'Captain Adel briefing a route on a glass chart', cap: 'Briefing room — where GACAR stops being boring' },
              ]
          ).map((f) => (
            <figure key={f.src} className="clip-reveal relative border border-[#1a2540] group w-[300px] md:w-[340px]">
              <div className="aspect-[2/3] overflow-hidden">
                <img
                  src={f.src}
                  alt={f.alt}
                  className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
                />
              </div>
              <span className="absolute top-3 left-3 w-5 h-5 border-t border-l border-[#22d3ee]/80" />
              <span className="absolute top-3 right-3 w-5 h-5 border-t border-r border-[#22d3ee]/80" />
              <span className="absolute bottom-12 left-3 w-5 h-5 border-b border-l border-[#22d3ee]/80" />
              <span className="absolute bottom-12 right-3 w-5 h-5 border-b border-r border-[#22d3ee]/80" />
              <div className="absolute inset-0 scanlines pointer-events-none" />
              <figcaption className="absolute inset-x-0 bottom-0 px-4 py-2.5 bg-[#050810]/85 border-t border-[#1a2540] font-mono2 text-[9px] tracking-[0.22em] uppercase text-[#8b98ad]">
                {f.cap}
              </figcaption>
            </figure>
          ))}
          <div className="flex items-center pr-5">
            <span className="font-mono2 text-[9px] tracking-[0.28em] uppercase text-[#8b98ad] whitespace-nowrap [writing-mode:vertical-rl] rotate-180">
              {isAr ? 'اسحب — مزيد من المدخلات قريبًا' : 'Drag — more entries soon'}
            </span>
          </div>
        </div>
      </div>
    </section>
  )
}
