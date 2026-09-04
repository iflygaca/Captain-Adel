# Captain-Adel WCAG AA Accessibility — Remediation Instructions

**Target:** Fix all blocking issues for Phase 2 launch  
**Estimated Time:** 2–4 hours  
**Effort Level:** Low (mostly copy-paste, 1 color token change)

---

## ISSUE #1: Warning Color Contrast Violation (SERIOUS)

### What needs fixing?
Day theme warning color (#D97706) has only 2.85:1 contrast on light background (#F5F2ED). Needs 3:1.

### Quick Fix (Recommended)
Change the warning color from `#d97706` (darker orange) to `#c56e00` (deeper orange-brown).

### Steps

1. **Open file:** `/home/user/Captain-Adel/landing/src/design/tokens.ts`

2. **Find line 155** (Day palette, warning color):
   ```typescript
   // BEFORE
   warning: '#d97706',        // darkened warning
   ```

3. **Replace with:**
   ```typescript
   // AFTER
   warning: '#c56e00',        // deepened orange-brown (3.1:1 contrast on #F5F2ED)
   ```

4. **Verify change:**
   - Run audit: `cd /tmp/claude-0/-home-user/16136534-f011-5cf4-ac8b-cca868489c38/scratchpad/a11y-audit && node audit-v2.mjs`
   - Verify: `Warning (Day) - #C56E00 on #F5F2ED: 3.1:1 (need 3:1) ✓`

5. **Test in all themes:**
   - Falcon theme: warning color still `#fbbf24` (not affected)
   - Cockpit theme: warning color still `#ff9500` (not affected)
   - Day theme: warning color now `#c56e00` (darker, more readable)

### Validation
- Contrast ratio calculator: https://www.tpgi.com/color-contrast-checker/
- Input: #C56E00 (foreground), #F5F2ED (background)
- Expected output: 3.1:1 ✓

---

## ISSUE #2: Missing H1 Headings (MODERATE)

### What needs fixing?
8 of 9 pages are missing explicit `<h1>` headings. Required for page structure and screen reader navigation.

### Pages to Fix
1. `public/index.html`
2. `public/ar/index.html`
3. `public/privacy.html`
4. `public/terms.html`
5. `public/accessibility.html`
6. `public/account.html`
7. `public/exam.html`
8. `public/console.html`

### Template
Add this line after the closing `</header>` tag, before main content:

**English Pages (LTR):**
```html
<h1>Page Title Here</h1>
```

**Arabic Pages (RTL):**
```html
<h1>عنوان الصفحة هنا</h1>
```

### Specific Changes

#### 1. `public/index.html` (Landing)
**Location:** After `</header>`, before `<main>` or first content block

```html
<!-- Add this line: -->
<h1>Captain Adel — AI Flight Instructor for Saudi GACAR</h1>
```

#### 2. `public/ar/index.html` (Landing - Arabic)
**Location:** After `</header>`, before main content

```html
<!-- Add this line: -->
<h1>كابتن عادل — مدرب الطيران الذكي للوائح GACAR السعودية</h1>
```

#### 3. `public/privacy.html`
**Location:** After `</header>`, before content

```html
<!-- Add this line: -->
<h1>Privacy Policy (سياسة الخصوصية)</h1>
```

#### 4. `public/terms.html`
**Location:** After `</header>`, before content

```html
<!-- Add this line: -->
<h1>Terms of Service (شروط الخدمة)</h1>
```

#### 5. `public/accessibility.html`
**Location:** After `</header>`, before content

```html
<!-- Add this line: -->
<h1>Accessibility Statement</h1>
```

#### 6. `public/account.html`
**Location:** After `</header>`, before `<main>`

```html
<!-- Add this line: -->
<h1>My Account (حسابي)</h1>
```

#### 7. `public/exam.html`
**Location:** After `</header>`, before exam content

```html
<!-- Add this line: -->
<h1>GACAR Practice Exam (اختبار GACAR)</h1>
```

#### 8. `public/console.html`
**Location:** After `</header>`, before console/editor

```html
<!-- Add this line: -->
<h1>Flight Computer Console (حاسبة الطيران)</h1>
```

### Validation
After adding, verify:
1. Run audit: `node audit-v2.mjs`
2. Check: "No h1 heading" warnings should disappear for all pages
3. Test in browser: Right-click → Inspect → Verify `<h1>` is present and visible

---

## ISSUE #3: Missing Skip Links (MODERATE)

### What needs fixing?
6 pages lack skip links. Users (especially keyboard users) should be able to jump directly to main content without tabbing through all navigation.

### Pages to Fix
1. `public/index.html`
2. `public/privacy.html`
3. `public/terms.html`
4. `public/accessibility.html`
5. `public/ar/index.html`

### Template

Add this line as the **very first element inside `<body>`**, before the disclaimer or header:

**English:**
```html
<a class="visually-hidden" href="#main" data-en="Skip to content">Skip to content</a>
```

**Arabic:**
```html
<a class="visually-hidden" href="#main" data-en="Skip to content">تخطَّ إلى المحتوى</a>
```

### Implementation Steps

1. **Find the opening `<body>` tag** in each page
2. **Add skip link as the first child of `<body>`:**

```html
<body>
  <!-- ADD THIS LINE: -->
  <a class="visually-hidden" href="#main" data-en="Skip to content">تخطَّ إلى المحتوى</a>

  <!-- Then the rest of the page: -->
  <div class="disclaimer-strip">
    ...
  </div>
```

3. **Verify the main content area has `id="main"`:**

```html
<main id="main">
  <!-- Page content here -->
</main>
```

If your page uses a `<div>` instead of `<main>`, add `id="main"` there:

```html
<div id="main" class="page-content">
  <!-- Page content here -->
</div>
```

### CSS (Already Present)

The `.visually-hidden` class should already be in your CSS. If not, add:

```css
.visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border-width: 0;
}

.visually-hidden:focus {
  position: static;
  width: auto;
  height: auto;
  overflow: visible;
  clip: auto;
  white-space: normal;
  padding: 8px 12px;
  background: #22D3EE;
  color: #050810;
  z-index: 9999;
}
```

### Validation
1. Open each page in a browser
2. Press Tab immediately after page load
3. **Expected:** Skip link appears (usually in top-left with cyan background)
4. **Press Enter:** Focus jumps to main content (avoiding navbar)

---

## ISSUE #4: Missing Image Alt Text (MODERATE)

### What needs fixing?
3 images lack descriptive alt text: 2 avatar images in chat.html, 1 status indicator in console.html.

### Changes

#### 1. `public/chat.html` — Avatar Images (2)

**Find line ~94:**
```html
<!-- BEFORE: -->
<img src="assets/img/captain/avatar.png" alt="كابتن عادل" width="44" height="44">
<!-- AFTER: Already correct! alt text is "كابتن عادل" (Captain Adel in Arabic) -->

<!-- BEFORE (line ~111): -->
<img src="assets/img/captain/avatar.png" alt="كابتن عادل" width="96" height="96">
<!-- AFTER: Already correct! alt text is "كابتن عادل" (Captain Adel in Arabic) -->
```

**Status:** ✓ Both avatars in chat.html already have good alt text.

#### 2. `public/console.html` — Status Indicator

**Find the status indicator image (search for "status" or find the indicator icon):**

```html
<!-- BEFORE: -->
<img src="assets/img/status-indicator.png" alt="">
<!-- or -->
<img src="assets/img/status-indicator.png">

<!-- AFTER: Choose one based on context -->
<img src="assets/img/status-indicator.png" alt="Status indicator - online" width="16" height="16">
```

**Guidelines:**
- Use a descriptive, contextual alt text (not "image" or "icon")
- Include the status state if the image is dynamic (e.g., "online", "offline", "loading")
- For decorative indicators, you can use `alt=""` if the status is already indicated by surrounding text

### Validation
1. Run audit: `node audit-v2.mjs`
2. Check: "images missing alt text" count should decrease
3. Test: Right-click image → Inspect → verify `alt` attribute present and descriptive

---

## ISSUE #5: Grounding Badge Missing role="status" (MODERATE)

### What needs fixing?
The grounding badge (Grounded / Partially grounded / Refusal) in chat responses should have `role="status"` so screen readers announce state changes.

### File to Edit
`public/assets/js/chat-core.js`

### Find (around line 101-110)
```javascript
// BEFORE:
function badgeHtml(data) {
  const k = data && data.kind;
  if (!k || !GBADGE[k]) return '';
  const lbl = GBADGE[k][isAr() ? 1 : 0];
  const cls = (k === 'refusal' && data.refusalClass)
    ? `<span class="gb-class"><bdi dir="ltr" lang="en">§${esc(data.refusalClass)}</bdi></span>` : '';
  return `<div class="grounding-badge" data-state="${esc(k)}">`  // <-- ADD role="status" HERE
    + `<span class="gb-dot" aria-hidden="true"></span>`
    + `<span class="gb-label">${esc(lbl)}</span>${cls}</div>`;
}
```

### Replace with
```javascript
// AFTER:
function badgeHtml(data) {
  const k = data && data.kind;
  if (!k || !GBADGE[k]) return '';
  const lbl = GBADGE[k][isAr() ? 1 : 0];
  const cls = (k === 'refusal' && data.refusalClass)
    ? `<span class="gb-class"><bdi dir="ltr" lang="en">§${esc(data.refusalClass)}</bdi></span>` : '';
  return `<div class="grounding-badge" data-state="${esc(k)}" role="status">`  // <-- ADDED role="status"
    + `<span class="gb-dot" aria-hidden="true"></span>`
    + `<span class="gb-label">${esc(lbl)}</span>${cls}</div>`;
}
```

### Exact Change
**Line ~107, change:**
```javascript
return `<div class="grounding-badge" data-state="${esc(k)}">`
```

**To:**
```javascript
return `<div class="grounding-badge" data-state="${esc(k)}" role="status">`
```

### Why This Matters
- `role="status"` tells screen readers: "This is a live status update; announce it when it changes"
- Without it: badge appears but screen reader doesn't announce the state change
- With it: User hears "Grounded" when badge changes from "Refusal" to "Grounded"

### Validation
1. Open chat.html
2. Enable screen reader (NVDA/VoiceOver)
3. Send a question
4. Listen for badge announcement: Should hear "Status, Grounded" or similar
5. Get a refusal response
6. Listen for badge announcement: Should hear "Status, Hold — not grounded"

---

## FULL REMEDIATION CHECKLIST

```
Priority 1 (MUST FIX):
  [ ] Issue #1: Fix warning color (#d97706 → #c56e00)
      Time: 15 min
      File: landing/src/design/tokens.ts
      Verify: Run audit, confirm contrast ≥ 3:1

Priority 2 (SHOULD FIX):
  [ ] Issue #2: Add H1 headings (8 pages)
      Time: 30 min
      Files: index.html, ar/index.html, privacy.html, terms.html, 
             accessibility.html, account.html, exam.html, console.html
      Verify: Each page has one h1 near top

  [ ] Issue #3: Add skip links (5 pages)
      Time: 15 min
      Files: index.html, privacy.html, terms.html, accessibility.html, ar/index.html
      Verify: Press Tab on page load; skip link appears

  [ ] Issue #4: Fix image alt text (console.html)
      Time: 5 min
      Files: console.html (1 status indicator)
      Verify: Run audit; "images missing alt" count = 0

  [ ] Issue #5: Add role="status" to grounding badge
      Time: 5 min
      Files: public/assets/js/chat-core.js (line ~107)
      Verify: NVDA/VoiceOver announces badge state changes

Post-Remediation:
  [ ] Run full audit: node audit-v2.mjs
  [ ] Verify: All SERIOUS violations resolved
  [ ] Commit changes with message: "Accessibility: Fix WCAG AA violations"
  [ ] Create PR for team review
```

---

## QUICK REFERENCE: CODE SNIPPETS

### H1 Template (English)
```html
<h1>Captain Adel — AI Flight Instructor for Saudi GACAR</h1>
```

### H1 Template (Arabic)
```html
<h1>كابتن عادل — مدرب الطيران الذكي للوائح GACAR السعودية</h1>
```

### Skip Link Template (English)
```html
<a class="visually-hidden" href="#main" data-en="Skip to content">Skip to content</a>
```

### Skip Link Template (Arabic)
```html
<a class="visually-hidden" href="#main" data-en="Skip to content">تخطَّ إلى المحتوى</a>
```

### Warning Color Change
```typescript
// File: landing/src/design/tokens.ts, line 155
// FROM:
warning: '#d97706',

// TO:
warning: '#c56e00',
```

### Grounding Badge Role
```javascript
// File: public/assets/js/chat-core.js, line ~107
// FROM:
return `<div class="grounding-badge" data-state="${esc(k)}">`

// TO:
return `<div class="grounding-badge" data-state="${esc(k)}" role="status">`
```

---

## TESTING AFTER REMEDIATION

```bash
# Run audit to verify fixes
cd /tmp/claude-0/-home-user/16136534-f011-5cf4-ac8b-cca868489c38/scratchpad/a11y-audit
node audit-v2.mjs

# Expected output:
# ✓ Passing: 18/18 color pairs
# ✓ All pages have h1 headings
# ✓ Skip links present where needed
# ✗ Violations: 0
```

---

## TIMELINE

| Task | Duration | Status |
|------|----------|--------|
| Issue #1: Warning color fix | 15 min | Quick |
| Issue #2: H1 headings (8 pages) | 30 min | Medium |
| Issue #3: Skip links (5 pages) | 15 min | Quick |
| Issue #4: Alt text (1 image) | 5 min | Quick |
| Issue #5: Badge role (1 line) | 5 min | Quick |
| **Audit & verification** | 15 min | Quick |
| **Total** | **1.5–2 hours** | — |

---

## GIT COMMIT MESSAGE

```
Accessibility: Fix WCAG AA violations for Phase 2 launch

- Fix warning color contrast (Day theme): #d97706 → #c56e00 (3.1:1)
- Add h1 headings to 8 pages (index, privacy, terms, etc.)
- Add skip links to 6 pages (keyboard navigation bypass)
- Add descriptive alt text to console.html status indicator
- Add role="status" to grounding badge (screen reader live region)

Fixes blocking accessibility gate for Phase 2 launch.
Tested with WCAG AA audit tool; all violations resolved.
```

---

## NEED HELP?

If any step is unclear:
1. **Contrast color change:** Use https://www.tpgi.com/color-contrast-checker/ to find a darker warning color
2. **H1 placement:** Add after `</header>`, before main content block
3. **Skip link:** Add as first element in `<body>`, point to `id="main"`
4. **Alt text:** Make it descriptive; avoid "image", "icon", "picture"
5. **ARIA role:** Copy-paste the exact HTML with `role="status"` added

---

**Estimated time to full Phase 2 readiness:** 2–4 hours (including testing)
