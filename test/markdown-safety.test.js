/* Markdown safety test — enforces XSS protection in chat-core.js markdown rendering.
 *
 * This test gates the DOMPurify integration and verifies that:
 *
 * 1. XSS Attack Vectors are neutralized (50% of test weight)
 *    - Event handler injection (<img onerror>, onclick, etc.)
 *    - CSS injection via style attributes
 *    - Data URIs and javascript: protocols in href/src
 *    - Malformed/nested HTML that bypasses escaping
 *    - SVG/embed attack vectors
 *
 * 2. Safe markdown features are preserved (30% of test weight)
 *    - Bold text (**bold**)
 *    - Links ([text](url))
 *    - GACAR citations (§91.155)
 *    - Lists (- item)
 *    - Paragraphs
 *    - Arabic text and RTL rendering
 *
 * 3. Sanitization configuration is correct (20% of test weight)
 *    - Whitelist includes safe elements: p, ul, li, strong, a, span, bdi
 *    - Whitelist includes safe attributes: class, href, tabindex, role, aria-label, data-section
 *    - Script tags are removed
 *    - Event handlers are stripped
 *
 * Success criteria: All XSS vectors are neutralized, safe features work, configuration is tight
 * Deterministic, no network, no external dependencies — safe in CI.
 */
'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const REPO_ROOT = path.join(__dirname, '..');

// Load DOMPurify for Node.js testing
// Install from npm: npm install dompurify
let DOMPurify;
try {
  const createDOMPurify = require('dompurify');
  const { JSDOM } = require('jsdom');
  const window = new JSDOM('').window;
  DOMPurify = createDOMPurify(window);
  // Attach to global so chat-core.js can find it in its module scope
  global.DOMPurify = DOMPurify;
} catch (e) {
  console.error('Failed to load DOMPurify or jsdom:', e.message);
  console.error('Install with: npm install dompurify jsdom --save-dev');
  process.exit(1);
}

// Load chat-core.js helpers
let AdelChatCore;
try {
  AdelChatCore = require(path.join(REPO_ROOT, 'public/assets/js/chat-core.js'));
} catch (e) {
  console.error('Failed to load chat-core.js:', e.message);
  process.exit(1);
}

// Verify DOMPurify is available
if (!DOMPurify || !DOMPurify.sanitize) {
  throw new Error('DOMPurify.sanitize not available — check installation');
}

// Verify required exports
const required = ['md', 'mdSafe', 'mdRaw', 'sanitizeMarkdown', 'inline', 'esc', 'citeTokens'];
for (const name of required) {
  if (!AdelChatCore[name]) {
    throw new Error(`Missing required export from chat-core.js: ${name}`);
  }
}

// ============================================================================
// TEST 1: XSS ATTACK VECTORS ARE NEUTRALIZED (50%)
// ============================================================================

test('XSS: event handler injection is stripped (img onerror)', () => {
  const attack = '<img src=x onerror="alert(\'xss\')">';
  const safe = AdelChatCore.mdSafe(`**Text** ${attack}`);
  assert.strictEqual(safe.includes('onerror'), false, 'onerror attribute should be stripped');
  assert.strictEqual(safe.includes('alert'), false, 'alert payload should not appear');
  assert.ok(safe.includes('<strong>Text</strong>'), 'bold text should survive');
});

test('XSS: onclick handlers are stripped', () => {
  const attack = '<span onclick="console.log(\'xss\')">Click me</span>';
  const safe = AdelChatCore.mdSafe(attack);
  assert.strictEqual(safe.includes('onclick'), false, 'onclick should be stripped');
  assert.strictEqual(safe.includes('console.log'), false, 'payload should be removed');
});

test('XSS: javascript: protocol in href is blocked', () => {
  const attack = '[Click](javascript:alert("xss"))';
  const safe = AdelChatCore.mdSafe(attack);
  // DOMPurify should convert javascript: to # or remove the link entirely
  assert.strictEqual(safe.includes('javascript:'), false, 'javascript: protocol should be blocked');
});

test('XSS: data: URI in href is blocked', () => {
  const attack = '[Click](data:text/html,<script>alert("xss")</script>)';
  const safe = AdelChatCore.mdSafe(attack);
  assert.strictEqual(safe.includes('data:'), false, 'data: URI should be blocked');
});

test('XSS: script tags are removed entirely', () => {
  const attack = '<script>alert("xss")</script>Hello';
  const safe = AdelChatCore.mdSafe(attack);
  assert.strictEqual(safe.includes('<script>'), false, 'script tag should be removed');
  assert.strictEqual(safe.includes('alert'), false, 'script content should be removed');
  assert.ok(safe.includes('Hello'), 'surrounding text should survive');
});

