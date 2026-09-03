import { useEffect, useRef, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { NAV, indexLabel } from '../nav'
import { isAr, ALT_URL } from '../i18n'
import { setLenisPaused } from '../hooks/useReveal'

/* Full-screen mobile menu. Phones get no nav at all from the desktop header
   (`hidden md:flex`), so this is the only way in to a section on a phone.
   Closed state is `visibility:hidden`, which also drops every control out of
   the tab order — no `inert` needed.

   Portalled to <body> on purpose: the header carries `backdrop-blur`, and a
   backdrop-filter creates a containing block for fixed-position descendants —
   left inside the header this overlay would be clipped to its 64px box. */
export default function MobileNav({ open, onClose }: { open: boolean; onClose: () => void }) {
  const panelRef = useRef<HTMLDivElement>(null)
  const restoreTo = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (!open) return
    restoreTo.current = document.activeElement as HTMLElement | null
    setLenisPaused(true)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { onClose(); return }
      if (e.key !== 'Tab' || !panelRef.current) return
      const f = panelRef.current.querySelectorAll<HTMLElement>('a[href], button:not([disabled])')
      if (!f.length) return
      const first = f[0]
      const last = f[f.length - 1]
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
    }
    document.addEventListener('keydown', onKey)
    const focusTimer = window.setTimeout(
      () => panelRef.current?.querySelector<HTMLElement>('a[href], button')?.focus(),
      80
    )

    return () => {
      document.removeEventListener('keydown', onKey)
      window.clearTimeout(focusTimer)
      document.body.style.overflow = prevOverflow
      setLenisPaused(false)
      restoreTo.current?.focus?.()
    }
  }, [open, onClose])

  return createPortal(
    <div id="mobile-nav" className={`mnav md:hidden ${open ? 'mnav-open' : ''}`} aria-hidden={!open}>
      <button
        type="button"
        className="mnav-scrim"
        aria-label={isAr ? 'إغلاق القائمة' : 'Close menu'}
        onClick={onClose}
      />
      <div
        ref={panelRef}
        className="mnav-panel"
        role="dialog"
        aria-modal="true"
        aria-label={isAr ? 'قائمة التنقّل' : 'Navigation menu'}
      >
        <nav className="mnav-links">
          {NAV.map((n, i) => (
            <a
              key={n.href}
              href={n.href}
              onClick={onClose}
              className="mnav-link"
              style={{ '--i': i } as CSSProperties}
            >
              <span className="mnav-num font-mono2">{indexLabel(i + 1)}</span>
              <span className="mnav-label">{n.label}</span>
              <span className="mnav-rule" aria-hidden />
            </a>
          ))}
        </nav>

        <div className="mnav-foot" style={{ '--i': NAV.length } as CSSProperties}>
          <a
            href={ALT_URL}
            hrefLang={isAr ? 'en' : 'ar'}
            className="mnav-lang font-mono2"
            aria-label={isAr ? 'Switch to English' : 'التبديل إلى العربية'}
          >
            {isAr ? 'EN' : 'عربي'}
          </a>
          <a href="/chat" onClick={onClose} className="mnav-cta font-mono2">
            {isAr ? 'اسأل عادل' : 'Ask Adel'}
          </a>
        </div>

        <div className="mnav-meta font-mono2" style={{ '--i': NAV.length + 1 } as CSSProperties}>
          <span className="flex items-center gap-1.5" style={{ color: 'var(--color-success)' }}>
            <span className="w-1.5 h-1.5 rounded-full anim-pulse-dot" style={{ backgroundColor: 'var(--color-success)' }} />
            {isAr ? 'الأنظمة تعمل' : 'SYSTEMS NOMINAL'}
          </span>
          <span style={{ color: 'var(--color-text-secondary)' }}>captadel.com</span>
        </div>
      </div>
    </div>,
    document.body
  )
}
