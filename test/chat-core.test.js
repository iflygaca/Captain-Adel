/* Unit tests — captadel/public/assets/js/chat-core.js (the one test file that
 * maps outside src/: the shared frontend core is a classic browser script with
 * a module.exports branch exactly so this suite can load it under node:test).
 *
 * Covers the DOM-free helpers both chat.js and console.js consume: esc/safeUrl
 * (the untrusted-model-output XSS line), the minimal markdown renderer with §
 * cite tokens, the grounding badge, the bilingual error copy, and the SSE
 * event reader fed a synthetic ReadableStream. Language-sensitive helpers read
 * document.documentElement.lang, so tests fake a minimal global document. */
'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const core = require('../public/assets/js/chat-core');

/* Language-bearing helpers read document.documentElement.lang. */
function withLang(lang, fn) {
  const prev = global.document;
  global.document = { documentElement: { lang } };
  try { return fn(); } finally {
    if (prev === undefined) delete global.document;
    else global.document = prev;
  }
}

/* ------------------------------------------------------------ esc / safeUrl */

test('esc: neutralises all five HTML-special characters', () => {
  assert.equal(core.esc(`<img src="x" onerror='y'>&`),
    '&lt;img src=&quot;x&quot; onerror=&#39;y&#39;&gt;&amp;');
});

test('safeUrl: passes https/mailto/rooted/anchor and relative .html', () => {
  assert.equal(core.safeUrl('https://gaca.gov.sa'), 'https://gaca.gov.sa');
  assert.equal(core.safeUrl('mailto:x@y.z'), 'mailto:x@y.z');
  assert.equal(core.safeUrl('/#pricing'), '/#pricing');
  assert.equal(core.safeUrl('exam.html?bank=91'), 'exam.html?bank=91');
});

test('safeUrl: javascript: and data: are neutralised to #', () => {
  assert.equal(core.safeUrl('javascript:alert(1)'), '#');
  assert.equal(core.safeUrl('data:text/html,<script>'), '#');
  assert.equal(core.safeUrl(' javascript:alert(1)'), '#');
});

/* -------------------------------------------------------------- md / cites */

test('md: bold, safe links and list grouping', () => {
  const html = withLang('en', () =>
    core.md('**Bold** [gaca](https://gaca.gov.sa)\n- a\n- b\nafter'));
  assert.match(html, /<strong>Bold<\/strong>/);
  assert.match(html, /<a href="https:\/\/gaca\.gov\.sa" rel="noopener nofollow ugc">gaca<\/a>/);
  assert.match(html, /<ul><li>a<\/li><li>b<\/li><\/ul>/);
  assert.match(html, /<p>after<\/p>/);
});

test('md: model-supplied markup is escaped, unsafe link schemes drop to #', () => {
  const html = withLang('en', () => core.md('<b>x</b> [y](javascript:alert(1))'));
  assert.match(html, /&lt;b&gt;x&lt;\/b&gt;/);
  assert.match(html, /href="#"/);
});

test('citeTokens: wraps § refs (first paragraph suffix included) as focusable cites', () => {
  const html = withLang('en', () => core.citeTokens('see §91.155(a) here'));
  assert.match(html, /class="cite" tabindex="0" role="button"/);
  assert.match(html, /aria-label="View source 91\.155\(a\)"/);
  assert.match(html, /data-section="91\.155\(a\)"/);
  assert.match(html, /<bdi dir="ltr" lang="en">§91\.155\(a\)<\/bdi>/);
  // The regex captures a single parenthesised suffix: '(2)' stays outside the
  // token (same as both pre-extraction copies).
  const deep = withLang('en', () => core.citeTokens('§91.155(a)(2)'));
  assert.match(deep, /data-section="91\.155\(a\)"/);
  assert.match(deep, /<\/span>\(2\)$/);
});

