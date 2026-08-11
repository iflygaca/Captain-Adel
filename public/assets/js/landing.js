/* Captain Adel — landing-page motion (index.html only). Vanilla ES2022, classic
   script, loaded with defer after site.js. Two progressive enhancements, each a
   no-op when unsupported so the page is complete without JS:

   1) Scroll-reveal — the reveal targets are hidden ONLY behind the html.js-reveal
      gate, which this script adds. With no JS, no IntersectionObserver, or
      prefers-reduced-motion, nothing is ever hidden. The gate class and the
      observer are wired in one synchronous task, so targets can't flash visible
      first. Cards in the same intersection batch stagger via an inline
      transition-delay; once each has revealed, transitionend strips .reveal /
      .in-view / the inline delay so the base .card hover transitions (richer than
      the reveal's opacity+transform list) take back over cleanly.

   2) Pointer spotlight — writes --mx/--my (px from the element's left/top edge,
      physical coords, so RTL-safe) that the card ::after radial highlight reads.
      Fine-pointer only, rAF-throttled. Without it the CSS falls back to a
      centered glow. */
(() => {
  'use strict';

  /* ---- 1) scroll-reveal --------------------------------------------------- */
  const targets = ['.showcase .demo-card', '#what .card', '#how .card', '#pricing .price-card']
    .flatMap((sel) => [...document.querySelectorAll(sel)]);

  if (targets.length && 'IntersectionObserver' in window &&
      !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    const reveal = (el, k) => {
      el.style.transitionDelay = `${k * 80}ms`;
      el.classList.add('in-view');
      el.addEventListener('transitionend', () => {
        el.classList.remove('reveal', 'in-view');
        el.style.transitionDelay = '';
      }, { once: true });
    };
    const io = new IntersectionObserver((entries, obs) => {
      entries.filter((e) => e.isIntersecting).forEach((e, k) => {
        reveal(e.target, k);
        obs.unobserve(e.target);
      });
    }, { rootMargin: '0px 0px -10% 0px' });

    targets.forEach((el) => el.classList.add('reveal'));
    document.documentElement.classList.add('js-reveal'); // hide…
    targets.forEach((el) => io.observe(el));             // …and observe, same task
  }

  /* ---- 2) pointer spotlight ---------------------------------------------- */
  if (window.matchMedia('(hover: hover) and (pointer: fine)').matches) {
    let raf = 0;
    document.querySelectorAll('.card, .price-card, .demo-card').forEach((el) => {
      el.addEventListener('pointermove', (e) => {
        if (raf) return;
        raf = requestAnimationFrame(() => {
          raf = 0;
          const r = el.getBoundingClientRect();
          el.style.setProperty('--mx', `${e.clientX - r.left}px`);
          el.style.setProperty('--my', `${e.clientY - r.top}px`);
        });
      });
    });
  }
})();
