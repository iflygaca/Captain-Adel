/* Captain Adel — captadel.com bilingual engine (Arabic-first). Vanilla ES2022.
   Swaps every [data-en]/[data-ar] node between Arabic (default, RTL) and English
   (LTR), drives the <html lang|dir>, persists the choice, and announces changes
   so chat.js can re-render its dynamic chips in the right language.

   Authoring model — write the visible markup in ARABIC (the default). Add a
   data-en (and data-ph-en for placeholders) with the English. The Arabic baseline
   is captured from the DOM on first run, so there is no flash for Arabic users and
   data-ar is only needed when the Arabic differs from what is already on the page.
   Elements whose content includes inline markup (links, <strong>, the gradient
   span) carry data-i18n-html and swap innerHTML; everything else swaps textContent
   — both sides are our own static, trusted strings. */
(() => {
  'use strict';

  const KEY = 'captadel:lang';
  const DEFAULT = 'ar';
  const SUPPORTED = ['ar', 'en'];

  function stored() {
    try { const v = localStorage.getItem(KEY); return SUPPORTED.includes(v) ? v : null; }
    catch (_) { return null; }
  }
  function save(l) { try { localStorage.setItem(KEY, l); } catch (_) {} }

  let lang = stored() || DEFAULT;

  /* Cache the authored (Arabic) baseline once, so switching en -> ar restores it
     even when the element carries only a data-en. */
  function baseline(el) {
    if (el._i18nBase == null) {
      el._i18nBase = el.hasAttribute('data-i18n-html') ? el.innerHTML : el.textContent;
    }
    return el._i18nBase;
  }
  function phBaseline(el) {
    if (el._i18nPh == null) el._i18nPh = el.getAttribute('placeholder') || '';
    return el._i18nPh;
  }

  function apply(next) {
    lang = SUPPORTED.includes(next) ? next : DEFAULT;
    const html = document.documentElement;
    html.lang = lang;
    html.dir = lang === 'ar' ? 'rtl' : 'ltr';

    document.querySelectorAll('[data-en],[data-ar]').forEach((el) => {
      const base = baseline(el);
      const override = el.getAttribute('data-' + lang);
      const val = override != null ? override : base; // missing side -> Arabic baseline
      if (el.hasAttribute('data-i18n-html')) el.innerHTML = val;
      else el.textContent = val;
    });

    document.querySelectorAll('[data-ph-en],[data-ph-ar]').forEach((el) => {
      const base = phBaseline(el);
      const override = el.getAttribute('data-ph-' + lang);
      el.setAttribute('placeholder', override != null ? override : base);
    });

    // The toggle advertises the language it switches TO.
    document.querySelectorAll('.lang-toggle').forEach((btn) => {
      btn.textContent = lang === 'ar' ? 'EN' : 'العربية';
      btn.setAttribute('aria-label',
        lang === 'ar' ? 'Switch to English' : 'التبديل إلى العربية');
      btn.setAttribute('lang', lang === 'ar' ? 'en' : 'ar');
    });

    save(lang);
    document.dispatchEvent(new CustomEvent('captadel:langchange', { detail: { lang } }));
  }

  function toggle() { apply(lang === 'ar' ? 'en' : 'ar'); }

  window.CaptadelI18n = { apply, toggle, get lang() { return lang; } };

  document.addEventListener('click', (e) => {
    const btn = e.target.closest && e.target.closest('.lang-toggle');
    if (btn) { e.preventDefault(); toggle(); }
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => apply(lang));
  } else {
    apply(lang);
  }
})();
