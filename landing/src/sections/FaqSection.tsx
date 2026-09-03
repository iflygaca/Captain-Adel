import { useState } from 'react'
import type { CSSProperties } from 'react'
import { isAr } from '../i18n'

type Faq = { q: string; a: string }

const FAQS_EN: Faq[] = [
  {
    q: 'Who is Captain Adel (كابتن عادل)?',
    a: 'An independent AI flight instructor for Saudi civil aviation. Ask him anything about the GACAR regulations and he answers with the exact Part and section cited — and when the corpus can\u2019t support an answer, he refuses rather than guesses. Unofficial, educational, and not affiliated with GACA.',
  },
  {
    q: 'Does Captain Adel answer in Arabic?',
    a: 'Yes — fully bilingual. Ask in العربية or English and he replies in the same language, with the same grounded citation. Arabic-dominant questions are routed to in-Kingdom Arabic models under the same cite-or-refuse discipline.',
  },
  {
    q: 'Is Captain Adel an official GACA service?',
    a: 'No. Captain Adel is an independent, unofficial, educational project. The authoritative source for any regulation is always the General Authority of Civil Aviation at gaca.gov.sa.',
  },
  {
    q: 'What happens when Captain Adel doesn\u2019t know an answer?',
    a: 'He says so. Retrieval runs in code over the GACAR corpus; if the passages can\u2019t support the question he refuses and points you to gaca.gov.sa instead of inventing an answer — cite or refuse, every time.',
  },
  {
    q: 'Which GACAR parts can I ask about?',
    a: 'The corpus covers the parts pilots actually live in — Part 61 (certification), Part 91 (general operating & flight rules), Part 121 (air carrier), Part 135 (commuter & on-demand), Part 141 (pilot schools), and more.',
  },
]

const FAQS_AR: Faq[] = [
  {
    q: 'من هو كابتن عادل؟',
    a: 'مدرّب طيران ذكي مستقل للطيران المدني السعودي. اسأله أي شيء عن أنظمة GACAR فيجيب مع ذكر الجزء والمادة بدقة — وعندما لا تجد الإجابة سندًا في النصوص، يعتذر بدل أن يخمّن. مشروع تعليمي غير رسمي ولا يتبع هيئة الطيران المدني.',
  },
  {
    q: 'هل يجيب كابتن عادل باللغة العربية؟',
    a: 'نعم، ثنائي اللغة بالكامل. اسأله بالعربية أو الإنجليزية فيرد بنفس اللغة مع الاستشهاد نفسه. الأسئلة العربية تُوجَّه إلى نماذج عربية داخل المملكة تحت قاعدة «استشهد أو اعتذر» ذاتها.',
  },
  {
    q: 'هل كابتن عادل خدمة رسمية من هيئة الطيران المدني؟',
    a: 'لا. كابتن عادل مشروع مستقل وتعليمي وغير رسمي. المصدر الرسمي الوحيد لأي نظام هو الهيئة العامة للطيران المدني عبر gaca.gov.sa.',
  },
  {
    q: 'ماذا يفعل كابتن عادل عندما لا يعرف الإجابة؟',
    a: 'يقول ذلك صراحة. الاسترجاع يتم برمجيًا من نصوص GACAR؛ فإن لم تكفِ المقاطع للإجابة اعتذر وأحالك إلى gaca.gov.sa بدل اختلاق إجابة — استشهاد أو اعتذار، في كل مرة.',
  },
  {
    q: 'عن أي أجزاء من GACAR يمكنني أن أسأل؟',
    a: 'تغطي النصوص الأجزاء التي يعيشها الطيارون فعلًا — الجزء 61 (الشهادات)، والجزء 91 (قواعد التشغيل والطيران العامة)، والجزء 121 (النقل الجوي)، والجزء 135 (الرحلات عند الطلب)، والجزء 141 (مدارس الطيران)، وغيرها.',
  },
]

const FAQS = isAr ? FAQS_AR : FAQS_EN

export default function FaqSection() {
  const [open, setOpen] = useState(0)
  const [hoverQuestionIdx, setHoverQuestionIdx] = useState(-1)

  return (
    <section id="faq" className="relative py-16 md:py-28 px-5 overflow-hidden">
      <span className="ghost-word" aria-hidden>{isAr ? 'أسئلة' : 'ASK'}</span>
      <div className="relative z-10 mx-auto max-w-4xl">
        <div
          className="reveal flex items-center gap-3 font-mono2 text-[10px] tracking-[0.3em] uppercase mb-6"
          style={{ color: 'var(--color-brand-teal)' }}
        >
          <span className="px-2 py-1" style={{ border: '1px solid var(--color-brand-teal-dark)' }}>
            {isAr ? '٠٥' : '05'}
          </span>
          <span>{isAr ? 'الأسئلة المتكررة — اسأل الكابتن' : 'Frequently asked — interrogating the Captain'}</span>
          <span className="flex-1 h-px" style={{ backgroundColor: 'var(--color-void-900)' }} />
        </div>
        <h2 className={`reveal text-[clamp(1.9rem,4vw,3rem)] font-extrabold leading-[1.05] tracking-tight mb-12 ${isAr ? 'ar-display' : ''}`} style={{ color: 'var(--color-text-primary)' }}>
          {isAr ? (
            <>كل ما أردت سؤال <span style={{ color: 'var(--color-brand-teal)' }}>كابتن عادل</span> عنه.</>
          ) : (
            <>Everything you wanted to ask <span style={{ color: 'var(--color-brand-teal)' }}>Captain Adel</span>.</>
          )}
        </h2>
        <div className="border-y" style={{ borderColor: 'var(--color-void-900)', divideBorderColor: 'var(--color-void-900)' }}>
          {FAQS.map((f, i) => (
            <div key={i} className={`reveal reveal-d${Math.min(i + 1, 4)} border-b`} style={{ borderBottomColor: 'var(--color-void-900)' }}>
              <button
                onClick={() => setOpen(open === i ? -1 : i)}
                onMouseEnter={() => setHoverQuestionIdx(i)}
                onMouseLeave={() => setHoverQuestionIdx(-1)}
                aria-expanded={open === i}
                className="w-full flex items-center justify-between gap-6 py-5 text-start group transition-colors duration-150"
              >
                <span
                  className="text-[15px] md:text-[17px] font-semibold transition-colors duration-150"
                  style={{
                    color: open === i || hoverQuestionIdx === i ? 'var(--color-brand-teal)' : 'var(--color-text-primary)',
                  }}
                >
                  {f.q}
                </span>
                <span
                  className="font-mono2 text-lg shrink-0 transition-transform duration-300"
                  style={{
                    transform: open === i ? 'rotate(45deg)' : 'rotate(0deg)',
                    color: open === i ? 'var(--color-brand-teal)' : 'var(--color-text-secondary)',
                  }}
                >
                  +
                </span>
              </button>
              <div
                className="grid transition-[grid-template-rows] duration-300 ease-out"
                style={{ gridTemplateRows: open === i ? '1fr' : '0fr' }}
              >
                <div className="overflow-hidden">
                  <p className="pb-6 max-w-2xl text-[14px] leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
                    {f.a}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
