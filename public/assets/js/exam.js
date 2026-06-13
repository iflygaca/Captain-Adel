/* Captain Adel — GACAR timed mock exam. Vanilla ES2022; no framework.
   Loads assets/data/quiz.json, picks TOTAL_Q random questions from every bank,
   runs a 30-minute countdown, and shows a reviewed result card. UI chrome is
   bilingual (Arabic-first, mirrors i18n.js); questions stay in their authored
   language. Re-renders the current screen on a captadel:langchange event.
   Pure DOM — textContent / createTextNode / replaceChildren only, no innerHTML. */
(() => {
  'use strict';

  const TOTAL_Q  = 25;
  const MINUTES  = 30;
  const PASS_PCT = 75;
  const QUIZ_URL = 'assets/data/quiz.json';
  const KEYS     = ['A', 'B', 'C', 'D'];

  const shell = document.getElementById('exam-shell');
  if (!shell) return;

  const isAr = () => document.documentElement.lang !== 'en';
  const t = (en, ar) => (isAr() ? ar : en);
  function setText(el, text) { el.textContent = String(text); }

  /* ---- state ---- */
  let questions = [];
  let current   = 0;
  let answers   = {};
  let flagged   = new Set();
  let timerSecs = MINUTES * 60;
  let timerId   = null;
  let submitted = false;
  let phase     = 'loading';   // loading | start | exam | result
  let result    = null;        // { correct, pct, pass, timedOut }

  /* ---- load + shuffle ---- */
  async function loadQuestions() {
    try {
      const res = await fetch(QUIZ_URL);
      if (!res.ok) throw new Error('fetch');
      const data = await res.json();
      const all = (data.banks || []).flatMap((b) => b.questions || []);
      if (!all.length) throw new Error('empty');
      for (let i = all.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [all[i], all[j]] = [all[j], all[i]];
      }
      questions = all.slice(0, Math.min(TOTAL_Q, all.length));
      phase = 'start';
      render();
    } catch (_) {
      phase = 'error';
      render();
    }
  }

  /* ---- render dispatcher (so a language toggle can re-draw) ---- */
  function render() {
    if (phase === 'start')  return renderStart();
    if (phase === 'exam')   return renderExam();
    if (phase === 'result') return renderResult();
    if (phase === 'error')  return renderError();
  }

  function renderError() {
    shell.replaceChildren();
    const d = document.createElement('div');
    d.className = 'exam-start';
    const h = document.createElement('h2');
    setText(h, t('Could not load questions', 'تعذّر تحميل الأسئلة'));
    const p = document.createElement('p');
    setText(p, t('The question bank could not be fetched. Please refresh and try again.',
      'تعذّر جلب بنك الأسئلة. حدّث الصفحة وحاول مجدّداً.'));
    d.appendChild(h);
    d.appendChild(p);
    shell.appendChild(d);
  }

  /* ---- start screen ---- */
  function renderStart() {
    shell.replaceChildren();
    const div = document.createElement('div');
    div.className = 'exam-start';

    const img = document.createElement('img');
    img.src = 'assets/img/captain/avatar.png';
    img.alt = '';
    img.width = 80; img.height = 80;
    img.style.cssText = 'border-radius:50%;box-shadow:0 0 24px rgba(74,156,184,.18);margin-bottom:16px';

    const h2 = document.createElement('h2');
    setText(h2, t('GACAR Knowledge Mock Exam', 'اختبار GACAR التجريبي'));

    const p = document.createElement('p');
    setText(p, t(
      `${questions.length} questions · ${MINUTES} minutes · ${PASS_PCT}% to pass. `
        + 'Questions are drawn from the GACAR library. Every answer cites its source.',
      `${questions.length} سؤالاً · ${MINUTES} دقيقة · ${PASS_PCT}% للنجاح. `
        + 'الأسئلة مأخوذة من مكتبة لوائح GACAR، وكل إجابة تستشهد بمصدرها.'));

    const stats = document.createElement('div');
    stats.className = 'exam-stats';
    const statData = [
      [questions.length, t('Questions', 'سؤال')],
      [MINUTES + (isAr() ? ' د' : ' min'), t('Time limit', 'المدة')],
      [PASS_PCT + '%', t('Pass mark', 'حد النجاح')],
    ];
    for (const [n, l] of statData) stats.appendChild(statBox(n, l));

    const btn = document.createElement('button');
    btn.className = 'btn btn-primary';
    btn.style.cssText = 'font-size:16px;padding:14px 32px;cursor:pointer';
    setText(btn, t('Start exam', 'ابدأ الاختبار'));
    btn.addEventListener('click', startExam);

    div.appendChild(img);
    div.appendChild(h2);
    div.appendChild(p);
    div.appendChild(stats);
    div.appendChild(btn);
    shell.appendChild(div);
  }

  function statBox(n, l) {
    const s = document.createElement('div');
    s.className = 'exam-stat';
    const sn = document.createElement('span');
    sn.className = 'exam-stat-n';
    setText(sn, n);
    const sl = document.createElement('span');
    sl.className = 'exam-stat-l';
    setText(sl, l);
    s.appendChild(sn);
    s.appendChild(sl);
    return s;
  }

  function startExam() {
    current   = 0;
    answers   = {};
    flagged   = new Set();
    timerSecs = MINUTES * 60;
    submitted = false;
    phase     = 'exam';
    renderExam();
    startTimer();
  }

  /* ---- exam frame + question ---- */
  function renderExam() {
    shell.replaceChildren();

    const top = document.createElement('div');
    top.className = 'exam-top';
    const id = document.createElement('span');
    id.className = 'exam-top-id';
    setText(id, t('GACAR Mock Exam', 'اختبار GACAR التجريبي'));
    const timer = document.createElement('span');
    timer.className = 'exam-timer';
    timer.id = 'exam-timer';
    setText(timer, fmtTime(timerSecs));
    top.appendChild(id);
    top.appendChild(timer);

    const prog = document.createElement('div');
    prog.className = 'exam-progress';
    const bar = document.createElement('div');
    bar.className = 'exam-progress-bar';
    bar.id = 'exam-progress-bar';
    bar.style.width = '0%';
    prog.appendChild(bar);

    const body = document.createElement('div');
    body.className = 'exam-body';
    body.id = 'exam-body';

    const nav = document.createElement('div');
    nav.className = 'exam-nav';
    nav.id = 'exam-nav';

    shell.appendChild(top);
    shell.appendChild(prog);
    shell.appendChild(body);
    shell.appendChild(nav);
    refreshTimerDisplay();
    renderQuestion();
  }

  function renderQuestion() {
    const body = document.getElementById('exam-body');
    const nav  = document.getElementById('exam-nav');
    const bar  = document.getElementById('exam-progress-bar');
    if (!body || !nav) return;

    const q = questions[current];
    const answered = answers[current] != null;

    bar.style.width = ((current + 1) / questions.length * 100) + '%';

    body.replaceChildren();
    const meta = document.createElement('p');
    meta.className = 'exam-meta';
    setText(meta, t(`Q ${current + 1} / ${questions.length}`, `سؤال ${current + 1} / ${questions.length}`)
      + (flagged.has(current) ? (isAr() ? ' · ⚑ معلّم' : ' · ⚑ flagged') : ''));

    const qEl = document.createElement('p');
    qEl.className = 'exam-q';
    setText(qEl, q.q);

    const opts = document.createElement('div');
    opts.className = 'exam-options';
    (q.options || []).forEach((opt, i) => {
      const btn = document.createElement('button');
      btn.className = 'exam-opt';
      btn.type = 'button';
      if (answers[current] === i) btn.classList.add('selected');
      if (answered) {
        if (i === q.answer) btn.classList.add('correct');
        else if (answers[current] === i) btn.classList.add('wrong');
      }
      const key = document.createElement('span');
      key.className = 'opt-key';
      setText(key, KEYS[i] || String(i + 1));
      const label = document.createElement('span');
      setText(label, opt);
      btn.appendChild(key);
      btn.appendChild(label);
      if (!answered) {
        btn.addEventListener('click', () => { answers[current] = i; renderQuestion(); });
      }
      opts.appendChild(btn);
    });

    const explain = document.createElement('div');
    explain.className = 'exam-explain' + (answered ? ' visible' : '');
    if (answered && q.explain) {
      setText(explain, q.explain);
      if (q.cite) {
        const cite = document.createElement('span');
        cite.className = 'exam-cite';
        setText(cite, q.cite);
        explain.appendChild(cite);
      }
    }

    body.appendChild(meta);
    body.appendChild(qEl);
    body.appendChild(opts);
    body.appendChild(explain);

    nav.replaceChildren();
    const flagBtn = document.createElement('button');
    flagBtn.className = 'exam-nav-flag' + (flagged.has(current) ? ' flagged' : '');
    flagBtn.type = 'button';
    setText(flagBtn, flagged.has(current) ? t('⚑ Flagged', '⚑ معلّم') : t('⚐ Flag', '⚐ علّم'));
    flagBtn.addEventListener('click', () => {
      if (flagged.has(current)) flagged.delete(current); else flagged.add(current);
      renderQuestion();
    });

    const navRight = document.createElement('div');
    navRight.style.cssText = 'display:flex;gap:10px;align-items:center';

    if (current > 0) {
      const prev = document.createElement('button');
      prev.className = 'btn btn-ghost';
      prev.type = 'button';
      setText(prev, t('← Prev', '→ السابق'));
      prev.addEventListener('click', () => { current--; renderQuestion(); });
      navRight.appendChild(prev);
    }

    const isLast = current === questions.length - 1;
    const next = document.createElement('button');
    next.type = 'button';
    next.className = 'btn btn-primary';
    if (isLast) {
      setText(next, t('Submit exam →', 'سلّم الاختبار ←'));
      next.addEventListener('click', () => submitExam(false));
    } else {
      setText(next, t('Next →', 'التالي ←'));
      next.addEventListener('click', () => { current++; renderQuestion(); });
    }
    navRight.appendChild(next);

    nav.appendChild(flagBtn);
    nav.appendChild(navRight);
  }

  /* ---- timer ---- */
  function fmtTime(secs) {
    const m = Math.floor(secs / 60).toString().padStart(2, '0');
    const s = (secs % 60).toString().padStart(2, '0');
    return m + ':' + s;
  }
  function refreshTimerDisplay() {
    const el = document.getElementById('exam-timer');
    if (!el) return;
    setText(el, fmtTime(Math.max(0, timerSecs)));
    el.className = 'exam-timer' + (timerSecs <= 60 ? ' urgent' : timerSecs <= 300 ? ' warn' : '');
  }
  function startTimer() {
    clearInterval(timerId);
    timerId = setInterval(() => {
      if (submitted) { clearInterval(timerId); return; }
      timerSecs--;
      refreshTimerDisplay();
      if (timerSecs <= 0) { clearInterval(timerId); submitExam(true); }
    }, 1000);
  }

  /* ---- submit + result ---- */
  function submitExam(timedOut) {
    if (submitted) return;
    submitted = true;
    clearInterval(timerId);
    let correct = 0;
    for (let i = 0; i < questions.length; i++) {
      if (answers[i] === questions[i].answer) correct++;
    }
    const pct = Math.round((correct / questions.length) * 100);
    result = { correct, pct, pass: pct >= PASS_PCT, timedOut: timedOut === true };
    phase = 'result';
    renderResult();
  }

  function renderResult() {
    if (!result) return;
    const { correct, pct, pass, timedOut } = result;
    shell.replaceChildren();

    const div = document.createElement('div');
    div.className = 'exam-result';

    const h2 = document.createElement('h2');
    setText(h2, timedOut ? t('Time is up!', 'انتهى الوقت!') : t('Exam complete', 'اكتمل الاختبار'));

    const verdict = document.createElement('p');
    verdict.className = 'exam-verdict ' + (pass ? 'pass' : 'fail');
    setText(verdict, pass ? t('✓ Pass', '✓ ناجح') : t('✗ Did not pass', '✗ لم تجتز'));

    const sub = document.createElement('p');
    setText(sub, t(
      `You answered ${correct} of ${questions.length} correctly (${pct}%). `
        + (pass ? 'Well done, Captain.' : `You need ${PASS_PCT}% to pass. Keep drilling!`),
      `أجبت ${correct} من ${questions.length} بشكل صحيح (${pct}%). `
        + (pass ? 'أحسنت يا كابتن.' : `تحتاج ${PASS_PCT}% للنجاح. واصل التدرّب!`)));

    const stats = document.createElement('div');
    stats.className = 'exam-stats';
    stats.appendChild(statBox(correct, t('Correct', 'صحيح')));
    stats.appendChild(statBox(questions.length - correct, t('Wrong', 'خطأ')));
    stats.appendChild(statBox(pct + '%', t('Score', 'الدرجة')));

    const retake = document.createElement('button');
    retake.className = 'btn btn-primary';
    retake.style.cssText = 'font-size:15px;padding:12px 28px;cursor:pointer';
    setText(retake, t('Retake exam', 'أعد الاختبار'));
    retake.addEventListener('click', startExam);

    const reviewHeading = document.createElement('h3');
    reviewHeading.style.cssText = 'text-align:start;margin:28px 0 10px;font-size:16px';
    setText(reviewHeading, t('Review', 'المراجعة'));

    const reviewList = document.createElement('div');
    reviewList.className = 'exam-review-list';

    questions.forEach((q, i) => {
      const item = document.createElement('div');
      const isCorrect = answers[i] === q.answer;
      item.className = 'review-item ' + (isCorrect ? 'correct' : 'wrong');

      const qEl = document.createElement('p');
      qEl.className = 'review-q';
      setText(qEl, `${i + 1}. ${q.q}`);

      const ansEl = document.createElement('p');
      ansEl.className = 'review-ans';
      const strongEl = document.createElement('strong');
      setText(strongEl, `${KEYS[q.answer]}. ${q.options[q.answer]}`);
      ansEl.appendChild(document.createTextNode(t('Correct: ', 'الصحيح: ')));
      ansEl.appendChild(strongEl);

      item.appendChild(qEl);
      item.appendChild(ansEl);

      if (!isCorrect && answers[i] != null) {
        const wrongEl = document.createElement('p');
        wrongEl.className = 'review-wrong-ans';
        setText(wrongEl, t(`Your answer: ${KEYS[answers[i]]}. ${q.options[answers[i]]}`,
          `إجابتك: ${KEYS[answers[i]]}. ${q.options[answers[i]]}`));
        item.appendChild(wrongEl);
      } else if (answers[i] == null) {
        const skip = document.createElement('p');
        skip.className = 'review-wrong-ans';
        setText(skip, t('Not answered', 'لم تُجب'));
        item.appendChild(skip);
      }

      if (q.explain) {
        const exp = document.createElement('div');
        exp.className = 'review-explain';
        setText(exp, q.explain);
        if (q.cite) {
          const cite = document.createElement('p');
          cite.className = 'review-cite';
          setText(cite, q.cite);
          exp.appendChild(cite);
        }
        item.appendChild(exp);
      }
      reviewList.appendChild(item);
    });

    div.appendChild(h2);
    div.appendChild(verdict);
    div.appendChild(sub);
    div.appendChild(stats);
    div.appendChild(retake);
    div.appendChild(reviewHeading);
    div.appendChild(reviewList);
    shell.appendChild(div);
  }

  /* Re-render the current screen when the language toggles (keeps state). */
  document.addEventListener('captadel:langchange', () => {
    if (phase === 'exam') { renderExam(); } else { render(); }
  });

  loadQuestions();
})();