test('citeTokens: Arabic UI gets the Arabic aria-label', () => {
  const html = withLang('ar', () => core.citeTokens('§61.57'));
  assert.match(html, /aria-label="عرض المصدر 61\.57"/);
});

/* ---------------------------------------------------------------- badgeHtml */

test('badgeHtml: renders the three states, empty for na/unknown', () => {
  withLang('en', () => {
    assert.match(core.badgeHtml({ kind: 'grounded' }), /data-state="grounded".*Grounded/);
    assert.match(core.badgeHtml({ kind: 'partial' }), /Partially grounded/);
    assert.match(core.badgeHtml({ kind: 'refusal', refusalClass: '1.1' }), /gb-class.*§1\.1/);
    assert.equal(core.badgeHtml({ kind: 'na' }), '');
    assert.equal(core.badgeHtml({}), '');
    assert.equal(core.badgeHtml(null), '');
  });
});

test('badgeHtml: Arabic labels under an ar document', () => {
  const html = withLang('ar', () => core.badgeHtml({ kind: 'grounded' }));
  assert.match(html, /موثَّق بالمصدر/);
});

/* ------------------------------------------------------------ verifyActions */

test('verifyActions: refusal gets the Check GACA action, nothing else does', () => {
  withLang('en', () => {
    const html = core.verifyActions({ kind: 'refusal', sources: [] });
    assert.match(html, /href="https:\/\/gaca\.gov\.sa"/);
    assert.doesNotMatch(html, /library\.html/, 'no dead library.html deep-link');
    assert.equal(core.verifyActions({ kind: 'grounded' }), '');
    assert.equal(core.verifyActions(null), '');
  });
});

/* --------------------------------------------------------------- error copy */

test('errorText/rateLimitedText: bilingual (the old constants were EN-only)', () => {
  const en = withLang('en', () => [core.errorText(), core.rateLimitedText()]);
  const ar = withLang('ar', () => [core.errorText(), core.rateLimitedText()]);
  assert.match(en[0], /couldn't reach my engine/);
  assert.match(en[1], /Ease off a moment, Captain/);
  assert.match(ar[0], /المحرّك/);
  assert.match(ar[1], /يا كابتن/);
  assert.notEqual(en[0], ar[0]);
});

/* ---------------------------------------------------------------- sseEvents */

function sseResponse(frames) {
  const encoder = new TextEncoder();
  let i = 0;
  return {
    body: new ReadableStream({
      pull(controller) {
        if (i < frames.length) controller.enqueue(encoder.encode(frames[i++]));
        else controller.close();
      },
    }),
  };
}

async function collect(res) {
  const out = [];
  for await (const ev of core.sseEvents(res)) out.push(ev);
  return out;
}

test('sseEvents: parses data frames and stops at [DONE]', async () => {
  const events = await collect(sseResponse([
    'data: {"type":"token","delta":"Hello"}\n',
    'data: {"type":"final","answer":"Hello","kind":"na"}\n',
    'data: [DONE]\n',
    'data: {"type":"token","delta":"after done — never seen"}\n',
  ]));
  assert.deepEqual(events, [
    { type: 'token', delta: 'Hello' },
    { type: 'final', answer: 'Hello', kind: 'na' },
  ]);
});

test('sseEvents: a frame split across reads is buffered, keep-alives skipped', async () => {
  const events = await collect(sseResponse([
    'data: {"type":"tok',              // frame split mid-JSON across two reads
    'en","delta":"A"}\n: keep-alive\n',
    'data: not-json\n',                // malformed frame skipped silently
    'data: {"type":"token","delta":"B"}\n',
  ]));
  assert.deepEqual(events, [
    { type: 'token', delta: 'A' },
    { type: 'token', delta: 'B' },
  ]);
});

test('sseEvents: end of stream without [DONE] just completes', async () => {
  const events = await collect(sseResponse(['data: {"type":"token","delta":"x"}\n']));
  assert.equal(events.length, 1);
});
