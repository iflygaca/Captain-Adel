/* ============================================================================
 * Captain Adel — context-aware follow-up suggestions.
 *
 * After every answer the chat UI offers a few "keep exploring" chips. Instead
 * of a fixed, random list, derive them from the answer just given: when the
 * answer cites specific GACAR Parts, suggest follow-ups about THOSE Parts (what
 * else they cover, what changed recently — the latter leans on the existing
 * list_changes capability). Remaining slots fall back to a curated generic set.
 *
 * Pure and deterministic: no network, no model call. Same input -> same chips,
 * so it is cheap, eval-friendly and unit-testable. The UI renders each chip
 * with its bilingual prompt (q / qAr) and short label (en / ar); this module is
 * the single source of truth for that list, mirrored offline in chat.js.
 * ==========================================================================*/

'use strict';

/* Curated generic suggestions — the offline fallback, kept in lockstep with
 * the FOLLOWUPS array in public/assets/js/chat.js. */
const FALLBACK = [
  { q: 'What are the VFR weather minima in controlled airspace?', qAr: 'ما هي حدود الطقس للطيران البصري VFR في المجال الجوي المراقب؟', en: 'VFR weather minima', ar: 'حدود طقس الطيران البصري' },
  { q: "What's required for a GACAR commercial pilot licence?", qAr: 'ما متطلبات رخصة الطيار التجاري CPL وفق لوائح GACAR؟', en: 'CPL requirements', ar: 'متطلبات رخصة الطيار التجاري' },
  { q: 'What are the fuel reserve requirements for a Part 121 flight?', qAr: 'ما متطلبات احتياطي الوقود لرحلة وفق Part 121؟', en: 'Part 121 fuel reserves', ar: 'احتياطي وقود Part 121' },
  { q: 'What does GACAR Part 91 say about carry-on baggage?', qAr: 'ماذا تقول GACAR Part 91 عن الأمتعة المحمولة في المقصورة؟', en: 'Carry-on baggage rules', ar: 'قواعد الأمتعة المحمولة' },
  { q: 'How do I convert a foreign pilot licence to a GACA licence?', qAr: 'كيف أحوّل رخصة طيار أجنبية إلى رخصة من الهيئة GACA؟', en: 'Convert a foreign licence', ar: 'تحويل رخصة أجنبية' },
  { q: 'What are the recent-experience requirements to carry passengers?', qAr: 'ما متطلبات الخبرة الحديثة (الحداثة) لنقل الركاب؟', en: 'Recency to carry passengers', ar: 'الحداثة لنقل الركاب' },
  { q: 'What is the transition altitude in Saudi Arabia?', qAr: 'ما هو ارتفاع الانتقال في السعودية؟', en: 'Saudi transition altitude', ar: 'ارتفاع الانتقال في السعودية' },
  { q: 'What medical certificate does a private pilot need?', qAr: 'ما الشهادة الطبية التي يحتاجها الطيار الخاص PPL؟', en: 'PPL medical class', ar: 'الفحص الطبي لرخصة الطيار الخاص' },
];

/* Friendly topic labels for the common GACAR Parts. Unknown Parts degrade to a
 * bare "Part N" — never to a wrong topic. */
const PART_TOPICS = {
  61:  { en: 'pilot licensing', ar: 'إصدار رخص الطيارين' },
  67:  { en: 'medical standards', ar: 'المعايير الطبية' },
  91:  { en: 'general operating rules', ar: 'قواعد التشغيل العامة' },
  121: { en: 'air-carrier operations', ar: 'عمليات الناقل الجوي' },
  135: { en: 'on-demand operations', ar: 'العمليات حسب الطلب' },
  141: { en: 'flight training', ar: 'التدريب على الطيران' },
};

const PART_IN_TEXT = /\bpart\s+(\d+)\b/gi;

/* Distinct GACAR Part numbers this turn touched, in first-seen order: the
 * structured source `.part` field first (already parsed by makeSource), then
 * any Part named in the answer prose. */
function citedParts(answer, sources) {
  const order = [];
  const seen = new Set();
  const add = (p) => {
    if (p == null || p === '') return;
    const key = String(p);
    if (seen.has(key)) return;
    seen.add(key);
    order.push(key);
  };
  for (const s of sources || []) if (s) add(s.part);
  const text = String(answer || '');
  let m;
  PART_IN_TEXT.lastIndex = 0;
  while ((m = PART_IN_TEXT.exec(text)) !== null) add(m[1]);
  return order;
}

/* The two follow-ups offered for a single cited Part: dig deeper into it, and
 * surface what changed (wired to the list_changes capability server-side). */
function partSuggestions(p) {
  const topic = PART_TOPICS[p];
  const enLabel = topic ? `Part ${p} — ${topic.en}` : `Part ${p}`;
  const arLabel = topic ? `Part ${p} — ${topic.ar}` : `Part ${p}`;
  return [
    {
      q: `What else does GACAR Part ${p} cover?`,
      qAr: `ماذا تغطي GACAR Part ${p} أيضًا؟`,
      en: `More of ${enLabel}`,
      ar: `المزيد من ${arLabel}`,
    },
    {
      q: `What recent changes were made to GACAR Part ${p}?`,
      qAr: `ما التغييرات الحديثة على GACAR Part ${p}؟`,
      en: `Recent changes to Part ${p}`,
      ar: `تغييرات حديثة على Part ${p}`,
    },
  ];
}

/**
 * Up to `count` follow-up chips for a turn.
 *   { answer, sources, kind, count = 3 } -> [{ q, qAr, en, ar }, ...]
 * Context-derived (per cited Part) first, then the curated fallback fills the
 * rest. Refusals / non-answers ('na') have no answer context, so they get the
 * curated set. Deterministic; deduped by prompt; always <= count items.
 */
function suggestFollowups({ answer, sources, kind, count = 3 } = {}) {
  const limit = Math.max(1, Number(count) || 3);
  const out = [];
  const seen = new Set();
  const push = (s) => {
    if (!s || !s.q || seen.has(s.q) || out.length >= limit) return;
    seen.add(s.q);
    out.push(s);
  };

  // Context-derived suggestions — only when we actually answered something.
  if (kind !== 'refusal' && kind !== 'na') {
    const perPart = citedParts(answer, sources).map(partSuggestions);
    // Breadth before depth: give each cited Part its "more" chip before any
    // Part's "recent changes" chip, so multiple Parts are all represented.
    for (let round = 0; round < 2 && out.length < limit; round++) {
      for (const sug of perPart) push(sug[round]);
    }
  }

  // Fill remaining slots from the curated fallback list.
  for (const s of FALLBACK) push(s);
  return out;
}

module.exports = { suggestFollowups, FALLBACK };
