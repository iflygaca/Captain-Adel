import { useEffect, useState } from 'react'
import { isAr } from '../i18n'

/* Phone-only conversion bar. The header CTA is desktop-only now, so this is
   what carries "Ask Adel" on mobile. It appears once the hero has scrolled
   away and retreats again over the API section so it never covers the real
   call to action (or the footer links). */
export default function StickyCta() {
  const [shown, setShown] = useState(false)

  useEffect(() => {
    const hero = document.getElementById('top')
    const api = document.getElementById('api')
    if (!hero) return

    let heroGone = false
    let atTarget = false
    const sync = () => setShown(heroGone && !atTarget)

    const heroIo = new IntersectionObserver(
      ([e]) => { heroGone = !e.isIntersecting; sync() },
      { threshold: 0, rootMargin: '-72px 0px 0px 0px' }
    )
    heroIo.observe(hero)

    let apiIo: IntersectionObserver | null = null
    if (api) {
      apiIo = new IntersectionObserver(
        ([e]) => { atTarget = e.isIntersecting; sync() },
        { threshold: 0 }
      )
      apiIo.observe(api)
    }
    return () => { heroIo.disconnect(); apiIo?.disconnect() }
  }, [])

  return (
    <div className={`sticky-cta md:hidden ${shown ? 'is-shown' : ''}`} aria-hidden={!shown}>
      <a href="/chat" className="sticky-cta-btn font-mono2">
        {isAr ? 'اسأل كابتن عادل' : 'Ask Captain Adel'}
        <span aria-hidden>{isAr ? '←' : '→'}</span>
      </a>
    </div>
  )
}
