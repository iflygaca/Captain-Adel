import { useState } from 'react'
import { isAr } from '../i18n'

type Qa = { q: string; a: string; cites: string[] }

const QA_EN: Qa[] = [
  {
    q: 'What is the minimum VFR visibility in Saudi airspace?',
    a: 'Under GACAR §91.155 the basic VFR weather minima are 5 km flight visibility clear of clouds — rising to 8 km at or above 3,050 m (10,000 ft) AMSL — with cloud clearance of 300 m vertically and 1,500 m horizontally. Below these values VFR flight is not permitted.',
    cites: ['GACAR §91.155'],
  },
  {
    q: 'How much fuel reserve does VFR flight require in Saudi Arabia?',
    a: 'GACAR §91.151 requires enough fuel (considering wind and forecast weather) to fly to the first point of intended landing and then: 30 minutes in daylight, or 45 minutes at night, at normal cruising speed. No person may begin a VFR flight below that reserve.',
    cites: ['GACAR §91.151'],
  },
  {
    q: 'What is the minimum safe altitude over cities in the Kingdom?',
    a: 'GACAR §91.119: over congested areas, 1,000 ft above the highest obstacle within a 600 m horizontal radius of the aircraft; elsewhere, 500 ft from persons, vessels, vehicles, or structures — except when necessary for takeoff or landing.',
    cites: ['GACAR §91.119'],
  },
  {
    q: 'What is the maximum speed below 10,000 feet?',
    a: 'GACAR §91.117 limits indicated airspeed to 250 knots below 3,050 m (10,000 ft) AMSL, unless the aircraft\u2019s minimum safe speed is higher or GACA authorizes otherwise. Further limits apply in airspace underlying airport traffic areas.',
    cites: ['GACAR §91.117'],
  },
  {
    q: 'How recent must my flight experience be to carry passengers?',
    a: 'GACAR §61.57: no pilot in command may carry passengers unless, within the preceding 90 days, they made at least 3 takeoffs and 3 landings in an aircraft of the same category and class. For night passenger carriage, those landings must be at night and to a full stop.',
    cites: ['GACAR §61.57'],
  },
  {
    q: 'What must I check before every flight under GACAR?',
    a: 'GACAR §91.103 requires preflight action: all available weather reports and forecasts, fuel requirements, available alternatives if the flight cannot be completed, known traffic delays, runway lengths at intended airports, and aircraft performance data.',
    cites: ['GACAR §91.103', 'GACAR §91.7'],
  },
  {
    q: 'Can I fly with inoperative equipment on board?',
    a: 'GACAR §91.213 governs inoperative instruments and equipment. If an approved Minimum Equipment List (MEL) exists, it controls. Without an MEL, the equipment must not be required by the type certificate, operating rules, or airworthiness directives — and must be deactivated and placarded inoperative.',
    cites: ['GACAR §91.213'],
  },
  {
    q: 'Who is responsible that the aircraft is airworthy?',
    a: 'GACAR §91.7 makes the pilot in command directly responsible for determining whether the aircraft is in a condition for safe flight, and prohibits operating an unairworthy aircraft. The owner or operator remains responsible under §91.405 for maintenance and required inspections.',
    cites: ['GACAR §91.7', 'GACAR §91.405'],
  },
]

