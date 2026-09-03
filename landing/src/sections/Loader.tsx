import { useEffect, useState } from 'react'
import { RadarMark } from './Header'
import { isAr } from '../i18n'

const LINES = isAr
  ? [
      'كابتن عادل — سطح الطيران v2.1',
      'تحميل نصوص GACAR ............ تم',
      'فهرس BM25 ................... تم',
      'التأسيس: استشهد أو اعتذر .... مسلّح',
      'اتصال راداري',
    ]
  : [
      'CAPTAIN ADEL — FLIGHT DECK v2.1',
      'LOADING GACAR CORPUS .......... OK',
      'BM25 INDEX .................... OK',
      'GROUNDING: CITE-OR-REFUSE ..... ARMED',
      'RADAR CONTACT',
    ]

export default function Loader() {
  const [shown, setShown] = useState(0)
  const [done, setDone] = useState(false)
  const [gone, setGone] = useState(false)

  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = []
    LINES.forEach((_, i) => timers.push(setTimeout(() => setShown(i + 1), 240 * (i + 1))))
    timers.push(setTimeout(() => setDone(true), 240 * LINES.length + 650))
    timers.push(setTimeout(() => setGone(true), 240 * LINES.length + 1450))
    return () => timers.forEach(clearTimeout)
  }, [])

  if (gone) return null
  return (
    <div className={`loader-veil ${done ? 'loader-done' : ''} fixed inset-0 z-[100] flex flex-col items-center justify-center`} style={{ backgroundColor: 'var(--color-void)' }}>
      <RadarMark size={72} />
      <div className="mt-8 font-mono2 text-[11px] leading-6 tracking-[0.14em] w-[320px]" style={{ color: 'var(--color-success)' }}>
        {LINES.slice(0, shown).map((l, i) => (
          <div key={l} className="loader-line" style={{ animationDelay: `${i * 0.02}s` }}>
            <span className="mr-2" style={{ color: 'var(--color-text-secondary)' }}>{String(i).padStart(2, '0')}</span>
            {i === LINES.length - 1 ? <span style={{ color: 'var(--color-neon-cyan)' }}>{l}</span> : l}
          </div>
        ))}
      </div>
      <div className="mt-8 w-[320px] h-px overflow-hidden" style={{ backgroundColor: 'var(--color-void-900)' }}>
        <div className="loader-bar h-full" style={{ backgroundColor: 'var(--color-neon-cyan)' }} />
      </div>
    </div>
  )
}
