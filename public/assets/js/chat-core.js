/* Captain Adel — shared chat client core. Vanilla ES2022, classic script.
   The helpers chat.js and console.js both need, authored once: safe minimal
   markdown (answer text and source links come from the model, so they are
   untrusted — esc() neutralises quotes and every URL is scheme-checked before
   it lands in an href), the § cite tokens that drive the source lockstep, the
   grounding badge, the per-browser session id, the bilingual error copy, and
   the /v1/chat SSE transport.

   Load with `defer` BEFORE chat.js / console.js — both read window.AdelChatCore.
   The module.exports branch exists solely so test/chat-core.test.js can load
   the same file under node:test (the helpers are DOM-free by design; language
   comes from document.documentElement.lang when a document exists). */
(() => {
  'use strict';

  const isAr = () => typeof document !== 'undefined' && document.documentElement.lang === 'ar';
  const t = (en, ar) => (isAr() ? ar : en);

  /* API base: same origin unless the page set window.ADEL_API_BASE. */
  function apiBase() {
    return (typeof window !== 'undefined' && window.ADEL_API_BASE) || '';
  }

  /* Stable per-browser id so the backend rate-limits each browser on its own
     budget rather than lumping everyone behind one IP. No personal data. */
  function sessionId() {
    try {
      let s = localStorage.getItem('captadel:adel-session');
      if (!s) {
        s = 'ca-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
        localStorage.setItem('captadel:adel-session', s);
      }
      return s;
    } catch (_) { return ''; }
  }
  function newTurnId() {
    return 'tn-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
  }

  /* Bilingual fallback copy for transport failures (the QUOTA upsell stays in
     chat.js — the console has no billing surface). */
  const errorText = () => t(
    `I couldn't reach my engine just now. Please try again in a moment.`,
    `تعذّر الوصول إلى المحرّك الآن. حاول مرة أخرى بعد قليل.`);
  const rateLimitedText = () => t(
    `**Ease off a moment, Captain.** That's a lot of questions in a `
    + `short span — give it a minute, then ask again.`,
    `**تمهّل قليلاً يا كابتن.** هذه أسئلة كثيرة في وقت قصير — `
    + `انتظر دقيقة ثم اسأل من جديد.`);

  /* ---- minimal markdown ---- */
  function esc(s) {
    return String(s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function safeUrl(u) {
    const raw = String(u).replace(/&amp;/g, '&').trim();
    if (/^(https?:\/\/|mailto:|\/|#)/i.test(raw)) return u;
    if (/^[\w./-]+\.html(?:[?#].*)?$/i.test(raw)) return u;
    return '#';
  }
  /* Wrap every "§91.155(a)(2)" token as a focusable cite that stays LTR in RTL
     and drives the source lockstep. Runs on already-escaped text. */
  function citeTokens(html) {
    return html.replace(/§\s?(\d+\.\d+(?:\.\d+)?(?:\([^)]*\))?)/g, (m, sec) =>
      `<span class="cite" tabindex="0" role="button"`
      + ` aria-label="${t('View source', 'عرض المصدر')} ${esc(sec)}" data-section="${esc(sec)}">`
      + `<bdi dir="ltr" lang="en">${m}</bdi></span>`);
  }
  function inline(text) {
    return citeTokens(esc(text)
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g,
        (_m, label, url) => `<a href="${safeUrl(url)}" rel="noopener nofollow ugc">${label}</a>`));
  }
  function md(text) {
    let html = '', list = false;
    for (const raw of String(text).split('\n')) {
      const line = raw.trim();
      if (/^[-*]\s+/.test(line)) {
        if (!list) { html += '<ul>'; list = true; }
        html += '<li>' + inline(line.replace(/^[-*]\s+/, '')) + '</li>';
      } else {
        if (list) { html += '</ul>'; list = false; }
        if (line) html += '<p>' + inline(line) + '</p>';
      }
    }
    if (list) html += '</ul>';
    return html;
  }

  /* ---- grounding contract rendering ---- */
  const GBADGE = {
    grounded: ['Grounded', 'موثَّق بالمصدر'],
    partial:  ['Partially grounded', 'موثَّق جزئياً'],
    refusal:  ['Hold — not grounded', 'توقّف — غير موثَّق'],
  };
  /* '' for na/unknown — chat.js renders nothing there; console.js pads its
     card top with an empty <span></span> at the call site. */
  function badgeHtml(data) {
    const k = data && data.kind;
    if (!k || !GBADGE[k]) return '';
    const lbl = GBADGE[k][isAr() ? 1 : 0];
    const cls = (k === 'refusal' && data.refusalClass)
      ? `<span class="gb-class"><bdi dir="ltr" lang="en">§${esc(data.refusalClass)}</bdi></span>` : '';
    return `<div class="grounding-badge" data-state="${esc(k)}" role="status">`
      + `<span class="gb-dot" aria-hidden="true"></span>`
      + `<span class="gb-label">${esc(lbl)}</span>${cls}</div>`;
  }

  /* Refusal verify action: the honest step is the regulator itself. */
  function verifyActions(data) {
    if (!data || data.kind !== 'refusal') return '';
    return `<div class="verify-actions">`
      + `<a class="vbtn" href="https://gaca.gov.sa" target="_blank" rel="noopener">${t('Check GACA', 'راجع الهيئة')} ↗</a>`
      + `</div>`;
  }

  /* ---- /v1/chat SSE transport ---- */
  /* POST the turn and map transport failures to coded errors. Returns the raw
     Response so the caller can read headers (chat.js reads the quota hint)
     before iterating sseEvents(res). */
  async function postChat(endpoint, payload, extraHeaders) {
    const res = await fetch(endpoint + '?stream=1', {
      method: 'POST',
      headers: Object.assign(
        { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
        extraHeaders || {}),
      body: JSON.stringify(payload),
    });
    if (res.status === 429) throw new Error('rate_limited');
    if (res.status === 402) throw new Error('quota_exceeded');
    if (!res.ok || !res.body) throw new Error('backend');
    return res;
  }
  /* Yield the parsed SSE events ({type:'token'|'reset'|'final'|'error'}).
     [DONE] terminates; malformed frames are skipped. */
  async function* sseEvents(res) {
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      let nl;
      while ((nl = buf.indexOf('\n')) !== -1) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (!line.startsWith('data:')) continue;
        const payload = line.slice(5).trim();
        if (payload === '[DONE]') return;
        try { yield JSON.parse(payload); } catch (_) {}
      }
    }
  }

  const AdelChatCore = {
    apiBase, sessionId, newTurnId,
    errorText, rateLimitedText,
    esc, safeUrl, citeTokens, inline, md,
    GBADGE, badgeHtml, verifyActions,
    postChat, sseEvents,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = AdelChatCore;
  if (typeof window !== 'undefined') window.AdelChatCore = AdelChatCore;
})();