const QA_AR: Qa[] = [
  {
    q: 'ما الحد الأدنى للرؤية لطيران VFR في الأجواء السعودية؟',
    a: 'وفق المادة §91.155 من أنظمة GACAR، الحد الأدنى للطيران البصري هو رؤية 5 كيلومترات بعيدًا عن السحب — وترتفع إلى 8 كيلومترات على ارتفاع 3050 مترًا فأعلى — مع خلوص من السحب 300 متر عموديًا و1500 متر أفقيًا. دون هذه القيم لا يجوز الطيران البصري.',
    cites: ['GACAR §91.155'],
  },
  {
    q: 'كم احتياطي الوقود المطلوب لرحلات VFR في السعودية؟',
    a: 'تشترط المادة §91.151 وقودًا كافيًا (مع مراعاة الرياح والتوقعات) للوصول إلى أول نقطة هبوط مقصودة ثم الطيران 30 دقيقة إضافية نهارًا أو 45 دقيقة ليلًا بسرعة الاقتراب الاعتيادية. ولا يجوز البدء برحلة VFR بأقل من هذا الاحتياطي.',
    cites: ['GACAR §91.151'],
  },
  {
    q: 'ما الحد الأدنى الآمن للارتفاع فوق المدن في المملكة؟',
    a: 'المادة §91.119: فوق المناطق المزدحمة ألف قدم فوق أعلى عائق ضمن نصف قطر أفقي 600 متر من الطائرة، وفي غيرها 500 قدم عن الأشخاص والمركبات والمنشآت — إلا عند الاقتضاء للإقلاع أو الهبوط.',
    cites: ['GACAR §91.119'],
  },
  {
    q: 'ما السرعة القصوى المسموح بها تحت 10000 قدم؟',
    a: 'تحدّد المادة §91.117 السرعة الجوية المبيّنة بـ 250 عقدة كحد أقصى تحت 3050 مترًا فوق مستوى سطح البحر، ما لم تكن السرعة الدنيا الآمنة للطائرة أعلى أو سمحت الهيئة بغير ذلك. وتُطبَّق حدود إضافية في الأجواء المجاورة للمطارات.',
    cites: ['GACAR §91.117'],
  },
  {
    q: 'ما حداثة الخبرة المطلوبة لحمل الركاب؟',
    a: 'المادة §61.57: لا يجوز للطيار المسؤول حمل ركاب إلا إذا نفّذ 3 إقلاعات و3 هبوطات على الأقل خلال التسعين يومًا السابقة في طائرة من الفئة والصنف نفسيهما. ولحمل الركاب ليلًا يجب أن تكون الهبوطات ليلية وكاملة التوقف.',
    cites: ['GACAR §61.57'],
  },
  {
    q: 'ما الذي يجب التحقق منه قبل كل رحلة وفق GACAR؟',
    a: 'توجب المادة §91.103 إجراءات ما قبل الطيران: جميع تقارير الطقس وتوقعاته المتاحة، ومتطلبات الوقود، والبدائل المتاحة إذا تعذر إتمام الرحلة، والتأخيرات المعروفة، وأطوال الممرات، وبيانات أداء الطائرة.',
    cites: ['GACAR §91.103', 'GACAR §91.7'],
  },
  {
    q: 'هل يمكن الطيران بمعدات معطلة على متن الطائرة؟',
    a: 'تحكم المادة §91.213 الأجهزة والمعدات المعطلة. فإن وُجدت قائمة الحد الأدنى للمعدات (MEL) معتمدة فهي المرجع؛ ومن دونها يجب ألا تكون المعدات مطلوبة بشهادة النوع أو قواعد التشغيل أو توجيهات الصلاحية، وأن تُعطَّل وتُوسَم بوصفها معطلة.',
    cites: ['GACAR §91.213'],
  },
  {
    q: 'من المسؤول عن صلاحية الطائرة للطيران؟',
    a: 'تجعل المادة §91.7 الطيار المسؤول مسؤولًا مباشرة عن التحقق من أن الطائرة في حالة تسمح بطيران آمن، وتحظر تشغيل طائرة غير صالحة. ويبقى المالك أو المشغّل مسؤولًا بموجب المادة §91.405 عن الصيانة والتفتيشات المطلوبة.',
    cites: ['GACAR §91.7', 'GACAR §91.405'],
  },
]

const QAS = isAr ? QA_AR : QA_EN

