/* Captain Adel — landing page niceties.
 *  - smooth scroll for in-page anchors
 *  - IntersectionObserver reveal for cards/steps (subtle fade-up)
 *  - reveal the live corpus size at boot via a small health probe
 */
(() => {
  'use strict';

  // ----- smooth scroll for in-page links -----
  document.querySelectorAll('a[href^="#"]').forEach((a) => {
    a.addEventListener('click', (e) => {
      const id = a.getAttribute('href');
      if (!id || id === '#') return;
      const el = document.querySelector(id);
      if (!el) return;
      e.preventDefault();
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      history.replaceState(null, '', id);
    });
  });

  // ----- fade-in cards on scroll (no library) -----
  const revealEls = document.querySelectorAll(
    '.cap-card, .step, .aud-card, .ex-q, .ex-a'
  );
  if ('IntersectionObserver' in window && revealEls.length) {
    revealEls.forEach((el) => {
      el.style.opacity = '0';
      el.style.transform = 'translateY(12px)';
      el.style.transition = 'opacity .6s ease, transform .6s ease';
    });
    const io = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        const el = entry.target;
        el.style.opacity = '1';
        el.style.transform = 'translateY(0)';
        io.unobserve(el);
      });
    }, { rootMargin: '0px 0px -10% 0px', threshold: 0.05 });
    revealEls.forEach((el) => io.observe(el));
  }

  // ----- live corpus size from /health -----
  const eyebrow = document.querySelector('.hero-eyebrow span:last-child');
  if (eyebrow) {
    const base = eyebrow.textContent;
    fetch('/health')
      .then((r) => r.ok ? r.json() : null)
      .then((j) => {
        if (!j) return;
        // currently /health returns service+ts+provider; corpus size comes from
        // the same JSON the chat endpoints see, so we just keep "On duty" the
        // truth and don't try to invent a number we don't have.
        if (j.status === 'ok') eyebrow.textContent = base.replace('On duty', 'On duty · live').replace('· live', '· live');
      })
      .catch(() => { /* offline / not deployed — leave the placeholder */ });
  }
})();
