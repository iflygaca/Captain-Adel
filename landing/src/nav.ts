/* Single source for the section nav — shared by the desktop header and the
   mobile overlay so the two can never drift apart. */
import { isAr } from './i18n'

export type NavItem = { label: string; href: string }

export const NAV: NavItem[] = isAr
  ? [
      { label: 'العقيدة', href: '#doctrine' },
      { label: 'الكابتن', href: '#captain' },
      { label: 'العقل', href: '#brain' },
      { label: 'النماذج', href: '#models' },
      { label: 'الأسئلة', href: '#faq' },
      { label: 'GACAR', href: '#qa' },
      { label: 'API', href: '#api' },
    ]
  : [
      { label: 'The Doctrine', href: '#doctrine' },
      { label: 'The Captain', href: '#captain' },
      { label: 'The Brain', href: '#brain' },
      { label: 'Models', href: '#models' },
      { label: 'FAQ', href: '#faq' },
      { label: 'GACAR Q&A', href: '#qa' },
      { label: 'API', href: '#api' },
    ]

/** Latin digits in English, Arabic-Indic in Arabic — matches the SectionTag voice. */
export function indexLabel(n: number): string {
  const s = String(n).padStart(2, '0')
  return isAr ? s.replace(/\d/g, (d) => '٠١٢٣٤٥٦٧٨٩'[Number(d)]) : s
}
