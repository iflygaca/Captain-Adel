/* Captain Adel — standalone chat client. Vanilla ES2022.
   Talks to the Captain Adel API at /v1/chat (same origin). Override the base
   with window.ADEL_API_BASE if the API is served from another host.

   Renders the v1 grounding contract (docs/data-contract.md):
     { answer, kind, refusalClass, grounding:{state,mode,score,claims,…},
       sources:[{citation,url,part,section,sectionAnchor,verbatim,corpusVersion}] }
   Each Captain Adel answer leads with a THREE-state grounding badge
   (grounded · partial · refusal), § cites stay LTR via <bdi>, sources reveal the
   verbatim passage inline (the single-column "lockstep"), and clicking a cite in
   the prose snaps to its source. Falls back gracefully when the fields are absent. */
(() => {
  'use strict';

  const log     = document.getElementById('chat-log');
  const form    = document.getElementById('chat-form');
  const input   = document.getElementById('chat-text');
  const sendBtn = form ? form.querySelector('.chat-send') : null;
  if (!log || !form || !input) return;

  const ENDPOINT = (window.ADEL_API_BASE || '') + '/v1/chat';
  const AVATAR = 'assets/img/captain/avatar.png';
  const history = [];
  const isAr = () => document.documentElement.lang === 'ar';
  const t = (en, ar) => (isAr() ? ar : en);

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

  const ERROR = `I couldn't reach my engine just now. Please try again in a moment.`;
  const RATE_LIMITED = `**Ease off a moment, Captain.** That's a lot of questions in a `
    + `short span — give it a minute, then ask again.`;

  /* ---- minimal markdown ----
     Answer text + source links come from the model, so they are untrusted:
     esc() neutralises quotes, and every URL is scheme-checked before it lands
     in an href. */
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
      `<span class="cite" tabindex="0" role="button" data-section="${esc(sec)}">`
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
  function groundingBadge(data) {
    const k = data.kind;
    if (!k || !GBADGE[k]) return '';                 // 'na' / unknown → no badge
    const lbl = GBADGE[k][isAr() ? 1 : 0];
    const cls = (k === 'refusal' && data.refusalClass)
      ? `<span class="gb-class"><bdi dir="ltr" lang="en">§${esc(data.refusalClass)}</bdi></span>` : '';
    return `<div class="grounding-badge" data-state="${esc(k)}" role="status">`
      + `<span class="gb-dot" aria-hidden="true"></span>`
      + `<span class="gb-label">${esc(lbl)}</span>${cls}</div>`;
  }

  function renderSources(sources) {
    if (!sources || !sources.length) return '';
    const rows = sources.map((s, i) => {
      const cite = esc(s.citation || s.url || '');
      const hasV = !!s.verbatim;
      const secAttr = s.section ? ` data-section="${esc(s.section)}"` : '';
      const open = `<a class="src-open" href="${safeUrl(esc(s.url || '#'))}" target="_blank" rel="noopener nofollow ugc">${t('open ↗', 'افتح ↗')}</a>`;
      const toggle = `<button type="button" class="src-toggle"${hasV ? ' aria-expanded="false"' : ' disabled'}>`
        + `<span class="src-caret" aria-hidden="true">${hasV ? '▸' : '·'}</span>`
        + `<span class="src-cite"><bdi dir="ltr" lang="en">${cite}</bdi></span></button>`;
      const verbatim = hasV
        ? `<div class="src-verbatim" hidden><p>${esc(s.verbatim)}</p>`
          + (s.corpusVersion ? `<span class="src-ver"><bdi dir="ltr" lang="en">${esc(s.corpusVersion)}</bdi></span>` : '')
          + `</div>` : '';
      return `<div class="src-row"${secAttr}>${toggle}${open}${verbatim}</div>`;
    }).join('');
    return `<div class="msg-sources"><span class="src-label">${t('Sources', 'المصدر')}</span>${rows}</div>`;
  }

  function verifyActions(data) {
    if (data.kind !== 'refusal') return '';
    const part = (data.sources || []).map((s) => s.part).find(Boolean);
    let btns = '';
    if (part) btns += `<a class="vbtn" href="library.html#${encodeURIComponent(part)}" target="_blank" rel="noopener">`
      + `${t('Open Part', 'افتح الجزء')} <bdi dir="ltr" lang="en">${esc(part)}</bdi> ↗</a>`;
    btns += `<a class="vbtn" href="https://gaca.gov.sa" target="_blank" rel="noopener">${t('Check GACA', 'راجع الهيئة')} ↗</a>`;
    return `<div class="verify-actions">${btns}</div>`;
  }

  function stamp(data) {
    const ver = (data.sources || []).map((s) => s.corpusVersion).find(Boolean);
    if (data.kind === 'refusal') {
      return `<div class="msg-stamp refusal">${t('No grounded figure was returned — verify directly.', 'لم تُرجَع قيمة موثّقة — تحقّق مباشرة.')}</div>`;
    }
    if (data.kind === 'grounded' || data.kind === 'partial') {
      return `<div class="msg-stamp">${t('Verify against the official source', 'تحقّق من المصدر الرسمي')} — `
        + `<a href="https://gaca.gov.sa" target="_blank" rel="noopener">gaca.gov.sa</a>`
        + (ver ? ` <span class="stamp-ver">· <bdi dir="ltr" lang="en">${esc(ver)}</bdi></span>` : '')
        + `</div>`;
    }
    return '';
  }

  /* ---- messages ---- */
  function dismissWelcome() {
    const w = document.getElementById('chat-welcome');
    if (w) w.remove();
  }
  function scrollDown() { log.scrollTop = log.scrollHeight; }

  /* data: for an Adel answer, the full /v1/chat response; for user/error, omit. */
  function addMessage(role, html, data) {
    const msg = document.createElement('div');
    msg.className = 'msg ' + (role === 'user' ? 'user' : 'adel');
    let inner = '';
    if (role === 'adel') {
      inner += `<img class="msg-avatar" src="${AVATAR}" alt="Captain Adel" width="32" height="32">`;
    }
    const kind = data && data.kind ? ` data-kind="${esc(data.kind)}"` : '';
    let bubble = `<div class="msg-bubble"${kind}>`;
    if (role === 'adel' && data) bubble += groundingBadge(data);
    bubble += html;
    if (role === 'adel' && data) {
      bubble += verifyActions(data);
      bubble += renderSources(data.sources);
      bubble += stamp(data);
    }
    bubble += '</div>';
    msg.innerHTML = inner + bubble;
    log.appendChild(msg);
    scrollDown();
    return msg;
  }
  function addTyping() {
    const msg = document.createElement('div');
    msg.className = 'msg adel typing';
    msg.innerHTML = `<img class="msg-avatar" src="${AVATAR}" alt="" width="32" height="32">`
      + '<div class="msg-bubble"><span></span><span></span><span></span></div>';
    log.appendChild(msg);
    scrollDown();
    return msg;
  }

  /* ---- lockstep: reveal a source's verbatim passage ---- */
  function expandRow(row, on) {
    const v = row.querySelector('.src-verbatim');
    const tog = row.querySelector('.src-toggle');
    if (!v || !tog || tog.disabled) return;
    const open = on != null ? on : v.hasAttribute('hidden');
    if (open) { v.removeAttribute('hidden'); tog.setAttribute('aria-expanded', 'true'); }
    else      { v.setAttribute('hidden', ''); tog.setAttribute('aria-expanded', 'false'); }
    const caret = tog.querySelector('.src-caret');
    if (caret && caret.textContent !== '·') caret.textContent = open ? '▾' : '▸';
  }
  /* Clicking a § cite in the prose snaps to its matching source in the same message. */
  function snapToCite(cite) {
    const msg = cite.closest('.msg');
    if (!msg) return;
    const stem = (cite.dataset.section || '').split('(')[0];
    const rows = [...msg.querySelectorAll('.src-row[data-section]')];
    const match = rows.find((r) => r.dataset.section === cite.dataset.section)
      || rows.find((r) => (r.dataset.section || '').split('(')[0] === stem)
      || rows.find((r) => (r.dataset.section || '').startsWith(stem));
    msg.querySelectorAll('.cite.snapped').forEach((c) => c.classList.remove('snapped'));
    cite.classList.add('snapped');
    if (match) {
      expandRow(match, true);
      match.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      match.classList.add('flash');
      setTimeout(() => match.classList.remove('flash'), 700);
    }
  }

  /* ---- follow-up prompts ---- */
  const FOLLOWUPS = [
    { q: 'What are the VFR weather minima in controlled airspace?', en: 'VFR weather minima', ar: 'حدود طقس الطيران البصري' },
    { q: "What's required for a GACAR commercial pilot licence?", en: 'CPL requirements', ar: 'متطلبات رخصة الطيار التجاري' },
    { q: 'What are the fuel reserve requirements for a Part 121 flight?', en: 'Part 121 fuel reserves', ar: 'احتياطيات وقود الجزء 121' },
    { q: 'What does GACAR Part 91 say about carry-on baggage?', en: 'Carry-on baggage rules', ar: 'قواعد الأمتعة المحمولة' },
    { q: 'How do I convert a foreign pilot licence to a GACA licence?', en: 'Convert a foreign licence', ar: 'تحويل رخصة أجنبية' },
    { q: 'What are the recent-experience requirements to carry passengers?', en: 'Recency to carry passengers', ar: 'الحداثة لنقل الركاب' },
    { q: 'What is the transition altitude in Saudi Arabia?', en: 'Saudi transition altitude', ar: 'ارتفاع الانتقال في السعودية' },
    { q: 'What medical certificate does a private pilot need?', en: 'PPL medical class', ar: 'الفحص الطبي لرخصة الطيار الخاص' },
  ];
  function addFollowups() {
    const ar = isAr();
    const pick = FOLLOWUPS.slice().sort(() => Math.random() - 0.5).slice(0, 3);
    const wrap = document.createElement('div');
    wrap.className = 'chat-followups';
    wrap.innerHTML = `<span class="cf-label">${ar ? 'تابع الاستكشاف' : 'Keep exploring'}</span>`
      + '<div class="chat-suggest">'
      + pick.map((p) => `<button type="button" data-q="${esc(p.q)}">${esc(ar ? p.ar : p.en)}</button>`).join('')
      + '</div>';
    log.appendChild(wrap);
    scrollDown();
  }

  /* ---- backend ---- */
  async function ask(message) {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, history, session: sessionId(), provider: 'auto' }),
    });
    if (res.status === 429) throw new Error('rate_limited');
    if (!res.ok) throw new Error('backend');
    return res.json();
  }

  function send(text) {
    text = text.trim();
    if (!text) return;
    dismissWelcome();
    log.querySelectorAll('.chat-followups').forEach((e) => e.remove());
    addMessage('user', md(text));
    history.push({ role: 'user', text });
    input.value = '';
    input.style.height = 'auto';
    if (sendBtn) sendBtn.disabled = true;

    const typing = addTyping();
    ask(text)
      .then((data) => {
        typing.remove();
        const answer = (data && data.answer) || ERROR;
        addMessage('adel', md(answer), data || undefined);
        history.push({ role: 'model', text: answer });
        addFollowups();
        if (sendBtn) sendBtn.disabled = false;
      })
      .catch((err) => {
        typing.remove();
        const reply = (err && err.message) === 'rate_limited' ? RATE_LIMITED : ERROR;
        addMessage('adel', md(reply));
        if (sendBtn) sendBtn.disabled = false;
      });
  }

  /* ---- events ---- */
  form.addEventListener('submit', (e) => { e.preventDefault(); send(input.value); });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(input.value); }
  });
  input.addEventListener('input', () => {
    input.style.height = 'auto';
    input.style.height = Math.min(input.scrollHeight, 160) + 'px';
  });
  log.addEventListener('click', (e) => {
    const q = e.target.closest('button[data-q]');
    if (q) { send(q.dataset.q); return; }
    const tog = e.target.closest('.src-toggle');
    if (tog && !tog.disabled) { expandRow(tog.closest('.src-row')); return; }
    const cite = e.target.closest('.cite');
    if (cite) { snapToCite(cite); }
  });
  // keyboard: activate a focused § cite (Enter / Space)
  log.addEventListener('keydown', (e) => {
    const cite = e.target.closest && e.target.closest('.cite');
    if (cite && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); snapToCite(cite); }
  });

  /* ---- primed prompt: chat.html?q=... ---- */
  const primed = new URLSearchParams(location.search).get('q');
  if (primed) send(primed);
})();