test('XSS: style attribute injection is blocked', () => {
  const attack = '<p style="background:url(\'javascript:alert(1)\')">Text</p>';
  const safe = AdelChatCore.mdSafe(attack);
  assert.strictEqual(safe.includes('style='), false, 'style attribute should be stripped');
  assert.strictEqual(safe.includes('javascript:'), false, 'javascript payload should be gone');
});

test('XSS: SVG/embed with onload are blocked', () => {
  const attack = '<svg onload="alert(\'xss\')"><circle r="10"/></svg>';
  const safe = AdelChatCore.mdSafe(attack);
  assert.strictEqual(safe.includes('onload'), false, 'onload should be stripped');
  // SVG is not in the whitelist, so the entire element should be removed
  assert.strictEqual(safe.includes('<svg'), false, 'svg should be removed (not in whitelist)');
});

test('XSS: iframe injection is blocked', () => {
  const attack = '<iframe src="https://evil.com/steal-creds.html"></iframe>';
  const safe = AdelChatCore.mdSafe(attack);
  assert.strictEqual(safe.includes('<iframe'), false, 'iframe tag should be removed');
  assert.strictEqual(safe.includes('evil.com'), false, 'malicious URL should be gone');
});

test('XSS: input field injection is blocked', () => {
  const attack = '<input onfocus="alert(\'xss\')" autofocus>';
  const safe = AdelChatCore.mdSafe(attack);
  assert.strictEqual(safe.includes('<input'), false, 'input tag should be removed');
  assert.strictEqual(safe.includes('onfocus'), false, 'event handler should be stripped');
});

// ============================================================================
// TEST 2: SAFE MARKDOWN FEATURES ARE PRESERVED (30%)
// ============================================================================

test('markdown: bold text survives sanitization', () => {
  const safe = AdelChatCore.mdSafe('This is **bold** text');
  assert.ok(safe.includes('<strong>bold</strong>'), 'bold formatting should be preserved');
  assert.ok(safe.includes('This is'), 'surrounding text should survive');
});

test('markdown: links survive sanitization with safe URLs', () => {
  const safe = AdelChatCore.mdSafe('[Learn more](https://flygaca.com)');
  assert.ok(safe.includes('<a'), 'link tag should be preserved');
  assert.ok(safe.includes('Learn more'), 'link text should survive');
  assert.ok(safe.includes('flygaca.com'), 'safe URL should be preserved');
});

test('markdown: GACAR citations are preserved', () => {
  const safe = AdelChatCore.mdSafe('See §91.155(a)(2) for details');
  assert.ok(safe.includes('<span class="cite"'), 'cite span should be preserved');
  assert.ok(safe.includes('§91.155'), 'GACAR section should appear');
  assert.ok(safe.includes('data-section='), 'data-section attribute should survive');
});

test('markdown: BDI tags in citations are preserved', () => {
  const safe = AdelChatCore.mdSafe('Reference §91.155 here');
  assert.ok(safe.includes('<bdi'), 'BDI tag for RTL should be preserved');
  assert.ok(safe.includes('dir="ltr"'), 'LTR direction should survive');
});

test('markdown: lists survive sanitization', () => {
  const safe = AdelChatCore.mdSafe('- Item 1\n- Item 2\n- Item 3');
  assert.ok(safe.includes('<ul>'), 'ul tag should be preserved');
  assert.ok(safe.includes('<li>'), 'li tags should be preserved');
  assert.ok(safe.includes('Item 1'), 'list items should survive');
  assert.ok(safe.includes('Item 2'), 'multiple items should survive');
});

test('markdown: paragraphs survive sanitization', () => {
  const safe = AdelChatCore.mdSafe('First paragraph\n\nSecond paragraph');
  assert.ok(safe.includes('<p>'), 'p tags should be preserved');
  assert.ok(safe.includes('First paragraph'), 'paragraph text should survive');
  assert.ok(safe.includes('Second paragraph'), 'multiple paragraphs should work');
});

test('markdown: Arabic text and RTL rendering', () => {
  const safe = AdelChatCore.mdSafe('النص العربي هنا');
  assert.ok(safe.includes('النص العربي'), 'Arabic text should survive');
  assert.ok(safe.includes('<p>'), 'paragraph wrapping should be applied');
});

