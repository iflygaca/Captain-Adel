/* Captain Adel — exam engine core. Vanilla ES2022, classic script.
   The DOM-free half of the mock exam: question selection (bank filtering,
   Fisher-Yates shuffles with an injectable rng so tests are deterministic),
   scoring, the per-topic breakdown, progress-snapshot validation for the
   resume feature, and the prompt builders that hand a question — or a whole
   result — to Captain Adel (/v1/chat or chat.html?q=).

   Load with `defer` BEFORE exam.js — it reads window.AdelExamCore. The
   module.exports branch exists solely so test/exam-core.test.js can load the
   same file under node:test (mirrors chat-core.js). */
(() => {
  'use strict';

  const LETTERS = ['A', 'B', 'C', 'D'];
  const SNAPSHOT_V = 1;
  const MAX_PROMPT_CHARS = 1800;   // well under the brain's 4000-char message cap

  /* ---- quiz data ---- */
  function validQuestion(q) {
    return !!q && typeof q.q === 'string' && q.q.trim() !== ''
      && Array.isArray(q.options) && q.options.length >= 2
      && q.options.every((o) => typeof o === 'string' && o.trim() !== '')
      && Number.isInteger(q.answer) && q.answer >= 0 && q.answer < q.options.length;
  }
  function validQuizData(data) {
    return !!data && Array.isArray(data.banks) && data.banks.length > 0
      && data.banks.every((b) => b && typeof b.id === 'string' && b.id !== ''
        && typeof b.title === 'string'
        && Array.isArray(b.questions) && b.questions.every(validQuestion));
  }
  /* Exam settings live in the data file (single source with the bank); the
     defaults only cover a stale cache of an older quiz.json. */
  function examConfig(data) {
    const e = (data && data.exam) || {};
    return {
      questions: Number.isInteger(e.questions) && e.questions > 0 ? e.questions : 25,
      minutes: Number.isInteger(e.minutes) && e.minutes > 0 ? e.minutes : 30,
      passMark: Number.isInteger(e.passMark) && e.passMark > 0 && e.passMark <= 100 ? e.passMark : 75,
    };
  }

  /* ---- selection ---- */
  function shuffle(arr, rand) {
    const r = rand || Math.random;
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(r() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  /* Re-order a question's options (anti-memorisation) and remap `answer`.
     Returns a new object; the source question is never mutated. */
  function shuffleOptions(q, rand) {
    const order = shuffle(q.options.map((_, i) => i), rand);
    return Object.assign({}, q, {
      options: order.map((i) => q.options[i]),
      answer: order.indexOf(q.answer),
    });
  }

  /* Flatten banks into questions tagged with their topic, optionally keeping
     only the given bank ids. Tags are what the palette, the results breakdown
     and the debrief prompt hang off. */
  function flatten(banks, bankIds) {
    const keep = bankIds && bankIds.length ? new Set(bankIds) : null;
    const out = [];
    for (const b of banks) {
      if (keep && !keep.has(b.id)) continue;
      for (const q of b.questions) {
        out.push(Object.assign({}, q, {
          topicId: b.id, topicTitle: b.title, topicTitleAr: b.titleAr || b.title,
        }));
      }
    }
    return out;
  }

  /* Draw an exam: filter by bank, shuffle the pool, take `count`, and (when
     mixOptions) shuffle each question's options too. */
  function pickQuestions(banks, opts) {
    const o = opts || {};
    const pool = shuffle(flatten(banks, o.bankIds), o.rand);
    const n = Number.isInteger(o.count) && o.count > 0 ? Math.min(o.count, pool.length) : pool.length;
    const picked = pool.slice(0, n);
    return o.mixOptions ? picked.map((q) => shuffleOptions(q, o.rand)) : picked;
  }

  /* ---- scoring ---- */
  function scoreExam(questions, answers, passMark) {
    let correct = 0, answered = 0;
    for (let i = 0; i < questions.length; i++) {
      if (answers[i] == null) continue;
      answered++;
      if (answers[i] === questions[i].answer) correct++;
    }
    const total = questions.length;
    const pct = total ? Math.round((correct / total) * 100) : 0;
    return { correct, answered, total, pct, pass: pct >= passMark };
  }

  /* Per-topic tally, weakest topic first — that ordering IS the study advice. */
  function topicBreakdown(questions, answers) {
    const map = new Map();
    questions.forEach((q, i) => {
      let row = map.get(q.topicId);
      if (!row) {
        row = { id: q.topicId, title: q.topicTitle, titleAr: q.topicTitleAr, correct: 0, total: 0 };
        map.set(q.topicId, row);
      }
      row.total++;
      if (answers[i] === q.answer) row.correct++;
    });
    return [...map.values()]
      .map((r) => Object.assign(r, { pct: Math.round((r.correct / r.total) * 100) }))
      .sort((a, b) => a.pct - b.pct || b.total - a.total);
  }

  function examSummary(total, answers, flagged) {
    const unanswered = [];
    for (let i = 0; i < total; i++) if (answers[i] == null) unanswered.push(i);
    return {
      answered: total - unanswered.length,
      unanswered,
      flagged: [...flagged].sort((a, b) => a - b),
    };
  }

  /* ---- resume snapshots ---- */
  function snapshot(state) {
    return {
      v: SNAPSHOT_V,
      mode: state.mode,
      questions: state.questions,
      answers: state.answers,
      flagged: [...state.flagged],
      timerSecs: state.timerSecs,
      current: state.current,
      savedAt: Date.now(),
    };
  }
  function validSnapshot(s) {
    return !!s && s.v === SNAPSHOT_V
      && (s.mode === 'exam' || s.mode === 'practice')
      && Array.isArray(s.questions) && s.questions.length > 0
      && s.questions.every(validQuestion)
      && s.answers != null && typeof s.answers === 'object'
      && Array.isArray(s.flagged)
      && Number.isInteger(s.timerSecs)
      && Number.isInteger(s.current) && s.current >= 0 && s.current < s.questions.length;
  }

  /* ---- Captain Adel prompts ---- */
  function letterOf(i) { return LETTERS[i] || String(i + 1); }
  function clip(s, n) { s = String(s); return s.length > n ? s.slice(0, n - 1) + '…' : s; }

  function optionLines(q) {
    return q.options.map((o, i) => `${letterOf(i)}) ${o}`).join('\n');
  }

  /* Per-question explainer prompt for /v1/chat. The question bank is authored
     in English; the framing follows the UI language so Captain Adel replies in
     the student's language. */
  function buildAskPrompt(q, chosenIdx, lang) {
    const ar = lang === 'ar';
    const key = `${letterOf(q.answer)}) ${q.options[q.answer]}`;
    const wrong = chosenIdx != null && chosenIdx !== q.answer;
    const chosen = wrong ? `${letterOf(chosenIdx)}) ${q.options[chosenIdx]}` : '';
    let text;
    if (ar) {
      text = 'أراجع هذا السؤال من اختبار GACAR التجريبي:\n\n'
        + `السؤال: ${q.q}\n${optionLines(q)}\n\n`
        + `مفتاح الإجابة يقول إن الإجابة الصحيحة هي ${key}.`
        + (wrong ? `\nأنا اخترت ${chosen} وكانت خاطئة.` : (chosenIdx == null ? '\nلم أُجِب عن هذا السؤال.' : ''))
        + '\n\nاشرح لي لماذا هذه الإجابة هي الصحيحة'
        + (wrong ? ' وأين أخطأ اختياري،' : '،')
        + ' مع الاستشهاد بالجزء والمادة الدقيقة في لوائح GACAR.';
    } else {
      text = "I'm reviewing this GACAR practice-exam question:\n\n"
        + `Question: ${q.q}\n${optionLines(q)}\n\n`
        + `The answer key says the correct answer is ${key}.`
        + (wrong ? `\nI chose ${chosen}, which was marked wrong.` : (chosenIdx == null ? "\nI didn't answer it." : ''))
        + '\n\nPlease explain why that answer is correct'
        + (wrong ? ' and where my choice went wrong,' : ',')
        + ' citing the exact GACAR Part and section.';
    }
    return clip(text, MAX_PROMPT_CHARS);
  }

  /* Post-exam debrief handed to chat.html?q= (chat.js auto-sends it). Names
     the weakest topics and quotes up to two missed questions. */
  function buildDebriefPrompt(questions, answers, passMark, lang) {
    const ar = lang === 'ar';
    const s = scoreExam(questions, answers, passMark);
    const weak = topicBreakdown(questions, answers).filter((r) => r.pct < 100).slice(0, 3);
    const missed = [];
    for (let i = 0; i < questions.length && missed.length < 2; i++) {
      if (answers[i] !== questions[i].answer) missed.push(questions[i]);
    }
    const topics = weak.map((r) => (ar ? r.titleAr : r.title) + ` (${r.correct}/${r.total})`).join(ar ? '، ' : ', ');
    const missedLines = missed.map((q) =>
      `- "${clip(q.q, 160)}" (${ar ? 'الإجابة الصحيحة' : 'correct answer'}: ${q.options[q.answer]})`).join('\n');
    let text;
    if (ar) {
      text = `أنهيت للتو اختبار GACAR التجريبي وحصلت على ${s.pct}% (${s.correct}/${s.total}).`
        + (topics ? `\nأضعف مواضيعي: ${topics}.` : '')
        + (missedLines ? `\nأسئلة أخطأت فيها:\n${missedLines}` : '')
        + '\n\nساعدني في المراجعة: اشرح القواعد التي أخفقت فيها مع الاستشهاد بمواد GACAR.';
    } else {
      text = `I just finished a GACAR practice exam and scored ${s.pct}% (${s.correct}/${s.total}).`
        + (topics ? `\nMy weakest topics: ${topics}.` : '')
        + (missedLines ? `\nQuestions I missed:\n${missedLines}` : '')
        + '\n\nHelp me debrief: explain the rules I got wrong, with GACAR citations.';
    }
    return clip(text, MAX_PROMPT_CHARS);
  }

  /* ---- misc ---- */
  function fmtTime(secs) {
    const s = Math.max(0, secs);
    return `${Math.floor(s / 60).toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`;
  }

  const AdelExamCore = {
    LETTERS,
    validQuestion, validQuizData, examConfig,
    shuffle, shuffleOptions, flatten, pickQuestions,
    scoreExam, topicBreakdown, examSummary,
    snapshot, validSnapshot,
    buildAskPrompt, buildDebriefPrompt,
    fmtTime, letterOf,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = AdelExamCore;
  if (typeof window !== 'undefined') window.AdelExamCore = AdelExamCore;
})();
