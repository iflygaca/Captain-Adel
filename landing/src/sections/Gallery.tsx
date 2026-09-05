import { isAr } from '../i18n'

const SHOTS_EN = [
  {
    src: '/media/desert-cessna.jpg',
    cap: 'V5-CET — Cessna 210 Centurion II over the dunes',
    tag: 'CRUISE · FL095',
    cls: 'md:col-span-7 md:row-span-2 aspect-[3/4] md:aspect-auto',
  },
  {
    src: '/media/diamond-sky.jpg',
    cap: 'N999YG — climbing out, clean blue',
    tag: 'DEPARTURE',
    cls: 'md:col-span-5 aspect-[4/3]',
  },
  {
    src: '/media/cloud-deck.jpg',
    cap: 'Above the deck — VFR on top',
    tag: 'ENROUTE',
    cls: 'md:col-span-5 aspect-[4/3]',
  },
]

const SHOTS_AR = [
  {
    src: '/media/desert-cessna.jpg',
    cap: 'V5-CET — سيسنا 210 سنتوريون فوق الكثبان',
    tag: 'طيران مستوٍ · FL095',
    cls: 'md:col-span-7 md:row-span-2 aspect-[3/4] md:aspect-auto',
  },
  {
    src: '/media/diamond-sky.jpg',
    cap: 'N999YG — صعود في زرقة صافية',
    tag: 'إقلاع',
    cls: 'md:col-span-5 aspect-[4/3]',
  },
  {
    src: '/media/cloud-deck.jpg',
    cap: 'فوق سطح السحب — VFR on top',
    tag: 'في الطريق',
    cls: 'md:col-span-5 aspect-[4/3]',
  },
]

const SHOTS = isAr ? SHOTS_AR : SHOTS_EN

export default function Gallery() {
  return (
    <section className="relative py-16 md:py-28 px-5 overflow-hidden" style={{ backgroundColor: 'var(--color-void)' }}>
      <span className="ghost-word" aria-hidden>AIRSPACE</span>
      <div className="relative z-10 mx-auto max-w-7xl">
        <div className="reveal flex items-center gap-3 font-mono2 text-[10px] tracking-[0.3em] uppercase mb-6" style={{ color: 'var(--color-neon-cyan)' }}>
          <span className="px-2 py-1" style={{ border: '1px solid var(--color-brand-teal-dark)' }}>02.5</span>
          <span>{isAr ? 'من خط الطيران' : 'From the flight line'}</span>
          <span className="flex-1 h-px" style={{ backgroundColor: 'var(--color-void-900)' }} />
        </div>
        <div className="flex flex-wrap items-end justify-between gap-6 mb-12">
          <h2 className="reveal max-w-xl text-[clamp(1.9rem,4vw,3rem)] font-extrabold leading-[1.05] tracking-tight" style={{ color: 'var(--color-text-primary)' }}>
            {isAr ? 'بناه طيارون، من أجل الجيل القادم من طياري المملكة.' : "Built by pilots, for the Kingdom's next generation of them."}
          </h2>
          <p className="reveal reveal-d1 max-w-sm text-[13px] leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
            {isAr
              ? 'كل سيناريو يجيب عنه عادل نابع من ساعات قمرة حقيقية فوق الأجواء السعودية والإقليمية — مهابط صحراوية، رطوبة ساحلية، ودوائر ليلية.'
              : "Every scenario Adel answers comes from real cockpit time over Saudi and regional airspace — desert strips, coastal haze, night circuits."}
          </p>
        </div>

        <div className="grid md:grid-cols-12 gap-4">
          {SHOTS.map((s, i) => (
            <figure
              key={s.src}
              className={`reveal reveal-d${i + 1} group relative overflow-hidden ${s.cls}`}
              style={{ border: '1px solid var(--color-void-900)' }}
            >
              <img
                src={s.src}
                alt={s.cap}
                loading="lazy"
                className="clip-reveal absolute inset-0 w-full h-full object-cover transition-[filter] duration-500 group-hover:brightness-110"
              />
              <div className="absolute inset-0" style={{ backgroundImage: 'linear-gradient(to top, rgba(5, 8, 16, 0.85), transparent, transparent)' }} />
              <figcaption className="absolute bottom-0 inset-x-0 p-5 flex items-end justify-between gap-3">
                <span className="font-mono2 text-[10px] tracking-[0.14em]" style={{ color: 'var(--color-text-secondary)' }}>{s.cap}</span>
                <span className="font-mono2 text-[9px] tracking-[0.22em] px-2 py-1 backdrop-blur-sm shrink-0" style={{ color: 'var(--color-neon-cyan)', border: '1px solid rgba(45, 142, 168, 0.6)', backgroundColor: 'rgba(5, 8, 16, 0.6)' }}>
                  {s.tag}
                </span>
              </figcaption>
            </figure>
          ))}
        </div>
      </div>
    </section>
  )
}
