import { SectionTag } from './Doctrine'
import { isAr } from '../i18n'

const STAGES_EN = [
  { id: 'GUARD', desc: 'Input validation + injection hardening', out: 'clean query' },
  { id: 'ROUTE', desc: 'Language detection picks the provider', out: 'gemini · allam · auto' },
  { id: 'RETRIEVE', desc: 'BM25 over the GACAR corpus (+ optional dense hybrid)', out: 'top passages' },
  { id: 'READ', desc: 'Model answers only from the cited passages', out: 'draft answer' },
  { id: 'GROUND', desc: 'Citations extracted, claims checked, refusals classified', out: 'cited answer' },
]

const STAGES_AR = [
  { id: 'الحراسة', desc: 'تحقق من المدخلات + تحصين ضد الحقن', out: 'استعلام نظيف' },
  { id: 'التوجيه', desc: 'كشف اللغة يختار المزوّد', out: 'gemini · allam · auto' },
  { id: 'الاسترجاع', desc: 'BM25 فوق نصوص GACAR (+ هجين اختياري)', out: 'أهم المقاطع' },
  { id: 'القراءة', desc: 'النموذج يجيب من المقاطع المستشهَد بها فقط', out: 'مسودة إجابة' },
  { id: 'التأسيس', desc: 'استخراج الاستشهادات وفحص الادعاءات وتصنيف الاعتذارات', out: 'إجابة موثّقة' },
]

const STAGES = isAr ? STAGES_AR : STAGES_EN

function Pipeline() {
  return (
    <div className="reveal reveal-d2 border border-[#1a2540] bg-[#0c1220] p-6 md:p-8">
      <div className="flex items-center justify-between mb-6">
        <span className="font-mono2 text-[10px] tracking-[0.22em] uppercase text-[#8b98ad]">
          {isAr ? 'src/brain — المصدر الوحيد للحقيقة' : 'src/brain — the single source of truth'}
        </span>
        <span className="font-mono2 text-[10px] text-[#34d399] flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-[#34d399] anim-pulse-dot" /> {isAr ? 'نشط' : 'ACTIVE'}
        </span>
      </div>

      <div className="flex flex-col md:flex-row items-stretch md:items-center gap-0">
        {STAGES.map((s, i) => (
          <div key={s.id} className="flex md:flex-1 items-center">
            <div className="flex-1 group border border-[#1a2540] bg-[#111a2b] px-4 py-4 hover:border-[#2d8ea8] transition-colors duration-150">
              <div className="font-mono2 text-[10px] tracking-[0.2em] text-[#22d3ee]">
                <span className="text-[#8b98ad] mr-2">{String(i + 1).padStart(2, '0')}</span>
                {s.id}
              </div>
              <p className="mt-2 text-[12px] leading-snug text-[#8b98ad]">{s.desc}</p>
              <div className="mt-3 font-mono2 text-[10px] text-[#34d399]">→ {s.out}</div>
            </div>
            {i < STAGES.length - 1 && (
              <svg className="hidden md:block w-8 shrink-0" viewBox="0 0 32 12" aria-hidden>
                <line x1="0" y1="6" x2="26" y2="6" stroke="#2d8ea8" strokeWidth="1" className="anim-dash" />
                <path d="M24 2 L30 6 L24 10" fill="none" stroke="#22d3ee" strokeWidth="1.4" />
              </svg>
            )}
            {i < STAGES.length - 1 && (
              <svg className="md:hidden mx-auto h-7" viewBox="0 0 12 28" aria-hidden>
                <line x1="6" y1="0" x2="6" y2="22" stroke="#2d8ea8" strokeWidth="1" className="anim-dash" />
                <path d="M2 20 L6 26 L10 20" fill="none" stroke="#22d3ee" strokeWidth="1.4" />
              </svg>
            )}
          </div>
        ))}
      </div>

      <div className="mt-6 pt-5 border-t border-[#1a2540] grid sm:grid-cols-3 gap-4 font-mono2 text-[10px] tracking-[0.12em] text-[#8b98ad]">
        <div><span className="text-[#22d3ee] latin">tenants.js</span> — {isAr ? 'تأطير captadel / flygaca' : 'captadel / flygaca framing'}</div>
        <div><span className="text-[#22d3ee] latin">ratelimit.js</span> — {isAr ? 'حدود إساءة الاستخدام لكل IP / جلسة' : 'per-IP / session abuse limits'}</div>
        <div><span className="text-[#22d3ee] latin">evals/</span> — {isAr ? 'حَكَم التراجع والأمانة' : 'regression + faithfulness judge'}</div>
      </div>
    </div>
  )
}

