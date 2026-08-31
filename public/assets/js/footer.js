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

  const RADAR_SVG = `<svg width="36" height="36" viewBox="0 0 48 48" fill="none" aria-hidden="true" class="radar-mark">
    <circle cx="24" cy="24" r="21" stroke="#2d8ea8" stroke-width="1.5" opacity=".8" />
    <circle cx="24" cy="24" r="13" stroke="#1a2540" stroke-width="1" />
    <circle cx="24" cy="24" r="5" stroke="#1a2540" stroke-width="1" />
    <line x1="24" y1="3" x2="24" y2="45" stroke="#1a2540" stroke-width="1" />
    <line x1="3" y1="24" x2="45" y2="24" stroke="#1a2540" stroke-width="1" />
    <g class="anim-sweep">
      <path d="M24 24 L24 3 A21 21 0 0 1 38.8 9.2 Z" fill="url(#sweepGradF)" opacity=".7" />
      <line x1="24" y1="24" x2="24" y2="3" stroke="#22d3ee" stroke-width="1.6" />
    </g>
    <circle cx="33" cy="15" r="2" fill="#34d399" class="anim-pulse-dot" />
    <circle cx="24" cy="24" r="2" fill="#22d3ee" />
    <defs>
      <linearGradient id="sweepGradF" x1="24" y1="24" x2="24" y2="3" gradientUnits="userSpaceOnUse">
        <stop stop-color="#22d3ee" stop-opacity=".5" />
        <stop offset="1" stop-color="#22d3ee" stop-opacity="0" />
      </linearGradient>
    </defs>
  </svg>`;

  const full = `
<footer class="site-footer">
  <div class="container">
    <div class="footer-grid">
      <div class="footer-brand-col">
        <div class="footer-brand-header">
          ${RADAR_SVG}
          <div>
            <div class="footer-brand-title font-mono" data-en="CAPTAIN ADEL">كابتن عادل</div>
            <div class="footer-brand-sub font-mono" data-en="captadel.com">captadel.com</div>
          </div>
        </div>
        <p class="footer-brand-desc" data-en="An independent AI flight instructor for Saudi civil aviation. One brain — direct on captadel.com, embedded in Fly GACA via API.">
          مدرّب طيران ذكي مستقل للطيران المدني السعودي. عقل واحد — مباشر على captadel.com، ومدمج في Fly GACA عبر الواجهة البرمجية.
        </p>
      </div>

      <div class="footer-nav-col font-mono">
        <div class="footer-col-title" data-en="Applications & Tools">التطبيقات والمراجع</div>
        <a href="chat.html" data-en="Captain Adel — Smart Chat ↗">كابتن عادل — المحادثة الذكية ↗</a>
        <a href="exam.html" data-en="GACAR Mock Exam 🎓">اختبار GACAR التجريبي 🎓</a>
        <a href="tools.html" data-en="Aviation Flight Computer ✈️">حاسبة الطيران الملاحية ✈️</a>
        <a href="https://flygaca.com" target="_blank" rel="noreferrer" data-en="Fly GACA — Aviation Library ↗">Fly GACA — مكتبة الطيران ↗</a>
        <a href="https://github.com/ay2m" target="_blank" rel="noreferrer" data-en="Fly GACA on GitHub ↗">Fly GACA على GitHub ↗</a>
      </div>

      <div class="footer-nav-col font-mono">
        <div class="footer-col-title" data-en="Authority & Operations">الجهة الرسمية والعمليات</div>
        <a href="https://gaca.gov.sa" target="_blank" rel="noreferrer" data-en="gaca.gov.sa — the authoritative source">gaca.gov.sa — المصدر الرسمي</a>
        <span class="footer-sub-item" data-en="PDPL — processed in-Kingdom">PDPL — معالجة داخل المملكة</span>
        <span class="footer-sub-item">Node 20+ · proprietary license</span>
      </div>
    </div>

    <div class="footer-disclaimer-box">
      <p class="footer-disclaimer" data-en="UNOFFICIAL &amp; EDUCATIONAL — Captain Adel is not affiliated with, endorsed by, or operated by the General Authority of Civil Aviation (GACA). The authoritative source for any regulation is always GACA. Always verify against gaca.gov.sa.">
        <strong>غير رسمي وتعليمي —</strong> كابتن عادل لا يتبع الهيئة العامة للطيران المدني (GACA) ولا يرعاها ولا يشغّلها. المصدر الرسمي لأي نظام هو دائمًا هيئة الطيران المدني. تحقّق دائمًا من المصدر الرسمي على gaca.gov.sa.
      </p>
    </div>

    <div class="footer-bottom font-mono">
      <div class="footer-copy">
        <span data-en="&copy; 2026 Captain Adel · Independent of GACA · Made in the Kingdom">&copy; <span id="year">2026</span> كابتن عادل · مستقل عن الهيئة · صُنع في السعودية</span>
        ${legalLinks(true)}
      </div>
      <div class="footer-telemetry">
        <span class="tele-dot"></span>
        <span data-en="SYSTEMS NOMINAL">الأنظمة تعمل</span>
      </div>
    </div>
    ${entityLine}
  </div>
</footer>`;

  const compact = `
<footer class="site-footer site-footer-compact font-mono">
  <div class="container">${entityLine}${legalLinks(false)}
  </div>
</footer>`;

  mount.outerHTML = mount.hasAttribute('data-compact') ? compact : full;

  const y = document.getElementById('year');
  if (y) y.textContent = new Date().getFullYear();

  /* English-authored pages (console.html) have no i18n.js — apply data-en now. */
  if ((document.documentElement.lang || 'ar').toLowerCase().startsWith('en')) {
    document.querySelectorAll('.site-footer [data-en]').forEach((el) => {
      const v = el.getAttribute('data-en');
      if (el.hasAttribute('data-i18n-html')) el.innerHTML = v;
      else el.textContent = v;
    });
  }
})();
