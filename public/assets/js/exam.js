/* Captain Adel — GACAR mock exam + free practice. Vanilla ES2022; no framework.
   Loads assets/data/quiz.json and runs two modes over the same bank:
   - exam:     timed simulation (config from quiz.json `exam`), answers stay
               changeable and hidden until submit, palette navigation, flags,
               a review-before-submit screen, and sessionStorage resume so a
               refresh never loses a sitting.
   - practice: untimed drill, topic-filtered, instant feedback per answer.
   Both end in a result card with a weakest-first topic breakdown and a
   filterable review; every reviewed question (and every practice miss) can be
   handed to Captain Adel — buildAskPrompt (exam-core.js) → /v1/chat streamed
   via chat-core.js — plus a one-tap debrief handoff to chat.html?q=.

   UI chrome is bilingual (Arabic-first, mirrors i18n.js); questions stay in
   their authored language. Re-renders the current screen on captadel:langchange.
   Pure DOM — textContent / replaceChildren — for everything except Captain
   Adel's streamed answers, which go through chat-core's escaped markdown
   pipeline (the same sanctioned innerHTML path chat.js uses). */
(() => {
  'use strict';

  const core = window.AdelExamCore;
  const chat = window.AdelChatCore;
  const shell = document.getElementById('exam-shell');
  if (!shell || !core) return;

  const QUIZ_URL = 'assets/data/quiz.json';
  const ENDPOINT = '/v1/chat';
  const STORE = 'captadel:exam-progress';
  const AVATAR = '/avatar.png';
  const PRACTICE_COUNTS = [10, 15, 25];

  const isAr = () => document.documentElement.lang !== 'en';
  const t = (en, ar) => (isAr() ? ar : en);
  const lang = () => (isAr() ? 'ar' : 'en');

  /* ---- state ---- */
  let data = null;                    // parsed quiz.json
  let cfg = core.examConfig(null);
  let phase = 'loading';              // loading|start|exam|review|result|error
  let mode = 'exam';                  // exam | practice
  let pickedBanks = new Set();        // practice topic filter; empty = all topics
  let practiceCount = 15;
  let questions = [];
  let current = 0;
  let answers = {};
  let flagged = new Set();
  let timerSecs = 0;
  let timerId = null;
  let submitted = false;
  let result = null;                  // { correct, answered, total, pct, pass, timedOut, byTopic }
  let reviewFilter = 'all';           // all | wrong | flagged
  let resume = null;                  // valid snapshot found in sessionStorage
  const askCache = new Map();         // question index -> {status:'pending'|'done', answer, data, prompt}

  /* ---- tiny DOM helpers (trusted static strings only) ---- */
  function el(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = String(text);
    return n;
  }
  function button(cls, label, onClick) {
    const b = el('button', cls, label);
    b.type = 'button';
    if (onClick) b.addEventListener('click', onClick);
    return b;
  }
  function statBox(n, l) {
    const s = el('div', 'exam-stat');
    s.appendChild(el('span', 'exam-stat-n', n));
    s.appendChild(el('span', 'exam-stat-l', l));
    return s;
  }
  function announce(text) {
    let live = document.getElementById('exam-live');
    if (!live) {
      live = el('div', 'visually-hidden');
      live.id = 'exam-live';
      live.setAttribute('aria-live', 'polite');
      document.body.appendChild(live);
    }
    live.textContent = text;
  }

  /* ---- progress persistence (exam mode; survives a refresh, not a new tab) */
  function saveProgress() {
    if (mode !== 'exam' || phase !== 'exam' || submitted) return;
    try {
      sessionStorage.setItem(STORE, JSON.stringify(
        core.snapshot({ mode, questions, answers, flagged, timerSecs, current })));
    } catch (_) { /* storage full/blocked — resume is best-effort */ }
  }
  function clearProgress() { try { sessionStorage.removeItem(STORE); } catch (_) {} }
  function loadProgress() {
    try {
      const s = JSON.parse(sessionStorage.getItem(STORE) || 'null');
      return core.validSnapshot(s) && s.mode === 'exam' ? s : null;
    } catch (_) { return null; }
  }

  /* ---- load ---- */
  async function loadQuestions() {
    try {
      const res = await fetch(QUIZ_URL);
      if (!res.ok) throw new Error('fetch');
      const parsed = await res.json();
      if (!core.validQuizData(parsed)) throw new Error('shape');
      data = parsed;
      cfg = core.examConfig(parsed);
      resume = loadProgress();
      phase = 'start';
      render();
    } catch (_) {
      phase = 'error';
      render();
    }
  }

  /* ---- render dispatcher (langchange re-draws the current screen) ---- */
  function render() {
    if (phase === 'start')  return renderStart();
    if (phase === 'exam')   return renderExam();
    if (phase === 'review') return renderReview();
    if (phase === 'result') return renderResult();
    if (phase === 'error')  return renderError();
  }

  function renderError() {
    shell.replaceChildren();
    const d = el('div', 'exam-start');
    d.appendChild(el('h2', null, t('Could not load questions', 'تعذّر تحميل الأسئلة')));
    d.appendChild(el('p', null, t(
      'The question bank could not be fetched. Please refresh and try again.',
      'تعذّر جلب بنك الأسئلة. حدّث الصفحة وحاول مجدّداً.')));
    shell.appendChild(d);
  }

  /* ================================ start ================================ */
  function totalAvailable() {
    return core.flatten(data.banks, mode === 'practice' ? [...pickedBanks] : null).length;
  }

  function renderStart() {
    shell.replaceChildren();
    const div = el('div', 'exam-start');

    const img = el('img');
    img.src = AVATAR; img.alt = ''; img.width = 80; img.height = 80;
    img.className = 'exam-start-avatar';
    div.appendChild(img);

    div.appendChild(el('h2', null, t('GACAR Knowledge Exam', 'اختبار معرفة GACAR')));
    div.appendChild(el('p', null, t(
      'Questions are drawn from the GACAR library and every answer cites its source. '
        + 'Sit the timed mock exam, or drill a topic in practice mode — and hand any '
        + 'question to Captain Adel for a grounded explanation.',
      'الأسئلة مأخوذة من مكتبة لوائح GACAR وكل إجابة تستشهد بمصدرها. '
        + 'أدِّ الاختبار المحاكي المؤقّت، أو تدرّب على موضوع بعينه في وضع التدريب — '
        + 'وأحِل أي سؤال إلى كابتن عادل ليشرحه لك بشرح موثَّق.')));

    /* mode switch */
    const seg = el('div', 'exam-mode-toggle');
    seg.setAttribute('role', 'group');
    seg.setAttribute('aria-label', t('Mode', 'الوضع'));
    const mkMode = (m, en, ar) => {
      const b = button('exam-mode-btn' + (mode === m ? ' on' : ''), t(en, ar), () => {
        mode = m; renderStart();
      });
      b.setAttribute('aria-pressed', mode === m ? 'true' : 'false');
      return b;
    };
    seg.appendChild(mkMode('exam', 'Mock exam', 'اختبار محاكاة'));
    seg.appendChild(mkMode('practice', 'Practice', 'تدريب حر'));
    div.appendChild(seg);

    /* practice controls: topic + size */
    if (mode === 'practice') {
      const topics = el('div', 'exam-topic-picker');
      topics.appendChild(el('p', 'exam-picker-label', t('Topics', 'المواضيع')));
      const chips = el('div', 'exam-chips');
      const allChip = button('exam-chip' + (pickedBanks.size === 0 ? ' on' : ''),
        t('All topics', 'كل المواضيع'), () => { pickedBanks.clear(); renderStart(); });
      allChip.setAttribute('aria-pressed', pickedBanks.size === 0 ? 'true' : 'false');
      chips.appendChild(allChip);
      for (const b of data.banks) {
        const on = pickedBanks.has(b.id);
        const chip = button('exam-chip' + (on ? ' on' : ''),
          (isAr() ? (b.titleAr || b.title) : b.title), () => {
            if (on) pickedBanks.delete(b.id); else pickedBanks.add(b.id);
            renderStart();
          });
        chip.title = (isAr() ? (b.descAr || b.desc || '') : (b.desc || ''));
        chip.setAttribute('aria-pressed', on ? 'true' : 'false');
        chips.appendChild(chip);
      }
      topics.appendChild(chips);

      topics.appendChild(el('p', 'exam-picker-label', t('Questions', 'عدد الأسئلة')));
      const counts = el('div', 'exam-chips');
      for (const n of PRACTICE_COUNTS) {
        const chip = button('exam-chip' + (practiceCount === n ? ' on' : ''), String(n),
          () => { practiceCount = n; renderStart(); });
        chip.setAttribute('aria-pressed', practiceCount === n ? 'true' : 'false');
        counts.appendChild(chip);
      }
      topics.appendChild(counts);
      div.appendChild(topics);
    }

    /* stats */
    const stats = el('div', 'exam-stats');
    if (mode === 'exam') {
      stats.appendChild(statBox(cfg.questions, t('Questions', 'سؤال')));
      stats.appendChild(statBox(cfg.minutes + (isAr() ? ' د' : ' min'), t('Time limit', 'المدة')));
      stats.appendChild(statBox(cfg.passMark + '%', t('Pass mark', 'حد النجاح')));
    } else {
      const avail = totalAvailable();
      stats.appendChild(statBox(Math.min(practiceCount, avail), t('Questions', 'سؤال')));
      stats.appendChild(statBox('∞', t('Untimed', 'بلا مؤقّت')));
      stats.appendChild(statBox('✓', t('Instant feedback', 'تصحيح فوري')));
    }
    div.appendChild(stats);

    /* resume card (exam sitting found in this tab) */
    if (resume && mode === 'exam') {
      const card = el('div', 'exam-resume');
      const done = Object.keys(resume.answers).length;
      card.appendChild(el('p', null, t(
        `Unfinished exam found — ${done}/${resume.questions.length} answered, ${core.fmtTime(resume.timerSecs)} left.`,
        `لديك اختبار غير مكتمل — أجبت ${done}/${resume.questions.length}، والمتبقي ${core.fmtTime(resume.timerSecs)}.`)));
      const row = el('div', 'exam-resume-actions');
      row.appendChild(button('btn btn-primary', t('Resume exam', 'استأنف الاختبار'), () => startExam(resume)));
      row.appendChild(button('btn btn-ghost', t('Discard', 'تجاهَل'), () => {
        clearProgress(); resume = null; renderStart();
      }));
      card.appendChild(row);
      div.appendChild(card);
    }

    const start = button('btn btn-primary exam-start-btn',
      mode === 'exam' ? t('Start exam', 'ابدأ الاختبار') : t('Start practice', 'ابدأ التدريب'),
      () => startExam(null));
    div.appendChild(start);

    div.appendChild(el('p', 'exam-kbd-hint', t(
      'Keyboard: A–D answer · ← → navigate · F flag',
      'لوحة المفاتيح: A–D للإجابة · ← → للتنقّل · F للتعليم')));

    shell.appendChild(div);
  }

  /* ================================ run ================================ */
  function startExam(snapshot) {
    if (snapshot) {
      questions = snapshot.questions;
      answers   = snapshot.answers;
      flagged   = new Set(snapshot.flagged);
      timerSecs = snapshot.timerSecs;
      current   = snapshot.current;
    } else {
      questions = core.pickQuestions(data.banks, {
        count: mode === 'exam' ? cfg.questions : practiceCount,
        bankIds: mode === 'practice' ? [...pickedBanks] : null,
        mixOptions: true,
      });
      answers = {}; flagged = new Set(); current = 0;
      timerSecs = cfg.minutes * 60;
    }
    if (!questions.length) return;
    askCache.clear();
    submitted = false;
    result = null;
    reviewFilter = 'all';
    resume = null;
    phase = 'exam';
    render();
    if (mode === 'exam') { startTimer(); saveProgress(); }
  }

  function renderExam() {
    shell.replaceChildren();

    const top = el('div', 'exam-top');
    top.appendChild(el('span', 'exam-top-id',
      mode === 'exam' ? t('GACAR Mock Exam', 'اختبار GACAR المحاكي') : t('Practice', 'تدريب حر')));
    if (mode === 'exam') {
      const timer = el('span', 'exam-timer', core.fmtTime(timerSecs));
      timer.id = 'exam-timer';
      top.appendChild(timer);
    } else {
      const prog = el('span', 'exam-top-count');
      prog.id = 'exam-top-count';
      top.appendChild(prog);
    }
    shell.appendChild(top);

    const prog = el('div', 'exam-progress');
    const bar = el('div', 'exam-progress-bar');
    bar.id = 'exam-progress-bar';
    prog.appendChild(bar);
    shell.appendChild(prog);

    const palette = el('div', 'exam-palette');
    palette.id = 'exam-palette';
    palette.setAttribute('role', 'group');
    palette.setAttribute('aria-label', t('Question navigator', 'متصفح الأسئلة'));
    shell.appendChild(palette);

    const body = el('div', 'exam-body');
    body.id = 'exam-body';
    shell.appendChild(body);

    const nav = el('div', 'exam-nav');
    nav.id = 'exam-nav';
    shell.appendChild(nav);

    if (mode === 'exam') refreshTimerDisplay();
    renderQuestion();
  }

  function answeredCount() { return Object.keys(answers).length; }

  function refreshHud() {
    const bar = document.getElementById('exam-progress-bar');
    if (bar) bar.style.width = (answeredCount() / questions.length * 100) + '%';
    const count = document.getElementById('exam-top-count');
    if (count) count.textContent = t(
      `${answeredCount()} / ${questions.length} answered`,
      `أجبت ${answeredCount()} / ${questions.length}`);
  }

  function renderPalette() {
    const palette = document.getElementById('exam-palette');
    if (!palette) return;
    palette.replaceChildren();
    questions.forEach((q, i) => {
      const b = button(
        'exam-cell'
          + (i === current ? ' current' : '')
          + (answers[i] != null ? ' answered' : '')
          + (flagged.has(i) ? ' flagged' : ''),
        i + 1,
        () => { current = i; renderQuestion(true); });
      b.setAttribute('aria-label', t(`Question ${i + 1}`, `سؤال ${i + 1}`)
        + (answers[i] != null ? t(', answered', '، مُجاب') : '')
        + (flagged.has(i) ? t(', flagged', '، معلَّم') : ''));
      if (i === current) b.setAttribute('aria-current', 'true');
      palette.appendChild(b);
    });
  }

  function renderQuestion(focusQ) {
    const body = document.getElementById('exam-body');
    const nav = document.getElementById('exam-nav');
    if (!body || !nav) return;

    const q = questions[current];
    const chosen = answers[current];
    const revealed = mode === 'practice' && chosen != null;

    refreshHud();
    renderPalette();

    body.replaceChildren();
    const meta = el('p', 'exam-meta',
      t(`Q ${current + 1} / ${questions.length}`, `سؤال ${current + 1} / ${questions.length}`)
      + ' · ' + (isAr() ? (q.topicTitleAr || q.topicTitle) : q.topicTitle)
      + (flagged.has(current) ? (isAr() ? ' · ⚑ معلَّم' : ' · ⚑ flagged') : ''));
    body.appendChild(meta);

    const qEl = el('p', 'exam-q', q.q);
    qEl.tabIndex = -1;
    body.appendChild(qEl);

    const opts = el('div', 'exam-options');
    q.options.forEach((opt, i) => {
      const btn = el('button', 'exam-opt');
      btn.type = 'button';
      if (chosen === i) btn.classList.add('selected');
      if (revealed) {
        if (i === q.answer) btn.classList.add('correct');
        else if (chosen === i) btn.classList.add('wrong');
        btn.disabled = i !== q.answer && chosen !== i;
      }
      btn.appendChild(el('span', 'opt-key', core.letterOf(i)));
      btn.appendChild(el('span', null, opt));
      if (!revealed) btn.addEventListener('click', () => selectOption(i));
      opts.appendChild(btn);
    });
    body.appendChild(opts);

    /* practice: instant explanation + Captain Adel, right under the options */
    const explain = el('div', 'exam-explain' + (revealed ? ' visible' : ''));
    if (revealed && q.explain) {
      explain.textContent = q.explain;
      if (q.cite) explain.appendChild(el('span', 'exam-cite', q.cite));
      explain.appendChild(askAdelBlock(current, q));
    }
    body.appendChild(explain);

    if (focusQ === true) qEl.focus({ preventScroll: false });

    /* nav */
    nav.replaceChildren();
    const left = el('div', 'exam-nav-left');
    const flagBtn = button('exam-nav-flag' + (flagged.has(current) ? ' flagged' : ''),
      flagged.has(current) ? t('⚑ Flagged', '⚑ معلَّم') : t('⚐ Flag', '⚐ علّم'),
      () => {
        if (flagged.has(current)) flagged.delete(current); else flagged.add(current);
        saveProgress();
        renderQuestion();
      });
    flagBtn.setAttribute('aria-pressed', flagged.has(current) ? 'true' : 'false');
    left.appendChild(flagBtn);
    if (mode === 'exam') {
      left.appendChild(button('exam-finish-link', t('Review & submit', 'المراجعة والتسليم'), () => {
        phase = 'review'; render();
      }));
    } else {
      left.appendChild(button('exam-finish-link', t('End practice', 'إنهاء التدريب'), () => submitExam(false)));
    }
    nav.appendChild(left);

    const right = el('div', 'exam-nav-right');
    if (current > 0) {
      right.appendChild(button('btn btn-ghost', t('← Prev', '→ السابق'), () => move(-1)));
    }
    const isLast = current === questions.length - 1;
    if (mode === 'exam' && isLast) {
      right.appendChild(button('btn btn-primary', t('Review & submit →', 'المراجعة والتسليم ←'), () => {
        phase = 'review'; render();
      }));
    } else if (!isLast) {
      right.appendChild(button('btn btn-primary', t('Next →', 'التالي ←'), () => move(1)));
    } else {
      right.appendChild(button('btn btn-primary', t('Finish →', 'إنهاء ←'), () => submitExam(false)));
    }
    nav.appendChild(right);
  }

  function selectOption(i) {
    if (mode === 'practice' && answers[current] != null) return;
    answers[current] = i;
    saveProgress();
    renderQuestion();
  }

  function move(step) {
    const next = current + step;
    if (next < 0 || next >= questions.length) return;
    current = next;
    saveProgress();
    renderQuestion(true);
  }

  /* ---- keyboard (exam screens only) ---- */
  document.addEventListener('keydown', (e) => {
    if (phase !== 'exam') return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const tag = e.target && e.target.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    const k = e.key.toLowerCase();
    const letters = { a: 0, b: 1, c: 2, d: 3, 1: 0, 2: 1, 3: 2, 4: 3 };
    if (k in letters) {
      const q = questions[current];
      if (letters[k] < q.options.length) { e.preventDefault(); selectOption(letters[k]); }
      return;
    }
    /* physical arrows follow reading direction */
    const fwd = isAr() ? 'arrowleft' : 'arrowright';
    const back = isAr() ? 'arrowright' : 'arrowleft';
    if (k === fwd) { e.preventDefault(); move(1); }
    else if (k === back) { e.preventDefault(); move(-1); }
    else if (k === 'f') { e.preventDefault();
      if (flagged.has(current)) flagged.delete(current); else flagged.add(current);
      saveProgress(); renderQuestion();
    }
  });

  /* ---- timer ---- */
  function refreshTimerDisplay() {
    const elT = document.getElementById('exam-timer');
    if (!elT) return;
    elT.textContent = core.fmtTime(timerSecs);
    elT.className = 'exam-timer' + (timerSecs <= 60 ? ' urgent' : timerSecs <= 300 ? ' warn' : '');
  }
  function startTimer() {
    clearInterval(timerId);
    timerId = setInterval(() => {
      if (submitted) { clearInterval(timerId); return; }
      timerSecs--;
      refreshTimerDisplay();
      if (timerSecs === 300) announce(t('5 minutes remaining', 'باقي خمس دقائق'));
      if (timerSecs === 60) announce(t('One minute remaining', 'باقي دقيقة واحدة'));
      if (timerSecs % 15 === 0) saveProgress();
      if (timerSecs <= 0) { clearInterval(timerId); submitExam(true); }
    }, 1000);
  }

  /* keep the sitting if the tab is backgrounded or closed mid-exam */
  window.addEventListener('pagehide', saveProgress);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') saveProgress();
  });

  /* ============================== review ============================== */
  function renderReview() {
    shell.replaceChildren();
    const div = el('div', 'exam-start');
    div.appendChild(el('h2', null, t('Ready to submit?', 'جاهز للتسليم؟')));

    const sum = core.examSummary(questions.length, answers, flagged);
    const stats = el('div', 'exam-stats');
    stats.appendChild(statBox(sum.answered, t('Answered', 'مُجاب')));
    stats.appendChild(statBox(sum.unanswered.length, t('Unanswered', 'بلا إجابة')));
    stats.appendChild(statBox(sum.flagged.length, t('Flagged', 'معلَّم')));
    div.appendChild(stats);

    const jumpList = (idxs, labelEn, labelAr, cls) => {
      if (!idxs.length) return;
      div.appendChild(el('p', 'exam-picker-label', t(labelEn, labelAr)));
      const chips = el('div', 'exam-chips center');
      for (const i of idxs) {
        chips.appendChild(button('exam-chip ' + cls, i + 1, () => {
          current = i; phase = 'exam'; render();
        }));
      }
      div.appendChild(chips);
    };
    jumpList(sum.unanswered, 'Jump to an unanswered question', 'انتقل إلى سؤال بلا إجابة', 'gap');
    jumpList(sum.flagged, 'Jump to a flagged question', 'انتقل إلى سؤال معلَّم', 'flag');

    if (sum.unanswered.length) {
      div.appendChild(el('p', 'exam-review-note', t(
        'Unanswered questions count as wrong.',
        'الأسئلة غير المُجابة تُحسب خاطئة.')));
    }

    const row = el('div', 'exam-resume-actions');
    row.appendChild(button('btn btn-ghost', t('← Back to exam', '→ عودة إلى الاختبار'), () => {
      phase = 'exam'; render();
    }));
    row.appendChild(button('btn btn-primary', t('Submit exam', 'سلّم الاختبار'), () => submitExam(false)));
    div.appendChild(row);

    shell.appendChild(div);
  }

  /* ============================== result ============================== */
  function submitExam(timedOut) {
    if (submitted) return;
    submitted = true;
    clearInterval(timerId);
    clearProgress();
    const s = core.scoreExam(questions, answers, cfg.passMark);
    result = Object.assign(s, {
      timedOut: timedOut === true,
      byTopic: core.topicBreakdown(questions, answers),
    });
    phase = 'result';
    render();
  }

  function renderResult() {
    if (!result) return;
    const { correct, total, pct, pass, timedOut } = result;
    shell.replaceChildren();

    const div = el('div', 'exam-result');
    div.appendChild(el('h2', null,
      timedOut ? t('Time is up!', 'انتهى الوقت!')
        : mode === 'practice' ? t('Practice complete', 'اكتمل التدريب')
          : t('Exam complete', 'اكتمل الاختبار')));

    if (mode === 'exam') {
      div.appendChild(el('p', 'exam-verdict ' + (pass ? 'pass' : 'fail'),
        pass ? t('✓ Pass', '✓ ناجح') : t('✗ Did not pass', '✗ لم تجتز')));
    }

    div.appendChild(el('p', null, t(
      `You answered ${correct} of ${total} correctly (${pct}%). `
        + (mode === 'practice' ? 'Review below, and ask Captain Adel about anything unclear.'
          : pass ? 'Well done, Captain.' : `You need ${cfg.passMark}% to pass. Keep drilling!`),
      `أجبت ${correct} من ${total} إجابة صحيحة (${pct}%). `
        + (mode === 'practice' ? 'راجع الأسئلة أدناه، واسأل كابتن عادل عن أي نقطة غير واضحة.'
          : pass ? 'أحسنت يا كابتن.' : `تحتاج ${cfg.passMark}% للنجاح. واصل التدرّب!`))));

    const stats = el('div', 'exam-stats');
    stats.appendChild(statBox(correct, t('Correct', 'صحيح')));
    stats.appendChild(statBox(total - correct, t('Wrong', 'خطأ')));
    stats.appendChild(statBox(pct + '%', t('Score', 'الدرجة')));
    div.appendChild(stats);

    /* actions: retake + debrief with the Captain */
    const actions = el('div', 'exam-resume-actions');
    actions.appendChild(button('btn btn-primary',
      mode === 'exam' ? t('Retake exam', 'أعد الاختبار') : t('Practice again', 'تدرّب مجدّداً'),
      () => startExam(null)));
    actions.appendChild(button('btn btn-ghost', t('Change mode', 'غيّر الوضع'), () => {
      phase = 'start'; render();
    }));
    const debrief = el('a', 'btn btn-ghost');
    debrief.textContent = t('Debrief with Captain Adel ↗', 'راجع النتيجة مع كابتن عادل ↗');
    debrief.href = 'chat.html?q=' + encodeURIComponent(
      core.buildDebriefPrompt(questions, answers, cfg.passMark, lang()));
    actions.appendChild(debrief);
    div.appendChild(actions);

    /* weakest-first topic breakdown */
    if (result.byTopic.length > 1) {
      const h3 = el('h3', 'exam-section-h', t('By topic — weakest first', 'حسب الموضوع — الأضعف أولاً'));
      div.appendChild(h3);
      const bars = el('div', 'exam-topicbars');
      for (const row of result.byTopic) {
        const r = el('div', 'tb-row');
        r.appendChild(el('span', 'tb-label', isAr() ? row.titleAr : row.title));
        const bar = el('div', 'tb-bar');
        const fill = el('div', 'tb-fill' + (row.pct >= cfg.passMark ? ' ok' : ''));
        fill.style.width = row.pct + '%';
        bar.appendChild(fill);
        r.appendChild(bar);
        r.appendChild(el('span', 'tb-pct', `${row.correct}/${row.total}`));
        bars.appendChild(r);
      }
      div.appendChild(bars);
    }

    /* review with filters */
    div.appendChild(el('h3', 'exam-section-h', t('Review', 'المراجعة')));
    const filters = el('div', 'exam-chips center');
    const mkFilter = (key, en, ar) => {
      const chip = button('exam-chip' + (reviewFilter === key ? ' on' : ''), t(en, ar), () => {
        reviewFilter = key; renderResult();
      });
      chip.setAttribute('aria-pressed', reviewFilter === key ? 'true' : 'false');
      filters.appendChild(chip);
    };
    mkFilter('all', 'All', 'الكل');
    mkFilter('wrong', 'Wrong & skipped', 'الأخطاء والمتروك');
    if (flagged.size) mkFilter('flagged', 'Flagged', 'المعلَّمة');
    div.appendChild(filters);

    const reviewList = el('div', 'exam-review-list');
    let shown = 0;
    questions.forEach((q, i) => {
      const isCorrect = answers[i] === q.answer;
      if (reviewFilter === 'wrong' && isCorrect) return;
      if (reviewFilter === 'flagged' && !flagged.has(i)) return;
      shown++;

      const item = el('div', 'review-item ' + (isCorrect ? 'correct' : 'wrong'));
      item.appendChild(el('p', 'review-q',
        `${i + 1}. ${q.q}` + (flagged.has(i) ? ' ⚑' : '')));

      const ansEl = el('p', 'review-ans');
      ansEl.appendChild(document.createTextNode(t('Correct: ', 'الصحيح: ')));
      ansEl.appendChild(el('strong', null, `${core.letterOf(q.answer)}. ${q.options[q.answer]}`));
      item.appendChild(ansEl);

      if (!isCorrect && answers[i] != null) {
        item.appendChild(el('p', 'review-wrong-ans',
          t(`Your answer: ${core.letterOf(answers[i])}. ${q.options[answers[i]]}`,
            `إجابتك: ${core.letterOf(answers[i])}. ${q.options[answers[i]]}`)));
      } else if (answers[i] == null) {
        item.appendChild(el('p', 'review-wrong-ans', t('Not answered', 'لم تُجب')));
      }

      if (q.explain) {
        const exp = el('div', 'review-explain', q.explain);
        if (q.cite) exp.appendChild(el('p', 'review-cite', q.cite));
        item.appendChild(exp);
      }
      item.appendChild(askAdelBlock(i, q));
      reviewList.appendChild(item);
    });
    if (!shown) reviewList.appendChild(el('p', 'exam-review-note',
      t('Nothing here — switch the filter above.', 'لا شيء هنا — بدّل عامل التصفية أعلاه.')));
    div.appendChild(reviewList);

    shell.appendChild(div);
  }

  /* ====================== Ask Captain Adel panel ====================== */
  /* One block per question: the button plus (once asked) the streamed,
     grounded answer. Cached per question index for the page's lifetime so a
     re-render — filter flip, language toggle — never re-spends the quota. */
  function askAdelBlock(i, q) {
    const wrap = el('div', 'ask-adel');
    const cached = askCache.get(i);
    const btn = button('ask-adel-btn',
      cached && cached.status === 'done'
        ? t('Captain Adel’s explanation', 'شرح كابتن عادل')
        : t('Ask Captain Adel', 'اسأل كابتن عادل'), null);
    btn.disabled = !chat;
    const panel = el('div', 'ask-panel');
    panel.hidden = true;
    wrap.appendChild(btn);
    wrap.appendChild(panel);

    if (cached && cached.status === 'done') {
      fillAskPanel(panel, cached);
      panel.hidden = false;
      btn.setAttribute('aria-expanded', 'true');
      btn.addEventListener('click', () => {
        panel.hidden = !panel.hidden;
        btn.setAttribute('aria-expanded', panel.hidden ? 'false' : 'true');
      });
    } else {
      btn.setAttribute('aria-expanded', 'false');
      btn.addEventListener('click', () => streamAsk(i, q, btn, panel));
    }
    return wrap;
  }

  function askErrorText(code) {
    if (code === 'rate_limited') return chat.rateLimitedText();
    if (code === 'quota_exceeded') {
      return t('**You’ve used your free questions for now.** The allowance resets later — '
          + 'or go Pro from your [account](account.html).',
        '**استهلكت أسئلتك المجانية حالياً.** يتجدّد الرصيد لاحقاً — '
          + 'أو انتقل إلى الباقة الاحترافية من [حسابك](account.html).');
    }
    return chat.errorText();
  }

  function streamAsk(i, q, btn, panel) {
    if (askCache.get(i) && askCache.get(i).status === 'pending') return;
    const prompt = core.buildAskPrompt(q, answers[i], lang());
    askCache.set(i, { status: 'pending' });
    btn.disabled = true;
    btn.textContent = t('Captain Adel is thinking…', 'كابتن عادل يفكّر…');
    btn.setAttribute('aria-expanded', 'true');
    panel.hidden = false;
    panel.replaceChildren();
    const prose = el('div', 'ask-prose streaming');
    panel.appendChild(prose);

    (async () => {
      const res = await chat.postChat(ENDPOINT,
        { message: prompt, history: [], session: chat.sessionId(), provider: 'auto' }, {});
      let answer = '';
      let final = null;
      for await (const ev of chat.sseEvents(res)) {
        if (ev.type === 'token') { answer += ev.delta; prose.innerHTML = chat.md(answer); }
        else if (ev.type === 'reset') { answer = ''; prose.innerHTML = ''; }
        else if (ev.type === 'final') { final = ev; answer = ev.answer != null ? ev.answer : answer; }
        else if (ev.type === 'error') throw new Error('backend');
      }
      const entry = { status: 'done', answer, data: final, prompt };
      askCache.set(i, entry);
      fillAskPanel(panel, entry);
      btn.disabled = false;
      btn.textContent = t('Captain Adel’s explanation', 'شرح كابتن عادل');
      const reveal = () => {
        panel.hidden = !panel.hidden;
        btn.setAttribute('aria-expanded', panel.hidden ? 'false' : 'true');
      };
      btn.addEventListener('click', reveal);
    })().catch((err) => {
      askCache.delete(i);
      panel.replaceChildren();
      const msg = el('div', 'ask-prose');
      msg.innerHTML = chat.md(askErrorText(err && err.message));
      panel.appendChild(msg);
      btn.disabled = false;
      btn.textContent = t('Try again', 'حاول مجدّداً');
      btn.addEventListener('click', () => streamAsk(i, q, btn, panel), { once: true });
    });
  }

  /* Final render of a completed panel: badge, answer, compact sources, and a
     handoff link that reopens the same prompt in the full chat. */
  function fillAskPanel(panel, entry) {
    panel.replaceChildren();
    const head = el('div', 'ask-head');
    const img = el('img');
    img.src = AVATAR; img.alt = ''; img.width = 26; img.height = 26;
    head.appendChild(img);
    head.appendChild(el('span', 'ask-name', t('Captain Adel', 'كابتن عادل')));
    panel.appendChild(head);

    if (entry.data && entry.data.kind) {
      const badge = el('div');
      badge.innerHTML = chat.badgeHtml(entry.data);
      if (badge.firstChild) panel.appendChild(badge.firstChild);
    }

    const prose = el('div', 'ask-prose');
    prose.innerHTML = chat.md(entry.answer || '');
    panel.appendChild(prose);

    const sources = entry.data && entry.data.sources;
    if (sources && sources.length) {
      const src = el('div', 'ask-sources');
      src.appendChild(el('span', 'src-label', t('Sources', 'المصدر')));
      for (const s of sources.slice(0, 4)) {
        const cite = s.citation || s.url || '';
        if (!cite) continue;
        if (s.url) {
          const a = el('a', 'ask-src', cite);
          a.href = chat.safeUrl(s.url);
          a.target = '_blank';
          a.rel = 'noopener nofollow ugc';
          src.appendChild(a);
        } else {
          src.appendChild(el('span', 'ask-src', cite));
        }
      }
      panel.appendChild(src);
    }

    if (entry.prompt) {
      const cont = el('a', 'ask-continue');
      cont.textContent = t('Continue in chat ↗', 'تابع في المحادثة ↗');
      cont.href = 'chat.html?q=' + encodeURIComponent(entry.prompt);
      panel.appendChild(cont);
    }
  }

  /* Re-render the current screen when the language toggles (keeps state). */
  document.addEventListener('captadel:langchange', render);

  loadQuestions();
})();