export default function GacarQa() {
  const [open, setOpen] = useState(0)
  return (
    <section id="qa" className="relative py-16 md:py-28 px-5 overflow-hidden border-t border-[var(--color-void-900)]">
      <span className="ghost-word" aria-hidden>GACAR</span>
      <div className="relative z-10 mx-auto max-w-4xl">
        <div className="reveal flex items-center gap-3 font-mono2 text-[10px] tracking-[0.3em] uppercase text-[var(--color-neon-cyan)] mb-6">
          <span className="px-2 py-1 border border-[var(--color-brand-teal)]">{isAr ? '٠٦' : '06'}</span>
          <span>{isAr ? 'من نصوص الأنظمة — مصدر واحد: GACA' : 'Straight from the regulations — one source: GACA'}</span>
          <span className="flex-1 h-px bg-[var(--color-void-900)]" />
        </div>
        <h2 className={`reveal text-[clamp(1.9rem,4vw,3rem)] font-extrabold leading-[1.05] tracking-tight text-[var(--color-text-primary)] mb-4 ${isAr ? 'ar-display' : ''}`}>
          {isAr ? (
            <>أسئلة الطيارين، بإجابات <span className="text-[var(--color-neon-cyan)]">من النظام نفسه</span>.</>
          ) : (
            <>Pilots&rsquo; questions, answered <span className="text-[var(--color-neon-cyan)]">from the regulation itself</span>.</>
          )}
        </h2>
        <p className="reveal text-[14px] leading-relaxed text-[var(--color-text-secondary)] max-w-2xl mb-12">
          {isAr
            ? 'كل إجابة أدناه مستمدة حصرًا من نصوص اللوائح التنفيذية للطيران المدني (GACAR) الصادرة عن الهيئة العامة للطيران المدني — مع ذكر المادة بدقة. المصدر الرسمي الوحيد: gaca.gov.sa.'
            : 'Every answer below is drawn exclusively from the General Authority of Civil Aviation Regulations (GACAR), with the exact section cited. The only authoritative source: gaca.gov.sa.'}
        </p>
        <div className="divide-y divide-[var(--color-void-900)] border-y border-[var(--color-void-900)]">
          {QAS.map((f, i) => (
            <div key={i} className={`reveal reveal-d${Math.min((i % 4) + 1, 4)}`}>
              <button
                onClick={() => setOpen(open === i ? -1 : i)}
                aria-expanded={open === i}
                className="w-full flex items-center justify-between gap-6 py-5 text-start group"
              >
                <span className="flex items-baseline gap-4">
                  <span className="font-mono2 text-[10px] tracking-[0.2em] text-[var(--color-brand-teal)] shrink-0">
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <span className={`text-[15px] md:text-[17px] font-semibold transition-colors duration-150 ${open === i ? 'text-[var(--color-neon-cyan)]' : 'text-[var(--color-text-primary)] group-hover:text-[var(--color-neon-cyan)]'}`}>
                    {f.q}
                  </span>
                </span>
                <span className={`font-mono2 text-lg shrink-0 transition-transform duration-300 ${open === i ? 'rotate-45 text-[var(--color-neon-cyan)]' : 'text-[var(--color-text-secondary)]'}`}>
                  +
                </span>
              </button>
              <div
                className="grid transition-[grid-template-rows] duration-300 ease-out"
                style={{ gridTemplateRows: open === i ? '1fr' : '0fr' }}
              >
                <div className="overflow-hidden">
                  <div className="pb-6 max-w-2xl ms-8">
                    <p className="text-[14px] leading-relaxed text-[var(--color-text-secondary)] mb-3">{f.a}</p>
                    <div className="flex flex-wrap gap-2">
                      {f.cites.map((c) => (
                        <span
                          key={c}
                          className="latin font-mono2 text-[10px] tracking-[0.14em] px-2 py-1 border border-[var(--color-brand-teal)]/60 text-[var(--color-neon-cyan)] bg-[var(--color-neon-cyan)]/5"
                        >
                          {c}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
        <p className="reveal mt-8 font-mono2 text-[10px] tracking-[0.2em] uppercase text-[var(--color-text-secondary)]">
          {isAr ? 'تعليمي · غير رسمي · النص النافذ لدى ' : 'Educational · unofficial · the binding text lives at '}
          <a
            href="https://gaca.gov.sa"
            target="_blank"
            rel="noopener"
            className="latin text-[var(--color-neon-cyan)] hover:underline"
          >
            gaca.gov.sa
          </a>
        </p>
      </div>
    </section>
  )
}