test('markdown: cite role attribute survives (for a11y)', () => {
  const safe = AdelChatCore.mdSafe('Check §91.155');
  assert.ok(safe.includes('role="button"'), 'role attribute should be preserved');
  assert.ok(safe.includes('aria-label='), 'aria-label should survive');
  assert.ok(safe.includes('tabindex="0"'), 'tabindex should be preserved');
});

// ============================================================================
// TEST 3: SANITIZATION CONFIGURATION IS CORRECT (20%)
// ============================================================================

test('sanitization: allowed tags are in the whitelist', () => {
  // Test that elements we want to keep are in the allowed list
  const html = '<p>Para</p><ul><li>Item</li></ul><strong>Bold</strong><a href="#">Link</a><span>Span</span><bdi>RTL</bdi>';
  const safe = AdelChatCore.sanitizeMarkdown(html);
  assert.ok(safe.includes('<p>'), 'p tag should be allowed');
  assert.ok(safe.includes('<ul>'), 'ul tag should be allowed');
  assert.ok(safe.includes('<li>'), 'li tag should be allowed');
  assert.ok(safe.includes('<strong>'), 'strong tag should be allowed');
  assert.ok(safe.includes('<a'), 'a tag should be allowed');
  assert.ok(safe.includes('<span'), 'span tag should be allowed');
  assert.ok(safe.includes('<bdi>'), 'bdi tag should be allowed');
});

test('sanitization: dangerous tags are not allowed', () => {
  // Test that dangerous elements are removed
  const dangerous = '<script>alert(1)</script><img src=x><iframe></iframe><style>body{}</style><embed>';
  const safe = AdelChatCore.sanitizeMarkdown(dangerous);
  assert.strictEqual(safe.includes('<script'), false, 'script should not be allowed');
  assert.strictEqual(safe.includes('<img'), false, 'img should not be allowed');
  assert.strictEqual(safe.includes('<iframe'), false, 'iframe should not be allowed');
  assert.strictEqual(safe.includes('<style'), false, 'style tag should not be allowed');
  assert.strictEqual(safe.includes('<embed'), false, 'embed should not be allowed');
});

test('sanitization: safe attributes are allowed', () => {
  const safe = AdelChatCore.mdSafe('[Link](https://flygaca.com)');
  assert.ok(safe.includes('href='), 'href attribute should be preserved');

  const safeCite = AdelChatCore.mdSafe('See §91.155');
  assert.ok(safeCite.includes('class='), 'class attribute should be preserved');
  assert.ok(safeCite.includes('data-section='), 'data-section should be preserved');
  assert.ok(safeCite.includes('aria-label='), 'aria-label should be preserved');
  assert.ok(safeCite.includes('role='), 'role attribute should be preserved');
});

test('sanitization: dangerous attributes are stripped', () => {
  const dangerous = '<p onclick="alert(1)" style="background:red" onload="x()">Text</p>';
  const safe = AdelChatCore.sanitizeMarkdown(dangerous);
  assert.strictEqual(safe.includes('onclick'), false, 'onclick should be stripped');
  assert.strictEqual(safe.includes('style='), false, 'style should be stripped');
  assert.strictEqual(safe.includes('onload'), false, 'onload should be stripped');
  assert.ok(safe.includes('<p>'), 'p tag should remain');
  assert.ok(safe.includes('Text'), 'text content should remain');
});

// ============================================================================
// INTEGRATION TESTS
// ============================================================================

test('integration: full chat flow with mixed content', () => {
  const userInput = `Here's a link [to GACA](https://gaca.gov.sa) and see **§91.155** for details.

  Try this injection: <img src=x onerror="alert(1)">

  - Safe list item
  - Another item`;

  const safe = AdelChatCore.mdSafe(userInput);

  // Safe content should survive
  assert.ok(safe.includes('gaca.gov.sa'), 'safe URL should survive');
  assert.ok(safe.includes('<strong>'), 'bold should survive');
  assert.ok(safe.includes('§91.155'), 'citation should survive');
  assert.ok(safe.includes('Safe list item'), 'list content should survive');

  // Attacks should be stripped
  assert.strictEqual(safe.includes('onerror'), false, 'event handler should be stripped');
  assert.strictEqual(safe.includes('alert'), false, 'alert payload should be removed');
  assert.strictEqual(safe.includes('<img'), false, 'img tag should be removed');
});

test('integration: sanitizeMarkdown is idempotent', () => {
  const safe1 = AdelChatCore.mdSafe('**Bold** [link](https://flygaca.com)');
  const safe2 = AdelChatCore.sanitizeMarkdown(safe1);
  // Running sanitization twice should produce the same result
  assert.strictEqual(safe1, safe2, 'sanitization should be idempotent');
});
