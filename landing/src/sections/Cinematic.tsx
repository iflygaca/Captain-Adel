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
      <div className="absolute inset-0 bg-gradient-to-t from-[var(--color-void)] via-[var(--color-void)]/25 to-[var(--color-void)]/55" />
      {/* HUD frame */}
      <div className="absolute inset-6 md:inset-10 border border-[var(--color-neon-cyan)]/25 pointer-events-none">
        <span className="absolute -top-px -left-px w-6 h-6 border-t-2 border-l-2 border-[var(--color-neon-cyan)]" />
        <span className="absolute -top-px -right-px w-6 h-6 border-t-2 border-r-2 border-[var(--color-neon-cyan)]" />
        <span className="absolute -bottom-px -left-px w-6 h-6 border-b-2 border-l-2 border-[var(--color-neon-cyan)]" />
        <span className="absolute -bottom-px -right-px w-6 h-6 border-b-2 border-r-2 border-[var(--color-neon-cyan)]" />
        <div className="absolute top-3 left-4 font-mono2 text-[9px] tracking-[0.3em] text-[var(--color-neon-cyan)]/90 flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-danger)] anim-pulse-dot" /> REC — COCKPIT CAM
        </div>
        <div className="absolute top-3 right-4 font-mono2 text-[9px] tracking-[0.3em] text-[var(--color-neon-cyan)]/90">FL450 · IAS 138 KT</div>
      </div>

      <div className="relative z-10 mx-auto w-full max-w-7xl px-10 md:px-16 pb-14">
        <div className="reveal flex items-center gap-3 font-mono2 text-[10px] tracking-[0.3em] uppercase text-[var(--color-neon-cyan)] mb-4">
          <span className="w-8 h-px bg-[var(--color-brand-teal)]" />
          {isAr ? 'نهائي قصير — المشهد من المقعد الأيسر' : 'Short final — the view from the left seat'}
        </div>
        <h2 className="reveal reveal-d1 max-w-3xl text-[clamp(1.8rem,4.5vw,3.4rem)] font-extrabold leading-[1.02] tracking-tight text-white">
          {isAr ? (
            <>الأنظمة تُقرأ بشكل مختلف على ارتفاع <span className="text-[var(--color-neon-cyan)] text-glow">٥٠٠ قدم في النهائي.</span></>
          ) : (
            <>Regulations read different at{' '}
            <span className="text-[var(--color-neon-cyan)] text-glow">500 feet on final.</span></>
          )}
        </h2>
        <p className="reveal reveal-d2 mt-4 max-w-xl text-[14px] leading-relaxed text-[var(--color-text-secondary)]">
          {isAr
            ? 'عادل بناه أناس يطيرون. وحين تكون الإجابة مهمة — حدود الطقس، احتياطي الوقود، الخبرة الحديثة — تحصل على المادة، لا على هزّة كتف.'
            : 'Adel was built by people who fly. When the answer matters — weather minima, fuel reserves, recency — you get the section, not a shrug.'}
        </p>
      </div>
    </section>
  )
}
