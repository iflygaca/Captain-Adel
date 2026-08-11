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
    <section className="relative py-28 px-5 bg-[#070b14] overflow-hidden">
      <span className="ghost-word" aria-hidden>AIRSPACE</span>
      <div className="relative z-10 mx-auto max-w-7xl">
        <div className="reveal flex items-center gap-3 font-mono2 text-[10px] tracking-[0.3em] uppercase text-[#22d3ee] mb-6">
          <span className="px-2 py-1 border border-[#2d8ea8]">02.5</span>
          <span>{isAr ? 'من خط الطيران' : 'From the flight line'}</span>
          <span className="flex-1 h-px bg-[#1a2540]" />
        </div>
        <div className="flex flex-wrap items-end justify-between gap-6 mb-12">
          <h2 className="reveal max-w-xl text-[clamp(1.9rem,4vw,3rem)] font-extrabold leading-[1.05] tracking-tight text-[#e6edf6]">
            {isAr ? 'بناه طيارون، من أجل الجيل القادم من طياري المملكة.' : "Built by pilots, for the Kingdom's next generation of them."}
          </h2>
          <p className="reveal reveal-d1 max-w-sm text-[13px] leading-relaxed text-[#8b98ad]">
            {isAr
              ? 'كل سيناريو يجيب عنه عادل نابع من ساعات قمرة حقيقية فوق الأجواء السعودية والإقليمية — مهابط صحراوية، رطوبة ساحلية، ودوائر ليلية.'
              : "Every scenario Adel answers comes from real cockpit time over Saudi and regional airspace — desert strips, coastal haze, night circuits."}
          </p>
        </div>

        <div className="grid md:grid-cols-12 gap-4">
          {SHOTS.map((s, i) => (
            <figure
              key={s.src}
              className={`reveal reveal-d${i + 1} group relative overflow-hidden border border-[#1a2540] ${s.cls}`}
            >
              <img
                src={s.src}
                alt={s.cap}
                loading="lazy"
                className="clip-reveal absolute inset-0 w-full h-full object-cover transition-[filter] duration-500 group-hover:brightness-110"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-[#050810]/85 via-transparent to-transparent" />
              <figcaption className="absolute bottom-0 inset-x-0 p-5 flex items-end justify-between gap-3">
                <span className="font-mono2 text-[10px] tracking-[0.14em] text-[#c6d2e2]">{s.cap}</span>
                <span className="font-mono2 text-[9px] tracking-[0.22em] text-[#22d3ee] border border-[#2d8ea8]/60 px-2 py-1 bg-[#050810]/60 backdrop-blur-sm shrink-0">
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
