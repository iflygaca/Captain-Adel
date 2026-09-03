import { useEffect, useRef, useState } from 'react'
import { isAr } from '../i18n'

/* Terminal-style demo inside the hero ID card: boots the brain, then loops
   short GACAR Q&As with a typing effect. Fully hardcoded (an illustrative
   preview — no live calls), pauses on hover, and renders a static single
   frame under prefers-reduced-motion. Distinct on purpose from Doctrine's
   chat-bubble transcript: this one speaks console. */

const BOOT_EN = [
  '> loading GACAR corpus ......... OK',
  '> BM25 index ................... OK',
  '> grounding: cite-or-refuse .... ARMED',
  '> provider route: auto ......... READY',
]
const BOOT_AR = [
  '> تحميل نصوص GACAR ............ تم',
  '> فهرس BM25 .................... تم',
  '> التأسيس: استشهد أو اعتذر ..... مسلّح',
  '> مسار النموذج: تلقائي ......... جاهز',
]

type Qa = { q: string; a: string; cite: string }
const QA_EN: Qa[] = [
  { q: 'VFR visibility below 10,000 ft?', a: '5 km flight visibility, clear of clouds', cite: '§91.155' },
  { q: 'Night VFR fuel reserve?', a: 'destination, then 45 min at cruise', cite: '§91.151' },
  { q: 'Max speed below 10,000 ft?', a: '250 knots indicated', cite: '§91.117' },
]
const QA_AR: Qa[] = [
  { q: 'رؤية VFR تحت 10,000 قدم؟', a: 'رؤية 5 كم بعيدًا عن السحب', cite: '§91.155' },
  { q: 'احتياطي وقود VFR ليلًا؟', a: 'الوجهة ثم 45 دقيقة بسرعة الطيران الاعتيادية', cite: '§91.151' },
  { q: 'السرعة القصوى تحت 10,000 قدم؟', a: '250 عقدة مبيّنة', cite: '§91.117' },
]

const BOOT = isAr ? BOOT_AR : BOOT_EN
const QAS = isAr ? QA_AR : QA_EN
const ONLINE = isAr ? '> كابتن عادل على التردد' : '> captain adel is on frequency'
const PROMPT = isAr ? 'سؤال' : 'ask'
const NOTE = isAr ? 'عرض توضيحي' : 'illustrative preview'

export default function ConsoleDemo() {
  const [booted, setBooted] = useState(0)
  const [qa, setQa] = useState(0)          // which Q&A
  const [typed, setTyped] = useState(0)    // chars of the question typed
  const [answered, setAnswered] = useState(false)
  const paused = useRef(false)
  const reduced = useRef(false)

  useEffect(() => {
    reduced.current = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduced.current) {
      // static frame: full boot + first Q&A, no timers
      setBooted(BOOT.length)
      setTyped(QAS[0].q.length)
      setAnswered(true)
    }
  }, [])

  /* phase 1 — boot lines */
  useEffect(() => {
    if (reduced.current || booted >= BOOT.length) return
    const id = setTimeout(() => setBooted((b) => b + 1), 420)
    return () => clearTimeout(id)
  }, [booted])

  /* phase 2 — Q&A loop: type the question, reveal the answer, hold, next */
  useEffect(() => {
    if (reduced.current || booted < BOOT.length) return
    const question = QAS[qa].q
    let id: ReturnType<typeof setTimeout>
    const step = () => {
      if (paused.current) { id = setTimeout(step, 300); return }
      if (typed < question.length) {
        setTyped((t) => t + 1)
        id = setTimeout(step, 46)
      } else if (!answered) {
        id = setTimeout(() => { if (!paused.current) setAnswered(true); else step() }, 420)
      } else {
        id = setTimeout(() => {
          if (paused.current) { step(); return }
          setAnswered(false); setTyped(0); setQa((i) => (i + 1) % QAS.length)
        }, 2800)
      }
    }
    id = setTimeout(step, typed === 0 && !answered ? 700 : 46)
    return () => clearTimeout(id)
  }, [booted, qa, typed, answered])

  const cur = QAS[qa]
  return (
    <div
      className="p-4 font-mono2 text-[11px] leading-5 text-[var(--color-success)] min-h-[190px]"
      onPointerEnter={() => { paused.current = true }}
      onPointerLeave={() => { paused.current = false }}
    >
      {BOOT.slice(0, booted).map((l) => (
        <div key={l}>{l}</div>
      ))}
      {booted >= BOOT.length ? (
        <>
          <div className="text-[var(--color-neon-cyan)]">{ONLINE}</div>
          <div className="mt-2 text-[var(--color-text-primary)]">
            <span className="text-[var(--color-text-secondary)]">{PROMPT}&gt; </span>
            {cur.q.slice(0, typed)}
            {!answered && <span className="anim-caret text-[var(--color-neon-cyan)]">▌</span>}
          </div>
          {answered && (
            <div className="mt-1 text-[var(--color-text-secondary)]">
              <span className="text-[var(--color-text-secondary)]">→ </span>
              {cur.a}{' '}
              <span className="px-1.5 py-0.5 bg-[var(--color-neon-cyan)]/10 border border-[var(--color-brand-teal)]/50 text-[var(--color-neon-cyan)]">⧉ GACAR {cur.cite}</span>
              <span className="anim-caret text-[var(--color-neon-cyan)]">▌</span>
            </div>
          )}
          <div className="mt-2 font-mono2 text-[8px] tracking-[0.24em] uppercase text-[var(--color-text-secondary)]/70">{NOTE}</div>
        </>
      ) : (
        <span className="anim-caret text-[var(--color-neon-cyan)]">▌</span>
      )}
    </div>
  )
}
