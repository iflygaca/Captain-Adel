/* Captain Adel — shared site footer injector. Vanilla ES2022.
   Renders the one canonical footer (GACA-independence disclaimer, legal links,
   copyright, and the operator identity line for BDA Company International) into
   <div id="site-footer"> on every page, replacing the hand-copied per-page
   footers. Pages that are app surfaces (chat, console) mark the mount with
   data-compact and get the short identity-only variant.

   MUST be loaded BEFORE i18n.js: i18n.js snapshots the Arabic baseline from the
   DOM on its first apply, so the injected nodes have to exist by then — both
   scripts are `defer`, so document order guarantees it. Pages without i18n.js
   (console.html, authored lang="en") get the English strings applied directly. */
(() => {
  'use strict';

  const mount = document.getElementById('site-footer');
  if (!mount) return;

  const ENTITY_AR =
    'تشغّلها شركة بدع الدولية (BDA Company International) — س.ت 7030976893 — الرقم الضريبي 311415259500003 — الرياض، المملكة العربية السعودية';
  const ENTITY_EN =
    'Operated by BDA Company International (شركة بدع الدولية) — CR 7030976893 — VAT 311415259500003 — Riyadh, Saudi Arabia';

  const legalLinks = (withMail) => `
      <nav class="footer-legal-links" aria-label="قانوني">
        <a href="terms.html" data-en="Terms of Use">شروط الاستخدام</a>
        <a href="privacy.html" data-en="Privacy Notice">إشعار الخصوصية</a>${withMail ? `
        <a href="mailto:hello@captadel.com">hello@captadel.com</a>` : ''}
      </nav>`;

  const entityLine = `
      <p class="footer-entity" data-en="${ENTITY_EN}">${ENTITY_AR}</p>`;

  const full = `
<footer class="site-footer">
  <div class="container">
    <p class="footer-disclaimer" data-en="Unofficial &amp; educational. Captain Adel is an independent educational tool. It is not affiliated with, endorsed by, or connected to the General Authority of Civil Aviation (GACA). The authoritative source for any regulation is always GACA. Always verify against the latest official GACA publication at gaca.gov.sa before relying on any information. Captain Adel is an educational AI and can be wrong — not for operational use in flight.">
      <strong>غير رسمي وتعليمي.</strong> كابتن عادل أداة تعليمية مستقلة. لا يتبع الهيئة
      العامة للطيران المدني (GACA) ولا تعتمده ولا ترتبط به. المرجع المعتمد لأي لائحة هو
      الهيئة دائماً. تحقّق دائماً من أحدث نشرة رسمية للهيئة على gaca.gov.sa قبل الاعتماد
      على أي معلومة. كابتن عادل ذكاء اصطناعي تعليمي وقد يُخطئ — وليس للاستخدام التشغيلي في الطيران.</p>
    <div class="footer-bottom">
      <span data-en="&copy; 2026 Captain Adel · Independent of GACA · Made in the Kingdom · صُنع في السعودية">&copy; <span id="year">2026</span> كابتن عادل · مستقل عن الهيئة · صُنع في السعودية · Made in the Kingdom</span>${legalLinks(true)}
    </div>${entityLine}
  </div>
</footer>`;

  const compact = `
<footer class="site-footer site-footer-compact">
  <div class="container">${entityLine}${legalLinks(false)}
  </div>
</footer>`;

  mount.outerHTML = mount.hasAttribute('data-compact') ? compact : full;

  const y = document.getElementById('year');
  if (y) y.textContent = new Date().getFullYear();

  /* English-authored pages (console.html) have no i18n.js — apply data-en now.
     Arabic-first pages are authored lang="ar", so this is a no-op there and
     i18n.js takes over after us. */
  if ((document.documentElement.lang || 'ar').toLowerCase().startsWith('en')) {
    document.querySelectorAll('.site-footer [data-en]').forEach((el) => {
      const v = el.getAttribute('data-en');
      if (el.hasAttribute('data-i18n-html')) el.innerHTML = v;
      else el.textContent = v;
    });
  }
})();
