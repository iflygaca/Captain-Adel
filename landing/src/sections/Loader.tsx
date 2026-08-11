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
    <div className={`loader-veil ${done ? 'loader-done' : ''} fixed inset-0 z-[100] bg-[#050810] flex flex-col items-center justify-center`}>
      <RadarMark size={72} />
      <div className="mt-8 font-mono2 text-[11px] leading-6 tracking-[0.14em] text-[#34d399] w-[320px]">
        {LINES.slice(0, shown).map((l, i) => (
          <div key={l} className="loader-line" style={{ animationDelay: `${i * 0.02}s` }}>
            <span className="text-[#8b98ad] mr-2">{String(i).padStart(2, '0')}</span>
            {i === LINES.length - 1 ? <span className="text-[#22d3ee]">{l}</span> : l}
          </div>
        ))}
      </div>
      <div className="mt-8 w-[320px] h-px bg-[#1a2540] overflow-hidden">
        <div className="loader-bar h-full bg-[#22d3ee]" />
      </div>
    </div>
  )
}
