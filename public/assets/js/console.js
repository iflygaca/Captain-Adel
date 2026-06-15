/* Captain Adel — GACAR.console client. Vanilla ES2022.
   Two-pane, citation-first surface over the same /v1/chat contract chat.js speaks
   (docs/data-contract.md): each answer is a result card led by a three-state
   grounding badge; clicking a § cite SNAPS the right-hand Source pane to that
   passage (the two-pane lockstep). Same-origin fetch; degrades if fields absent. */
(() => {
  'use strict';

  const results = document.getElementById('results');
  const qform   = document.getElementById('qbar');
  const input   = document.getElementById('q');
  const sendBtn = qform ? qform.querySelector('.qbar-send') : null;
  const source  = document.getElementById('source');
  if (!results || !qform || !input || !source) return;

  const ENDPOINT = (window.ADEL_API_BASE || '') + '/v1/chat';
  const history = [];
  const isAr = () => document.documentElement.lang === 'ar';
  const t = (en, ar) => (isAr() ? ar : en);

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

  const ERROR = "I couldn't reach my engine just now. Please try again in a moment.";
  const RATE_LIMITED = "**Ease off a moment, Captain.** That's a lot of questions in a short span — give it a minute, then ask again.";

  /* ---- safe markdown ---- */
  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function safeUrl(u) {
    const raw = String(u).replace(/&amp;/g, '&').trim();
    if (/^(https?:\/\/|mailto:|\/|#)/i.test(raw)) return u;
    if (/^[\w./-]+\.html(?:[?#].*)?$/i.test(raw)) return u;
    return '#';
  }
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

  /* ---- contract rendering ---- */
  const GBADGE = {
    grounded: ['Grounded', 'موثَّق بالمصدر'],
    partial:  ['Partially grounded', 'موثَّق جزئياً'],
    refusal:  ['Hold — not grounded', 'توقّف — غير موثَّق'],
  };
  function badge(data) {
    const k = data.kind;
    if (!k || !GBADGE[k]) return '<span></span>';
    const lbl = GBADGE[k][isAr() ? 1 : 0];
    const cls = (k === 'refusal' && data.refusalClass)
      ? `<span class="gb-class"><bdi dir="ltr" lang="en">§${esc(data.refusalClass)}</bdi></span>` : '';
    return `<div class="grounding-badge" data-state="${esc(k)}" role="status">`
      + `<span class="gb-dot" aria-hidden="true"></span><span class="gb-label">${esc(lbl)}</span>${cls}</div>`;
  }
  function classtag(data) {
    if (data.kind === 'partial') return `<span class="src-label">${t('verify the unverified claim', 'تحقّق من العبارة غير المؤكدة')}</span>`;
    if (data.kind === 'grounded') return `<span class="src-label">${t('all claims cited', 'كل العبارات مُستشهَدة')}</span>`;
    return '<span></span>';
  }
  function sourceChips(sources) {
    if (!sources || !sources.length) return '';
    const chips = sources.map((s) => {
      const cite = esc(s.citation || s.url || '');
      const hasV = !!s.verbatim;
      const d = `data-section="${esc(s.section || '')}" data-cite="${cite}" data-anchor="${esc(s.sectionAnchor || s.section || '')}"`
        + ` data-ver="${esc(s.corpusVersion || '')}" data-url="${esc(safeUrl(s.url || '#'))}"`
        + ` data-verbatim="${esc(s.verbatim || '')}"`;
      return `<button type="button" class="src-chip" ${hasV ? '' : 'disabled'} ${d}>`
        + `<bdi dir="ltr" lang="en">${cite}</bdi></button>`;
    }).join('');
    return `<div class="rc-sources"><span class="src-label">${t('Sources', 'المصدر')}</span>${chips}</div>`;
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
    const seal = `<span class="seal">${t('Unofficial · educational', 'غير رسمي · تعليمي')}</span>`;
    if (data.kind === 'refusal') {
      return `<div class="rc-stamp refusal">${seal}<span>${t('No grounded figure was returned — verify directly.', 'لم تُرجَع قيمة موثّقة — تحقّق مباشرة.')}</span>`
        + (data.refusalClass ? `<span class="asof">refusalClass=${esc(data.refusalClass)}</span>` : '') + `</div>`;
    }
    return `<div class="rc-stamp">${seal}<span>${t('Verify against the official source', 'تحقّق من المصدر الرسمي')} — `
      + `<a href="https://gaca.gov.sa" target="_blank" rel="noopener">gaca.gov.sa</a></span>`
      + (ver ? `<span class="asof"><bdi dir="ltr" lang="en">${esc(ver)}</bdi></span>` : '') + `</div>`;
  }

  /* ---- the Source pane (lockstep target) ---- */
  function setSourceEmpty() {
    source.classList.add('empty');
    document.querySelectorAll('.cite.snapped, .src-chip.snapped').forEach((e) => e.classList.remove('snapped'));
    document.getElementById('src-cite').textContent = '—';
    document.getElementById('src-foot').hidden = true;
    document.getElementById('src-body').innerHTML =
      `<div class="nogrnd">${t('no grounded source', 'لا مصدر موثّق')}</div>`
      + `<p class="passage">${t('Retrieval returned no text that supports this answer. The absence is intentional — verify the section directly.', 'لم تُرجِع الاستعادة نصاً يدعم هذه الإجابة. هذا غياب مقصود — تحقّق مباشرة في المادة.')}</p>`;
  }
  function snapSource(d) {
    source.classList.remove('empty');
    document.getElementById('src-cite').innerHTML = `<bdi dir="ltr" lang="en">§${esc(d.section || d.anchor || '')}</bdi>`;
    document.getElementById('src-body').innerHTML =
      `<p class="secline">${esc(d.cite || '')}</p><p class="passage">${esc(d.verbatim || '')}</p>`;
    const foot = document.getElementById('src-foot');
    foot.hidden = false;
    document.getElementById('src-open').href = d.url && d.url !== '#' ? d.url : ('library.html#' + encodeURIComponent(d.anchor || ''));
    document.getElementById('src-ver').innerHTML = d.ver ? `<bdi dir="ltr" lang="en">${esc(d.ver)}</bdi>` : '';
  }
  function chipData(chip) {
    return { section: chip.dataset.section, cite: chip.dataset.cite, anchor: chip.dataset.anchor,
      ver: chip.dataset.ver, url: chip.dataset.url, verbatim: chip.dataset.verbatim };
  }
  // snap from a clicked element (prose .cite or .src-chip), matching within its card
  function snapFrom(el) {
    const card = el.closest('.result-card');
    if (!card) return;
    document.querySelectorAll('.cite.snapped, .src-chip.snapped').forEach((e) => e.classList.remove('snapped'));
    el.classList.add('snapped');
    const sec = el.dataset.section || '';
    const stem = sec.split('(')[0];
    const chips = [...card.querySelectorAll('.src-chip[data-verbatim]')].filter((c) => c.dataset.verbatim);
    const chip = chips.find((c) => c.dataset.section === sec)
      || chips.find((c) => (c.dataset.section || '').split('(')[0] === stem)
      || chips.find((c) => (c.dataset.section || '').startsWith(stem));
    if (chip) { chip.classList.add('snapped'); snapSource(chipData(chip)); }
    else setSourceEmpty();
  }

  /* ---- cards ---- */
  function dismissWelcome() { const w = document.getElementById('console-welcome'); if (w) w.remove(); }
  function addCard(query) {
    const card = document.createElement('article');
    card.className = 'result-card active';
    document.querySelectorAll('.result-card.active').forEach((c) => c.classList.remove('active'));
    card.classList.add('active');
    card.innerHTML = `<div class="rc-top">${badge({})}<span></span></div>`
      + `<div class="rc-body"><p class="rc-q">${esc(query)}</p>`
      + `<p class="rc-typing" aria-label="${t('thinking', 'يفكّر')}">·&nbsp;·&nbsp;·</p></div>`;
    results.appendChild(card);
    card.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    return card;
  }
  function fillCard(card, query, data) {
    card.dataset.kind = data.kind || '';
    card.innerHTML = `<div class="rc-top">${badge(data)}${classtag(data)}</div>`
      + `<div class="rc-body"><p class="rc-q">${esc(query)}</p>`
      + md(data.answer || ERROR)
      + verifyActions(data)
      + sourceChips(data.sources)
      + `</div>`
      + stamp(data);
    // snap the pane to the first grounded source, or show the empty state
    const firstChip = card.querySelector('.src-chip[data-verbatim]');
    if (data.kind === 'refusal' || data.kind === 'na' || !firstChip || !firstChip.dataset.verbatim) setSourceEmpty();
    else { firstChip.classList.add('snapped'); snapSource(chipData(firstChip)); }
  }

  /* ---- backend ---- */
  async function* askStream(message) {
    const res = await fetch(ENDPOINT + '?stream=1', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
      body: JSON.stringify({ message, history, session: sessionId(), provider: 'auto' }),
    });
    if (res.status === 429) throw new Error('rate_limited');
    if (!res.ok || !res.body) throw new Error('backend');

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

  function send(text) {
    text = String(text || '').trim();
    if (!text) return;
    dismissWelcome();
    const card = addCard(text);
    history.push({ role: 'user', text });
    input.value = '';
    if (sendBtn) sendBtn.disabled = true;

    let answer = '';
    let final = null;

    (async () => {
      for await (const ev of askStream(text)) {
        if (ev.type === 'token') {
          answer += ev.delta;
          const typing = card.querySelector('.rc-typing');
          if (typing) typing.remove();
          
          let body = card.querySelector('.rc-body');
          if (!body) {
            body = document.createElement('div');
            body.className = 'rc-body';
            card.appendChild(body);
          }
          body.innerHTML = `<p class="rc-q">${esc(text)}</p>` + md(answer);
          card.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        } else if (ev.type === 'final') {
          final = ev;
          answer = ev.answer != null ? ev.answer : answer;
        } else if (ev.type === 'error') {
          throw new Error('backend');
        }
      }
      fillCard(card, text, final || { answer });
      history.push({ role: 'model', text: answer || ERROR });
      if (sendBtn) sendBtn.disabled = false;
    })().catch((err) => {
      const reply = (err && err.message) === 'rate_limited' ? RATE_LIMITED : ERROR;
      fillCard(card, text, { answer: reply });
      if (sendBtn) sendBtn.disabled = false;
    });
  }

  /* ---- events ---- */
  qform.addEventListener('submit', (e) => { e.preventDefault(); send(input.value); });
  document.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); input.focus(); }
    if (e.key === '/' && !/^(input|textarea)$/i.test(e.target.tagName)) { e.preventDefault(); input.focus(); }
  });
  // ↑ ↓ walk the citations in the most recent card
  document.addEventListener('keydown', (e) => {
    if (/^(input|textarea)$/i.test(e.target.tagName)) return;
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    const card = [...document.querySelectorAll('.result-card')].pop();
    if (!card) return;
    const cites = [...card.querySelectorAll('.cite')];
    if (!cites.length) return;
    e.preventDefault();
    const cur = cites.findIndex((c) => c.classList.contains('snapped'));
    const next = e.key === 'ArrowDown' ? (cur + 1) % cites.length : (cur - 1 + cites.length) % cites.length;
    cites[next].focus(); snapFrom(cites[next]);
  });
  results.addEventListener('click', (e) => {
    const sug = e.target.closest('button[data-q]'); if (sug) { send(sug.dataset.q); return; }
    const chip = e.target.closest('.src-chip'); if (chip && !chip.disabled) { snapFrom(chip); return; }
    const cite = e.target.closest('.cite'); if (cite) { snapFrom(cite); }
  });
  results.addEventListener('keydown', (e) => {
    const cite = e.target.closest && e.target.closest('.cite');
    if (cite && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); snapFrom(cite); }
  });

  /* ---- language toggle ---- */
  const enBtn = document.getElementById('lang-en');
  const arBtn = document.getElementById('lang-ar');
  function setLang(lang) {
    const ar = lang === 'ar';
    document.documentElement.lang = lang;
    document.documentElement.dir = ar ? 'rtl' : 'ltr';
    enBtn.setAttribute('aria-pressed', String(!ar));
    arBtn.setAttribute('aria-pressed', String(ar));
    document.querySelectorAll('[data-en]').forEach((el) => { el.innerHTML = ar ? el.dataset.ar : el.dataset.en; });
    input.placeholder = ar ? input.dataset.arPh : input.dataset.enPh;
  }
  if (enBtn && arBtn) {
    enBtn.addEventListener('click', () => setLang('en'));
    arBtn.addEventListener('click', () => setLang('ar'));
  }

  /* ---- primed prompt: console.html?q=... ---- */
  const primed = new URLSearchParams(location.search).get('q');
  if (primed) send(primed);
})();
