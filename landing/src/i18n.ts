/* Single source for language state — path-driven: / = English, /ar/ = العربية */
export const LANG: 'en' | 'ar' = window.location.pathname.startsWith('/ar') ? 'ar' : 'en'
export const isAr = LANG === 'ar'

/* Direction + language on <html> as early as possible */
document.documentElement.lang = LANG
document.documentElement.dir = isAr ? 'rtl' : 'ltr'

export const ALT_URL = isAr ? '/' : '/ar/'

/* Bilingual string picker */
export function pick<T>(en: T, ar: T): T {
  return isAr ? ar : en
}
