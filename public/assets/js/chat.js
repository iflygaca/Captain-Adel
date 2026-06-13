/* Captain Adel — standalone chat client. Vanilla ES2022.
   Talks to the Captain Adel API at /v1/chat (same origin). Override the base
   with window.ADEL_API_BASE if the API is served from another host.

   Streams the answer token-by-token over SSE (?stream=1): each `token` event
   appends text; a terminal `final` event carries the v1 grounding contract
   (kind · refusalClass · grounding · sources) which is then rendered as the
   badge, the source lockstep, the verify stamp, and per-answer actions
   (copy · 👍/👎). The conversation is mirrored to localStorage so a refresh
   keeps it. Falls back gracefully when fields are absent. */
(() => {
  'use strict';

  const log     = document.getElementById('chat-log');
  const form    = document.getElementById('chat-form');
  const input   = document.getElementById('chat-text');
  const sendBtn = form ? form.querySelector('.chat-send') : null;
  const micBtn  = document.getElementById('chat-mic');
  if (!log || !form || !input) return;

  // Browser-native voice (no backend). Both are progressive enhancements:
  // the mic stays hidden and the listen button is omitted when unsupported.
  const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
  const TTS = window.speechSynthesis || null;

  const API     = (window.ADEL_API_BASE || '');
  const ENDPOINT = API + '/v1/chat';
  const AVATAR  = 'assets/img/captain/avatar.png';
  const history = [];
  let examMode = false;     // GACA oral-exam mode (Adel plays the examiner)
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
  function newTurnId() {
    return 'tn-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
  }

  /* Reflect the free-tier "questions left" count from the X-Adel-Quota-Remaining
     response header into an optional header pill (#chat-quota). No-op when the
     element is absent (Pro / launch mode / signed-out-with-no-quota all omit the
     header) so this never gets in the way. */
  function updateQuotaHint(remaining) {
    const el = document.getElementById('chat-quota');
    if (!el || !Number.isFinite(remaining)) return;
    el.hidden = false;
    el.textContent = isAr()
      ? `متبقّي اليوم: ${remaining}`
      : `${remaining} left today`;
  }

  const ERROR = `I couldn't reach my engine just now. Please try again in a moment.`;
  const RATE_LIMITED = `**Ease off a moment, Captain.** That's a lot of questions in a `
    + `short span — give it a minute, then ask again.`;
  const QUOTA = () => isAr()
    ? `**استنفدت أسئلتك المجانية لهذه الفترة يا كابتن.** ارتقِ إلى **برو** للأسئلة بلا حدود — `
      + `[شاهد الأسعار](/#pricing) — أو عُد عند تجدّد الرصيد.`
    : `**You've used your free questions for now, Captain.** Go **Pro** for unlimited `
      + `questions — [see pricing](/#pricing) — or come back when the allowance resets.`;

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
    const rows = sources.map((s) => {
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

  /* Per-answer actions: copy + thumbs feedback. The answer text and turn meta
     ride on the message element's dataset (set when finalised). */
  function actionsBar() {
    const listen = TTS
      ? `<button type="button" class="act-btn act-listen" aria-label="${t('Listen', 'استمع')}" title="${t('Listen', 'استمع')}">`
        + `<span class="act-ico">🔊</span><span class="act-txt">${t('Listen', 'استمع')}</span></button>`
      : '';
    return `<div class="msg-actions">`
      + `<button type="button" class="act-btn act-copy" aria-label="${t('Copy', 'نسخ')}" title="${t('Copy', 'نسخ')}">`
      + `<span class="act-ico">⧉</span><span class="act-txt">${t('Copy', 'نسخ')}</span></button>`
      + listen
      + `<button type="button" class="act-btn act-fb" data-r="up" aria-label="${t('Helpful', 'مفيد')}" title="${t('Helpful', 'مفيد')}">👍</button>`
      + `<button type="button" class="act-btn act-fb" data-r="down" aria-label="${t('Not helpful', 'غير مفيد')}" title="${t('Not helpful', 'غير مفيد')}">👎</button>`
      + `</div>`;
  }

  /* ---- voice: speak an answer (TTS) + dictate a question (STT) ---- */
  // Strip markdown/cite punctuation so the spoken answer reads cleanly.
  function speakable(textMd) {
    return String(textMd || '')
      .replace(/\*\*([^*]+)\*\*/g, '$1')
      .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
      .replace(/[#>`*_]/g, '')
      .replace(/§/g, isAr() ? ' مادة ' : ' section ')
      .replace(/\s+/g, ' ').trim();
  }
  function voiceLang(text) { return /[؀-ۿ]/.test(text) ? 'ar-SA' : 'en-US'; }
  let speakingBtn = null;
  function toggleSpeak(msg, btn) {
    if (!TTS) return;
    const wasThis = btn.classList.contains('speaking');
    TTS.cancel();
    if (speakingBtn) speakingBtn.classList.remove('speaking');
    speakingBtn = null;
    if (wasThis) return;                               // second click = stop
    const text = speakable(msg.dataset.answer || '');
    if (!text) return;
    const u = new SpeechSynthesisUtterance(text);
    u.lang = voiceLang(text);
    const voices = TTS.getVoices ? TTS.getVoices() : [];
    const v = voices.find((vo) => vo.lang && vo.lang.toLowerCase().startsWith(u.lang.slice(0, 2)));
    if (v) u.voice = v;
    u.onend = () => { btn.classList.remove('speaking'); if (speakingBtn === btn) speakingBtn = null; };
    btn.classList.add('speaking');
    speakingBtn = btn;
    TTS.speak(u);
  }

  let recog = null;
  let recognizing = false;
  function setupMic() {
    if (!SpeechRec || !micBtn) return;                 // unsupported → stays hidden
    micBtn.hidden = false;
    recog = new SpeechRec();
    recog.continuous = false;
    recog.interimResults = true;
    recog.maxAlternatives = 1;
    recog.onresult = (e) => {
      let txt = '';
      for (let i = 0; i < e.results.length; i++) txt += e.results[i][0].transcript;
      input.value = txt;
      input.style.height = 'auto';
      input.style.height = Math.min(input.scrollHeight, 160) + 'px';
    };
    const stop = () => { recognizing = false; micBtn.classList.remove('listening'); };
    recog.onend = stop;
    recog.onerror = stop;
    micBtn.addEventListener('click', () => {
      if (recognizing) { try { recog.stop(); } catch (_) {} return; }
      recog.lang = isAr() ? 'ar-SA' : 'en-US';
      try { recog.start(); recognizing = true; micBtn.classList.add('listening'); input.focus(); }
      catch (_) {}
    });
  }

  /* ---- messages ---- */
  function dismissWelcome() {
    const w = document.getElementById('chat-welcome');
    if (w) w.remove();
  }
  function scrollDown() { log.scrollTop = log.scrollHeight; }

  /* Build the inner HTML of a finalised Adel bubble from the grounding data. */
  function adelBubbleHtml(answerText, data) {
    let html = '';
    if (data) html += groundingBadge(data);
    html += `<div class="msg-prose">${md(answerText)}</div>`;
    if (data) {
      html += verifyActions(data);
      html += renderSources(data.sources);
      html += stamp(data);
      html += actionsBar();
    }
    return html;
  }

  function addUser(text) {
    const msg = document.createElement('div');
    msg.className = 'msg user';
    msg.innerHTML = `<div class="msg-bubble">${md(text)}</div>`;
    log.appendChild(msg);
    scrollDown();
    return msg;
  }

  /* Create an empty Adel bubble to stream into; returns { msg, prose }. */
  function startAdel() {
    const msg = document.createElement('div');
    msg.className = 'msg adel streaming';
    msg.innerHTML = `<img class="msg-avatar" src="${AVATAR}" alt="Captain Adel" width="32" height="32">`
      + `<div class="msg-bubble"><div class="msg-prose"></div></div>`;
    log.appendChild(msg);
    scrollDown();
    return { msg, prose: msg.querySelector('.msg-prose') };
  }

  /* Replace a streamed bubble with the finalised, grounded render. */
  function finishAdel(msg, answerText, data) {
    msg.classList.remove('streaming');
    const bubble = msg.querySelector('.msg-bubble');
    if (data && data.kind) bubble.setAttribute('data-kind', data.kind);
    bubble.innerHTML = adelBubbleHtml(answerText, data);
    msg.dataset.answer = answerText || '';
    if (data && data.meta && data.meta.provider) msg.dataset.provider = data.meta.provider;
    scrollDown();
  }

  /* Render a finalised Adel message in one shot (used when restoring history). */
  function addAdel(answerText, data) {
    const { msg } = startAdel();
    finishAdel(msg, answerText, data);
    return msg;
  }

  function addError(replyMd) {
    const msg = document.createElement('div');
    msg.className = 'msg adel';
    msg.innerHTML = `<img class="msg-avatar" src="${AVATAR}" alt="" width="32" height="32">`
      + `<div class="msg-bubble">${md(replyMd)}</div>`;
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

  /* ---- copy + feedback actions ---- */
  async function copyAnswer(msg, btn) {
    const text = msg.dataset.answer || '';
    try {
      await navigator.clipboard.writeText(text);
    } catch (_) {
      const ta = document.createElement('textarea');
      ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); } catch (__) {}
      ta.remove();
    }
    const label = btn.querySelector('.act-txt');
    if (label) { const old = label.textContent; label.textContent = t('Copied', 'تم النسخ'); setTimeout(() => { label.textContent = old; }, 1400); }
  }
  function sendFeedback(msg, btn) {
    const bar = btn.closest('.msg-actions');
    if (bar) bar.querySelectorAll('.act-fb').forEach((b) => b.classList.remove('picked'));
    btn.classList.add('picked');
    const body = {
      rating: btn.dataset.r,
      turnId: msg.dataset.turn || '',
      provider: msg.dataset.provider || '',
    };
    fetch(API + '/v1/feedback', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }).catch(() => {});
  }

  /* ---- follow-up prompts ---- */
  const FOLLOWUPS = [
    { q: 'What are the VFR weather minima in controlled airspace?', qAr: 'ما هي حدود الطقس للطيران البصري VFR في المجال الجوي المراقب؟', en: 'VFR weather minima', ar: 'حدود طقس الطيران البصري' },
    { q: "What's required for a GACAR commercial pilot licence?", qAr: 'ما متطلبات رخصة الطيار التجاري CPL وفق لوائح GACAR؟', en: 'CPL requirements', ar: 'متطلبات رخصة الطيار التجاري' },
    { q: 'What are the fuel reserve requirements for a Part 121 flight?', qAr: 'ما متطلبات احتياطي الوقود لرحلة وفق Part 121؟', en: 'Part 121 fuel reserves', ar: 'احتياطي وقود Part 121' },
    { q: 'What does GACAR Part 91 say about carry-on baggage?', qAr: 'ماذا تقول GACAR Part 91 عن الأمتعة المحمولة في المقصورة؟', en: 'Carry-on baggage rules', ar: 'قواعد الأمتعة المحمولة' },
    { q: 'How do I convert a foreign pilot licence to a GACA licence?', qAr: 'كيف أحوّل رخصة طيار أجنبية إلى رخصة من الهيئة GACA؟', en: 'Convert a foreign licence', ar: 'تحويل رخصة أجنبية' },
    { q: 'What are the recent-experience requirements to carry passengers?', qAr: 'ما متطلبات الخبرة الحديثة (الحداثة) لنقل الركاب؟', en: 'Recency to carry passengers', ar: 'الحداثة لنقل الركاب' },
    { q: 'What is the transition altitude in Saudi Arabia?', qAr: 'ما هو ارتفاع الانتقال في السعودية؟', en: 'Saudi transition altitude', ar: 'ارتفاع الانتقال في السعودية' },
    { q: 'What medical certificate does a private pilot need?', qAr: 'ما الشهادة الطبية التي يحتاجها الطيار الخاص PPL؟', en: 'PPL medical class', ar: 'الفحص الطبي لرخصة الطيار الخاص' },
  ];
  function addFollowups() {
    const ar = isAr();
    const pick = FOLLOWUPS.slice().sort(() => Math.random() - 0.5).slice(0, 3);
    const wrap = document.createElement('div');
    wrap.className = 'chat-followups';
    wrap.innerHTML = `<span class="cf-label" data-en="Keep exploring">${ar ? 'تابع الاستكشاف' : 'Keep exploring'}</span>`
      + '<div class="chat-suggest">'
      + pick.map((p) => `<button type="button" data-q="${esc(p.q)}" data-q-ar="${esc(p.qAr)}"`
        + ` data-en="${esc(p.en)}" data-ar="${esc(p.ar)}">${esc(ar ? p.ar : p.en)}</button>`).join('')
      + '</div>';
    log.appendChild(wrap);
    scrollDown();
  }

  /* ---- conversation persistence (localStorage, this device only) ---- */
  const STORE = 'captadel:transcript';
  const transcript = [];     // { role:'user'|'adel', text, turn?, data? }
  function persist() {
    try { localStorage.setItem(STORE, JSON.stringify(transcript.slice(-60))); } catch (_) {}
  }
  function restore() {
    let saved;
    try { saved = JSON.parse(localStorage.getItem(STORE) || '[]'); } catch (_) { saved = []; }
    if (!Array.isArray(saved) || !saved.length) return;
    dismissWelcome();
    for (const e of saved) {
      transcript.push(e);
      if (e.role === 'user') {
        addUser(e.text);
        history.push({ role: 'user', text: e.text });
      } else {
        const msg = addAdel(e.text, e.data);
        if (e.turn) msg.dataset.turn = e.turn;
        if (e.data && e.data.meta && e.data.meta.provider) msg.dataset.provider = e.data.meta.provider;
        history.push({ role: 'model', text: e.text });
      }
    }
    while (history.length > 24) history.shift();
    scrollDown();
  }

  /* Attach the pilot's Firebase ID token when signed in, so the backend can lift
     the free-tier quota for Pro accounts. Anonymous (no bridge / no token) is
     fine — the request just goes out unauthenticated. */
  async function authHeader() {
    try {
      const tok = window.CaptadelAuth && await window.CaptadelAuth.getIdToken();
      return tok ? { Authorization: 'Bearer ' + tok } : {};
    } catch (_) { return {}; }
  }

  /* ---- backend (streaming) ---- */
  async function* askStream(message) {
    const res = await fetch(ENDPOINT + '?stream=1', {
      method: 'POST',
      headers: Object.assign(
        { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
        await authHeader()),
      body: JSON.stringify({
        message, history, session: sessionId(), provider: 'auto',
        mode: examMode ? 'exam' : undefined,
      }),
    });
    if (res.status === 429) throw new Error('rate_limited');
    if (res.status === 402) throw new Error('quota_exceeded');
    if (!res.ok || !res.body) throw new Error('backend');
    const left = res.headers.get('X-Adel-Quota-Remaining');
    if (left != null) updateQuotaHint(parseInt(left, 10));

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

  /* Animated-character hook: adel-character.js listens for these and reacts;
     a no-op when the character script is absent. */
  function adelState(state) {
    try { document.dispatchEvent(new CustomEvent('adel:state', { detail: { state } })); } catch (_) { /* optional */ }
  }

  function send(text) {
    text = text.trim();
    if (!text) return;
    dismissWelcome();
    log.querySelectorAll('.chat-followups').forEach((e) => e.remove());

    addUser(text);
    history.push({ role: 'user', text });
    transcript.push({ role: 'user', text });
    persist();

    input.value = '';
    input.style.height = 'auto';
    if (sendBtn) sendBtn.disabled = true;
    adelState('thinking');

    const turn = newTurnId();
    const { msg, prose } = startAdel();
    msg.dataset.turn = turn;
    let answer = '';
    let final = null;

    (async () => {
      for await (const ev of askStream(text)) {
        if (ev.type === 'token') { answer += ev.delta; adelState('talking'); prose.innerHTML = md(answer); scrollDown(); }
        else if (ev.type === 'reset') { answer = ''; prose.innerHTML = ''; }
        else if (ev.type === 'final') { final = ev; answer = ev.answer != null ? ev.answer : answer; }
        else if (ev.type === 'error') { throw new Error('backend'); }
      }
      finishAdel(msg, answer, final);
      const kind = final && final.kind;
      adelState(kind === 'refusal' ? 'salute' : kind === 'grounded' ? 'grounded' : 'idle');
      history.push({ role: 'model', text: answer });
      transcript.push({
        role: 'adel', text: answer, turn,
        data: final && {
          kind: final.kind, refusalClass: final.refusalClass,
          sources: final.sources, meta: final.meta,
        },
      });
      persist();
      addFollowups();
      if (sendBtn) sendBtn.disabled = false;
    })().catch((err) => {
      const code = err && err.message;
      const reply = code === 'rate_limited' ? RATE_LIMITED
        : code === 'quota_exceeded' ? QUOTA()
          : ERROR;
      msg.remove();
      adelState('error');
      addError(reply);
      if (sendBtn) sendBtn.disabled = false;
    });
  }

  /* ---- clear conversation ---- */
  function clearChat() {
    transcript.length = 0; history.length = 0;
    try { localStorage.removeItem(STORE); } catch (_) {}
    log.querySelectorAll('.msg, .chat-followups').forEach((e) => e.remove());
    location.reload();
  }

  /* ---- events ---- */
  form.addEventListener('submit', (e) => { e.preventDefault(); send(input.value); });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(input.value); }
  });
  input.addEventListener('input', () => {
    input.style.height = 'auto';
    input.style.height = Math.min(input.scrollHeight, 160) + 'px';
    adelState('listening');
  });
  input.addEventListener('focus', () => adelState('listening'));
  input.addEventListener('blur', () => adelState('idle'));

  // A suggestion chip carries the question in both languages; send the one that
  // matches the current UI language so an Arabic UI routes to the Arabic model.
  function chipQuestion(btn) {
    return (isAr() && btn.dataset.qAr) ? btn.dataset.qAr : btn.dataset.q;
  }
  log.addEventListener('click', (e) => {
    const q = e.target.closest('button[data-q]');
    if (q) { send(chipQuestion(q)); return; }
    const copy = e.target.closest('.act-copy');
    if (copy) { copyAnswer(copy.closest('.msg'), copy); return; }
    const listen = e.target.closest('.act-listen');
    if (listen) { toggleSpeak(listen.closest('.msg'), listen); return; }
    const fb = e.target.closest('.act-fb');
    if (fb) { sendFeedback(fb.closest('.msg'), fb); return; }
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

  const clearBtn = document.getElementById('chat-clear');
  if (clearBtn) clearBtn.addEventListener('click', clearChat);

  /* ---- exam mode: Adel runs a GACA oral exam ---- */
  const examBtn = document.getElementById('chat-exam');
  function examLabel() {
    if (!examBtn) return;
    examBtn.textContent = examMode ? t('End exam', 'إنهاء الاختبار') : t('Start exam 🎓', 'ابدأ اختبار 🎓');
  }
  function setExam(on) {
    examMode = !!on;
    try { localStorage.setItem('captadel:exam', examMode ? '1' : '0'); } catch (_) {}
    if (examBtn) examBtn.classList.toggle('active', examMode);
    document.body.classList.toggle('exam-on', examMode);
    examLabel();
  }
  if (examBtn) {
    try { if (localStorage.getItem('captadel:exam') === '1') setExam(true); } catch (_) {}
    examLabel();
    examBtn.addEventListener('click', () => {
      if (examMode) { setExam(false); return; }
      setExam(true);
      send(isAr() ? 'ابدأ اختبار الطيران الشفهي.' : 'Start the oral exam.');
    });
  }
  document.addEventListener('captadel:langchange', examLabel);

  setupMic();

  /* ---- boot: restore prior conversation, then handle a primed prompt ---- */
  restore();
  const primed = new URLSearchParams(location.search).get('q');
  if (primed) send(primed);
})();
