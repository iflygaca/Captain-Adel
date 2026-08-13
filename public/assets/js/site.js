/* Captain Adel — sitewide chrome behaviours. Vanilla ES2022, classic script,
   loaded with defer on every page.
   Mobile nav disclosure: .nav-burger toggles .site-nav.nav-open (the ≤820px
   dropdown in adel.css) with aria-expanded; Escape, an outside click, or
   following a link closes it. The button label follows the i18n engine's
   captadel:langchange since aria-labels are outside i18n.js's scope.
   The footer year is NOT here: footer.js owns the whole footer now, renders
   #year into it and stamps the year itself. */
(() => {
  'use strict';

  const isAr = () => document.documentElement.lang === 'ar';

  const burger = document.querySelector('.nav-burger');
  const nav = burger && burger.closest('.site-nav');
  if (!burger || !nav) return;

  function setOpen(on) {
    nav.classList.toggle('nav-open', on);
    burger.setAttribute('aria-expanded', String(on));
  }
  function labelBurger() {
    burger.setAttribute('aria-label', isAr() ? 'القائمة' : 'Menu');
  }
  labelBurger();
  document.addEventListener('captadel:langchange', labelBurger);

  burger.addEventListener('click', () => setOpen(!nav.classList.contains('nav-open')));
  nav.addEventListener('click', (e) => {
    if (e.target.closest('.nav-links a')) setOpen(false);
  });
  document.addEventListener('click', (e) => {
    if (nav.classList.contains('nav-open') && !e.target.closest('.site-nav')) setOpen(false);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && nav.classList.contains('nav-open')) { setOpen(false); burger.focus(); }
  });
})();