export default function Brain() {
  return (
    <section id="brain" className="relative py-28 px-5 bg-[#070b14] overflow-hidden">
      <span className="ghost-word" aria-hidden>BRAIN</span>
      <div className="relative z-10 mx-auto max-w-7xl">
        <SectionTag n="02" label={isAr ? 'العقل — استرجع، ثم اقرأ' : 'The brain — retrieve, then read'} />
        <div className="max-w-3xl mb-14">
          <h2 className="reveal text-[clamp(1.9rem,4vw,3rem)] font-extrabold leading-[1.05] tracking-tight text-[#e6edf6]">
            {isAr ? 'لا يمكن الوثوق بالنماذج الصغيرة لاستدعاء الأدوات. لذا يقود الكودُ الطائرة.' : "Small models can't be trusted to call tools. So the code does the flying."}
          </h2>
          <p className="reveal reveal-d1 mt-6 text-[15px] leading-relaxed text-[#8b98ad]">
            {isAr ? (
              <>كل مزوّد غير Gemini يعمل بنمط <span className="text-[#e6edf6] font-medium">«استرجع ثم اقرأ»</span>:
              الاسترجاع يتم حتميًا في الكود، تُسلَّم المقاطع المؤسَّسة إلى النموذج، وطبقة التأسيس تتحقق مما يعود. خمس مراحل، بلا ارتجال.</>
            ) : (
              <>Every non-Gemini provider runs <span className="text-[#e6edf6] font-medium">retrieve-then-read</span>:
              retrieval happens deterministically in code, the grounded passages are handed to the
              model, and the grounding layer verifies what comes back. Five stages, no improvisation.</>
            )}
          </p>
        </div>
        <Pipeline />

        <div className="mt-6 grid lg:grid-cols-[1fr_1.2fr] gap-6 items-stretch">
          <figure className="reveal relative overflow-hidden border border-[#1a2540] min-h-[280px]">
            <img
              src="/media/captain-cockpit.jpg"
              alt={isAr ? 'كابتن عادل على أدوات التحكم والغروب فوق السحب' : 'Captain Adel at the controls, sunset over the clouds'}
              loading="lazy"
              className="clip-reveal absolute inset-0 w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-[#050810]/80 via-transparent to-transparent" />
            <figcaption className="absolute bottom-0 p-5 font-mono2 text-[10px] tracking-[0.14em] text-[#c6d2e2]">
              {isAr ? 'المقعد الأيسر — حيث تُثبت كل قاعدة جدارتها' : 'THE LEFT SEAT — where every rule earns its keep'}
            </figcaption>
          </figure>
          <div className="reveal reveal-d1 border border-[#1a2540] bg-[#0c1220] p-8 flex flex-col justify-center">
            <span className="font-mono2 text-[26px] text-[#22d3ee] leading-none">"</span>
            <blockquote className="mt-3 text-[clamp(1.05rem,2vw,1.4rem)] font-semibold leading-snug text-[#e6edf6]">
              {isAr
                ? 'الإجابة الخاطئة الواثقة هي أخطر أنماط الفشل في الطيران. عادل مُهندَس بحيث يغلب الصمتُ التخمينَ — طبقة «استشهد أو اعتذر» ليست ميزة، بل هي المنتج كله.'
                : "A confident wrong answer is the most dangerous failure mode in aviation. Adel is engineered so that silence beats a guess — the cite-or-refuse layer is not a feature, it's the whole product."}
            </blockquote>
            <div className="mt-6 flex items-center gap-3">
              <img src="/media/captain-chip.jpg" alt="Captain Adel portrait" className="w-11 h-11 rounded-full object-cover border border-[#2d8ea8]" />
              <div>
                <div className="font-mono2 text-[11px] tracking-[0.16em] text-[#e6edf6]">{isAr ? 'كابتن عادل' : 'CAPTAIN ADEL'}</div>
                <div className="font-mono2 text-[9px] tracking-[0.22em] uppercase text-[#8b98ad] mt-0.5">{isAr ? 'عقيدة التصميم · src/brain' : 'design doctrine · src/brain'}</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
