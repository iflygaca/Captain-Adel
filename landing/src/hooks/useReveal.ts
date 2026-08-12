import { useEffect, useRef } from 'react'

const reduced = () =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

/** Adds `.revealed` to any `.reveal` element as it enters the viewport.
 *  A MutationObserver picks up nodes mounted after this runs (the mobile menu,
 *  anything rendered on state change) so late content still animates in. */
export function useRevealAll() {
  useEffect(() => {
    const io = new IntersectionObserver(
      (entries) =>
        entries.forEach((e) => {
          if (!e.isIntersecting) return
          e.target.classList.add('revealed')
          io.unobserve(e.target)
        }),
      // a touch of rootMargin so phone content is already in when it scrolls up
      { threshold: 0.12, rootMargin: '0px 0px -6% 0px' }
    )
    const observe = (root: ParentNode) =>
      root.querySelectorAll<HTMLElement>('.reveal:not(.revealed)').forEach((el) => io.observe(el))

    observe(document)
    const mo = new MutationObserver((muts) => {
      for (const m of muts)
        for (const n of m.addedNodes)
          if (n instanceof HTMLElement) {
            if (n.classList.contains('reveal')) io.observe(n)
            observe(n)
          }
    })
    mo.observe(document.body, { childList: true, subtree: true })

    return () => { io.disconnect(); mo.disconnect() }
  }, [])
}

/** Scroll-linked progress for `[data-scrollfx]` blocks: writes `--p` (0→1) as
 *  the element travels the viewport, so CSS can drive the motion. rAF-throttled
 *  and skipped entirely for reduced-motion users. */
export function useScrollFx() {
  useEffect(() => {
    if (reduced()) return
    const els = Array.from(document.querySelectorAll<HTMLElement>('[data-scrollfx]'))
    if (!els.length) return
    let raf = 0
    const update = () => {
      raf = 0
      for (const el of els) {
        const r = el.getBoundingClientRect()
        // 0 while the element fills the screen, →1 as it leaves upward
        const p = Math.min(1, Math.max(0, -r.top / Math.max(1, r.height * 0.85)))
        el.style.setProperty('--p', p.toFixed(3))
      }
    }
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(update) }
    update()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
      if (raf) cancelAnimationFrame(raf)
    }
  }, [])
}

/** Scroll-velocity skew on `.skewy` — the signature showcase touch. Hard-capped
 *  so it reads as momentum, never as a broken layout. */
export function useScrollSkew() {
  useEffect(() => {
    if (reduced()) return
    const els = Array.from(document.querySelectorAll<HTMLElement>('.skewy'))
    if (!els.length) return
    const MAX = 2 // degrees
    let last = window.scrollY
    let current = 0
    let raf = 0
    const loop = () => {
      const y = window.scrollY
      const target = Math.max(-MAX, Math.min(MAX, (y - last) * 0.06))
      last = y
      current += (target - current) * 0.12
      if (Math.abs(current) < 0.005) current = 0
      for (const el of els) el.style.transform = current ? `skewY(${current.toFixed(3)}deg)` : ''
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => {
      cancelAnimationFrame(raf)
      for (const el of els) el.style.transform = ''
    }
  }, [])
}

/** Live UTC clock for chrome elements. */
export function useZuluClock() {
  const ref = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    const tick = () => {
      if (!ref.current) return
      const d = new Date()
      const p = (n: number) => String(n).padStart(2, '0')
      ref.current.textContent = `${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}Z`
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [])
  return ref
}

/** Highlights the nav link of the section currently in view. */
export function useScrollSpy(ids: string[]) {
  useEffect(() => {
    const onScroll = () => {
      const y = window.scrollY + window.innerHeight * 0.35
      let active = ''
      for (const id of ids) {
        const el = document.getElementById(id)
        if (el && el.offsetTop <= y) active = id
      }
      document.querySelectorAll<HTMLElement>('.nav-link').forEach((a) => {
        a.classList.toggle('nav-active', a.getAttribute('href') === `#${active}`)
      })
    }
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [ids])
}

/** rAF-throttled parallax: elements with [data-parallax="speed"] drift on scroll. */
export function useParallax() {
  useEffect(() => {
    const els = Array.from(document.querySelectorAll<HTMLElement>('[data-parallax]'))
    if (!els.length) return
    let raf = 0
    const update = () => {
      raf = 0
      const vh = window.innerHeight
      els.forEach((el) => {
        const speed = parseFloat(el.dataset.parallax || '0')
        const r = el.getBoundingClientRect()
        const center = r.top + r.height / 2 - vh / 2
        el.style.transform = `translateY(${(-center * speed).toFixed(1)}px)`
      })
    }
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(update) }
    update()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
      if (raf) cancelAnimationFrame(raf)
    }
  }, [])
}

/** Magnetic pull on hover for elements with .magnetic. */
export function useMagnetic() {
  useEffect(() => {
    const els = Array.from(document.querySelectorAll<HTMLElement>('.magnetic'))
    const cleanups = els.map((el) => {
      const move = (e: MouseEvent) => {
        const r = el.getBoundingClientRect()
        const dx = e.clientX - (r.left + r.width / 2)
        const dy = e.clientY - (r.top + r.height / 2)
        el.style.transform = `translate(${(dx * 0.18).toFixed(1)}px, ${(dy * 0.28).toFixed(1)}px)`
      }
      const leave = () => { el.style.transform = '' }
      el.addEventListener('mousemove', move)
      el.addEventListener('mouseleave', leave)
      return () => { el.removeEventListener('mousemove', move); el.removeEventListener('mouseleave', leave) }
    })
    return () => cleanups.forEach((c) => c())
  }, [])
}

type LenisLike = { raf: (t: number) => void; destroy: () => void; stop: () => void; start: () => void }

/* Module-scoped handle so overlays (the mobile menu) can freeze inertial
   scrolling while they own the screen — `overflow:hidden` alone doesn't stop
   Lenis, which drives scroll itself. */
let lenisInstance: LenisLike | null = null
let lenisPaused = false

/** Freeze/unfreeze smooth scrolling. No-op when Lenis never initialised. */
export function setLenisPaused(paused: boolean) {
  lenisPaused = paused
  if (!lenisInstance) return
  if (paused) lenisInstance.stop()
  else lenisInstance.start()
}

/** Lenis smooth inertial scrolling (skipped for reduced-motion users). */
export function useLenis() {
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    let destroyed = false
    let raf = 0
    let lenis: LenisLike | null = null
    import('lenis').then(({ default: Lenis }) => {
      if (destroyed) return
      lenis = new Lenis({ lerp: 0.09, anchors: true }) as unknown as LenisLike
      lenisInstance = lenis
      if (lenisPaused) lenis.stop()
      const loop = (t: number) => {
        lenis?.raf(t)
        raf = requestAnimationFrame(loop)
      }
      raf = requestAnimationFrame(loop)
    })
    return () => {
      destroyed = true
      cancelAnimationFrame(raf)
      lenis?.destroy()
      if (lenisInstance === lenis) lenisInstance = null
    }
  }, [])
}
