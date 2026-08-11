import { isAr } from '../i18n'

export default function Cinematic() {
  return (
    <section className="relative h-[92vh] overflow-hidden flex items-end">
      <video
        className="absolute inset-0 w-full h-full object-cover"
        src="/media/final-approach.mp4"
        poster="/media/final-approach-poster.jpg"
        autoPlay
        muted
        loop
        playsInline
      />
      <div className="absolute inset-0 bg-gradient-to-t from-[#050810] via-[#050810]/25 to-[#050810]/55" />
      {/* HUD frame */}
      <div className="absolute inset-6 md:inset-10 border border-[#22d3ee]/25 pointer-events-none">
        <span className="absolute -top-px -left-px w-6 h-6 border-t-2 border-l-2 border-[#22d3ee]" />
        <span className="absolute -top-px -right-px w-6 h-6 border-t-2 border-r-2 border-[#22d3ee]" />
        <span className="absolute -bottom-px -left-px w-6 h-6 border-b-2 border-l-2 border-[#22d3ee]" />
        <span className="absolute -bottom-px -right-px w-6 h-6 border-b-2 border-r-2 border-[#22d3ee]" />
        <div className="absolute top-3 left-4 font-mono2 text-[9px] tracking-[0.3em] text-[#22d3ee]/90 flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-[#f87171] anim-pulse-dot" /> REC — COCKPIT CAM
        </div>
        <div className="absolute top-3 right-4 font-mono2 text-[9px] tracking-[0.3em] text-[#22d3ee]/90">FL450 · IAS 138 KT</div>
      </div>

      <div className="relative z-10 mx-auto w-full max-w-7xl px-10 md:px-16 pb-14">
        <div className="reveal flex items-center gap-3 font-mono2 text-[10px] tracking-[0.3em] uppercase text-[#22d3ee] mb-4">
          <span className="w-8 h-px bg-[#2d8ea8]" />
          {isAr ? 'نهائي قصير — المشهد من المقعد الأيسر' : 'Short final — the view from the left seat'}
        </div>
        <h2 className="reveal reveal-d1 max-w-3xl text-[clamp(1.8rem,4.5vw,3.4rem)] font-extrabold leading-[1.02] tracking-tight text-white">
          {isAr ? (
            <>الأنظمة تُقرأ بشكل مختلف على ارتفاع <span className="text-[#22d3ee] text-glow">٥٠٠ قدم في النهائي.</span></>
          ) : (
            <>Regulations read different at{' '}
            <span className="text-[#22d3ee] text-glow">500 feet on final.</span></>
          )}
        </h2>
        <p className="reveal reveal-d2 mt-4 max-w-xl text-[14px] leading-relaxed text-[#c6d2e2]">
          {isAr
            ? 'عادل بناه أناس يطيرون. وحين تكون الإجابة مهمة — حدود الطقس، احتياطي الوقود، الخبرة الحديثة — تحصل على المادة، لا على هزّة كتف.'
            : 'Adel was built by people who fly. When the answer matters — weather minima, fuel reserves, recency — you get the section, not a shrug.'}
        </p>
      </div>
    </section>
  )
}
