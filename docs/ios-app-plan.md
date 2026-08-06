# Captain Adel — native iOS app plan (v1)

**Status:** proposal · gates the SwiftUI build (the app is built in Xcode, in its own repo — not here)
**Owner surface:** a new `Captain-Adel-iOS` Xcode project · a **pure client** of the `/v1/*` API served by [`src/server.js`](../src/server.js)
**Companion mockups:** [`docs/mockups/ios-chat.html`](mockups/ios-chat.html) · [`docs/mockups/ios-exam.html`](mockups/ios-exam.html)

---

## Why this exists

The decision is made: Captain Adel gets a **native SwiftUI iOS app** — not a WKWebView
wrapper, not a cross-platform framework. v1 ships **chat + the mock exam**, with optional
sign-in that honours an existing captadel.com subscription read-only, and **no in-app
purchases**.

This repo cannot build or verify iOS code, so what lands here is the thing the build is
gated on: the contract-anchored plan (this document) and two phone-frame mockups that obey
it. The credo carries over from [`data-contract.md`](data-contract.md): **the app must
never render proof the server doesn't have.** The good news, found by reading the actual
code: for v1 the server already has everything.

| The app needs… | …and the backend already provides it |
|---|---|
| a streaming answer transport | SSE over `POST /v1/chat` — plain `data:` frames, no browser dependency ([`server.js:196`](../src/server.js#L196)) |
| the trust surface (badge, sources, refusal classes) | the full v1 response contract: `kind`, `grounding`, `sources[].verbatim`, `refusalClass` ([`grounding.js:320`](../src/brain/grounding.js#L320)) |
| anonymous use (App Review's "works without an account") | anonymous is a first-class tier — `/v1/chat` never returns 401 ([`auth.js:56`](../src/middleware/auth.js#L56)) |
| no CORS ceremony | the origin gate only fires when an `Origin` header is sent; `URLSession` sends none ([`cors.js:20`](../src/middleware/cors.js#L20)) |
| an offline exam | the whole bank is one static file, [`quiz.json`](../public/assets/data/quiz.json) — bundle it |
| Pro recognition without billing code | [`GET /v1/me`](../src/billing/routes.js#L346) returns `plan` for a Firebase Bearer token |

**v1 requires zero server changes.** The one server route this whole track ever asks for
before billing is an account-deletion endpoint — now landed as
[`POST /v1/account/delete`](../src/billing/routes.js); the app *uses* it in v1.x, not v1.

---

## What v1 is — and is not

| In v1 | Why |
|---|---|
| Streamed bilingual chat with the full grounding contract (badge, § cite chips, verbatim sources, suggestions, feedback 👍/👎, exam mode) | the product's spine; all server-backed today |
| Mock exam + practice, fully offline from a bundled `quiz.json` | baseline utility with no network — and App Review likes apps that do something on first launch |
| Optional **email/password sign-in** to an *existing* captadel.com account; Pro honoured read-only via `/v1/me` | the load-bearing scope call — see below |
| 402 → a paywall **signpost** ("manage your plan on captadel.com"), no purchase UI | quota is the paywall trigger; selling in-app is v2 |
| Voice in/out (`SFSpeechRecognizer` / `AVSpeechSynthesizer`) | parity with the web's browser-native voice |

| Not in v1 | Reason → phase |
|---|---|
| In-app purchase / subscription | Apple 3.1.1: digital subscriptions must use StoreKit; Moyasar can never be used in-app for digital content → **v2** |
| Google sign-in | offering any third-party login triggers Apple 4.8 (Sign in with Apple required) → both land together in **v1.x** |
| Sign in with Apple | not required while no third-party login is offered; needs `apple.com` OAuth provider config in Firebase → **v1.x** |
| In-app account creation | triggers Apple 5.1.1(v) (account deletion required); the backend route (`POST /v1/account/delete`) is live — the *client* work lands in **v1.x** |
| Push notifications, offline chat, Android | out of scope; no server support, no commitment |

**The load-bearing call: v1 sign-in is email/password only, to accounts created on the
web.** That single decision defers every Apple auth gate (4.8, 5.1.1(v)) out of v1 while
still letting a paying web subscriber be Pro in the app. Sign-in stays optional — the
anonymous path is the same first-class path the website ships.

---

## Architecture

One app target plus a local Swift package, mirroring the split that already works on the
web: [`chat-core.js`](../public/assets/js/chat-core.js) and
[`exam-core.js`](../public/assets/js/exam-core.js) are DOM-free, dependency-free, and
unit-tested — the app ports them near-literally as its model layer and keeps UI dumb.

```
Captain-Adel-iOS/
  App/                     SwiftUI app target (iOS 17+, @Observable)
    ChatView               transcript, streaming bubble, badge, § chips, source sheet,
                           suggestion chips, action bar, paywall + backoff banners
    ExamView               home (exam ⇄ practice) · question + palette · review · results
    SettingsView           language override, sign-in (email only), plan line from /v1/me
    CaptainFigure          optional — the 7-state figure (protocol port, not the SVG)
  AdelCore/                local Swift package — no UI imports, fully unit-tested
    AdelAPI                Codable models (lenient decode), endpoints, headers, session id
    AdelSSE                the POST-SSE stream parser (the one hard bit, below)
    AdelChatCore           markdown allow-list policy, § cite tokens, kind→badge mapping,
                           bilingual error copy, turn ids
    AdelExamCore           the exam engine port: shuffles, scoring, snapshots, prompts
```

Decisions, each with its one-line reason:

- **iOS 17+, SwiftUI, `@Observable`** — RTL mirroring, Dynamic Type and String Catalogs
  come free; no legacy surface to carry.
- **Firebase iOS SDK for Auth only.** Firestore stays closed to clients by design —
  [`firestore.rules`](../firestore.rules) is deny-all; plan/quota come **only** from
  `/v1/me`, exactly like the web ([`auth.js:5`](../public/assets/js/auth.js#L5)).
- **Persistence is Codable files + `UserDefaults`, not SwiftData.** The web persists a
  60-turn transcript and a versioned exam-resume snapshot
  ([`chat.js:328`](../public/assets/js/chat.js#L328),
  [`exam.js:86`](../public/assets/js/exam.js#L86)); porting `snapshot`/`validSnapshot`
  semantics to plain Codable keeps the validation behaviour identical and testable.
- **`AdelCore` tests mirror the JS suites** ([`test/chat-core.test.js`](../test/chat-core.test.js),
  [`test/exam-core.test.js`](../test/exam-core.test.js)) case for case, so the port can be
  proven equivalent, not assumed.
- **The animated Captain is optional.** Port the protocol, not the SVG: 7 states
  (`idle · listening · thinking · talking · grounded · salute · error`) with decay timings
  ([`adel-character.js:26`](../public/assets/js/adel-character.js#L26)). Emit the state
  events from ChatView from day one; mounting a figure on them can wait.

### The SSE client — the one genuinely hard bit

No off-the-shelf EventSource client fits: this stream is a **POST** (EventSource is
GET-only), and the wire format is raw `data:<json>` frames with **no `event:` names, no
`id:`** ([`server.js:207`](../src/server.js#L207)). The client is a small
`URLSessionDataDelegate` that buffers bytes, splits on newlines, keeps `data:` lines, and
feeds a four-event state machine:

| Frame | Client rule |
|---|---|
| `{type:"token", delta}` | append `delta` to the provisional answer |
| `{type:"reset"}` | **discard everything streamed so far.** Fires on provider fallback *or* when an agentic tool round replaced interim text ([`answer.js:191`](../src/brain/answer.js#L191)) — the rule is unconditional |
| `{type:"final", …}` | terminal. `final.answer` is authoritative — **replace** the streamed buffer with it (the server holds back a trailer window, so the buffer is never byte-complete: [`answer.js:202`](../src/brain/answer.js#L202)); render `kind`, `sources`, `grounding`, `suggestions`, `meta` only now — they never arrive incrementally |
| `{type:"error"}` | engine failure mid-stream (HTTP status was already 200) |
| `data: [DONE]` | stream terminator. **A stream that ends without `final` is an error**, `[DONE]` or not |

Two pre-stream rules: 400/402/413/429 are rejected **before** the SSE branch and arrive as
plain JSON — branch on HTTP status and `Content-Type` before opening the parser
([`server.js:126`](../src/server.js#L126)). And the first request after a cold start pays
for a resident BM25 index build ([`server.js:289`](../src/server.js#L289)) — use a
generous (60 s+) request timeout and show a "connecting" state, not a spinner that gives up.

---

## API binding

Contract version **1**, echoed on every `/v1/chat` response as `X-Adel-Api-Version`
([`server.js:116`](../src/server.js#L116)). The shape is **additive** — decode leniently,
tolerate unknown fields, require nothing beyond `answer` and `sources[].{citation,url}`.

### Request — `POST /v1/chat` (`?stream=1` for SSE)

| Field | Rule | Anchor |
|---|---|---|
| `message` | required; server cleans + hard-caps at 4000 chars | [`guards.js:18`](../src/brain/guards.js#L18) |
| `history` | `[{role:'user'\|'model', text}]`; server keeps the last 24 | [`guards.js:19`](../src/brain/guards.js#L19) |
| **`session`** | **the field is `session`, never `sessionId`.** `^[A-Za-z0-9._-]{8,128}$` — anything else is silently dropped; body field beats the `X-Adel-Session` header | [`server.js:91`](../src/server.js#L91) |
| `product` | `'captadel'` | [`tenants.js`](../src/brain/tenants.js) |
| `mode` | `'exam'` flips the oral-checkride examiner framing; anything else is ignored | [`server.js:109`](../src/server.js#L109) |

There is **no `lang` field**. Language is detected server-side from the message text
(Arabic character ratio, [`route.js`](../src/brain/route.js)) — to get an Arabic answer,
send the Arabic question. This is why suggestion chips carry both `q` and `qAr` and the
app must send the `qAr` text when the UI language is Arabic
([`chat.js:296`](../public/assets/js/chat.js#L296)).

Auth is `Authorization: Bearer <Firebase ID token>` and **never blocks** — missing,
expired or malformed tokens silently downgrade to anonymous
([`auth.js:56`](../src/middleware/auth.js#L56)). Attach the token when signed in; on any
token error, send unauthenticated and carry on (the web does exactly this,
[`chat.js:357`](../public/assets/js/chat.js#L357)).

> **Never embed `X-Adel-Api-Key` in the binary.** It is the server-to-server trusted tier
> ([`apikey.js:24`](../src/middleware/apikey.js#L24)): it skips the rate limiter *and* the
> quota meter, it is extractable from any shipped app, and it grants unmetered model
> spend. The iOS app is an ordinary anonymous/Bearer client, full stop.

### Response → UI binding

| Field | Drives | Rule |
|---|---|---|
| `kind` | the grounding badge | 3 visible states — `grounded` (sage) · `partial` (amber) · `refusal` (amber, distinct) — and `na` renders **no badge**. Teal stays the link/focus colour only; it never means "verified" |
| `refusalClass` | the refusal card's class tag + [`refusal-taxonomy.md`](refusal-taxonomy.md) copy | non-null only when `kind === 'refusal'`; refusals get verify-at-gaca.gov.sa actions ([`chat-core.js:113`](../public/assets/js/chat-core.js#L113)) |
| `grounding.state/mode/resolved/unresolved` | the verify stamp | v1 renders the stamp + corpus version; the per-claim evidence rail is v2 data — don't render it |
| `sources[]` (≤3, [`grounding.js:38`](../src/brain/grounding.js#L38)) | the source sheet | `verbatim` (≤600 chars) + `corpusVersion` as the as-of line; `url` is often **relative** (`library.html#91.155`) — resolve against the site origin before opening |
| `suggestions[{q,qAr,en,ar}]` | "keep exploring" chips | label from `en`/`ar` by UI language; send `q`/`qAr` accordingly ([`followups.js:21`](../src/brain/followups.js#L21)) |
| `meta.provider` | the feedback payload | pass through to `/v1/feedback` |
| `meta.toolCalls[]` | worked flight-computer steps | `{name, args, result:{inputs, steps[], result}}` — the web never rendered these; the app should ([`gemini.js:118`](../src/brain/providers/gemini.js#L118)) |

Answer text is Markdown, but the renderer is a **policy, not a library** — see the porting
map.

### Errors, limits, headers

| Status | Body | App behaviour |
|---|---|---|
| 400 | `message_required` / `bad_request` | validation bug — fix, don't retry |
| 402 | `quota_exceeded` + `limit`, `upgrade`, `Retry-After` (seconds to the KSA-midnight reset, [`quota-core.js:17`](../src/quota/quota-core.js#L17)) | the paywall sheet. This is the monetization trigger — and in v1 it **signposts** captadel.com, it does not sell |
| 413 | `payload_too_large` (body > 64 KiB, [`config.js:41`](../src/config.js#L41)) | never rely on server truncation — trim history client-side (~10 turns is safe) |
| 429 | `rate_limited` + `scope`, `retryAfter`, `Retry-After` | backoff banner with honest copy; auto-retry after `retryAfter` |
| 502 / stream `{type:'error'}` | `engine_error` | bilingual error bubble, offer retry |

The rate limiter evaluates **ip (40/10 min) and burst (6/30 s) before session (24/10 min)**
([`ratelimit.js:29`](../src/brain/ratelimit.js#L29)). On cellular, carrier-grade NAT puts
many users behind one IP, so `scope:'ip'` 429s will happen through no fault of the user —
design the copy for that ("busy right now"), don't blame the person. Sending a stable
`session` id gives each install its own budget but does not exempt it from the shared IP
rules. `X-Adel-Quota-Remaining` appears only when the tier is metered and allowed —
**absence ≠ 0**; treat it as an optional pill.

### Launch and account calls

- `GET /v1/config` ([`routes.js:371`](../src/billing/routes.js#L371)) at launch:
  `{launchMode, billingEnabled, authEnabled, moyasarPublishableKey, freeDaily, anonDaily,
  period}`. `authEnabled:false` → hide sign-in entirely (the backend ships dark until
  Firebase env is set). `launchMode:true` → everyone is Pro, hide the paywall.
- `GET /v1/me` ([`routes.js:346`](../src/billing/routes.js#L346)) with the Bearer token:
  200 either way — `{signedIn:false, launchMode}` or `{signedIn, uid, email, plan,
  launchMode, quota:{remaining, limit}|null, period}`. Entitlements are cached in-process
  for ~60 s ([`auth.js:24`](../src/middleware/auth.js#L24)) — after a web-side purchase,
  Pro can lag by up to a minute; poll gently, don't panic.
- `POST /v1/feedback` `{rating:'up'|'down', turnId, provider}`
  ([`server.js:244`](../src/server.js#L244)) — fire-and-forget; `turnId` is
  **client-minted** per turn. PDPL-safe by construction: the server logs only those three
  fields, never the question or answer.
- `GET /health` for a reachability probe.

---

## Porting map (web → Swift, near-literal)

| Web (tested reference) | Swift home | The rule being ported |
|---|---|---|
| `esc` / `safeUrl` / `inline` / `md` ([`chat-core.js:52`](../public/assets/js/chat-core.js#L52)) | `AdelChatCore.render` → `AttributedString` | **the markdown allow-list policy**: escape everything, then re-introduce only `**bold**`, `[label](url)`, `-`/`*` lists, paragraphs; URLs pass a scheme filter (`http(s)`, `mailto`, relative) or become inert. Model output is untrusted — do **not** swap in a general markdown renderer |
| `citeTokens` ([`chat-core.js:65`](../public/assets/js/chat-core.js#L65)) | cite chip attribute runs | every `§91.155(a)(2)` becomes a tappable chip, **LTR-isolated** inside RTL text; tapping snaps to the matching source with the 3-tier match (exact → stem → prefix, [`chat.js:248`](../public/assets/js/chat.js#L248)) |
| `GBADGE` / `badgeHtml` ([`chat-core.js:94`](../public/assets/js/chat-core.js#L94)) | `Kind` enum → badge view | grounded/partial/refusal + silent `na` |
| `sessionId` ([`chat-core.js:26`](../public/assets/js/chat-core.js#L26)) | `UserDefaults`-backed id | any stable value matching the session regex; no PII — it exists for rate-limit bucketing |
| `newTurnId` ([`chat-core.js:36`](../public/assets/js/chat-core.js#L36)) | per-turn UUID string | correlates 👍/👎 without logging content |
| bilingual `t(en, ar)` + error copy ([`chat-core.js:16`](../public/assets/js/chat-core.js#L16)) | String Catalog | see i18n below |
| shuffles + answer remap ([`exam-core.js:55`](../public/assets/js/exam-core.js#L55)) | `AdelExamCore` | Fisher-Yates per question, answer index remapped — anti-memorisation |
| exam vs practice, palette, flags, review-before-submit ([`exam.js`](../public/assets/js/exam.js)) | `ExamView` | timed mock (25 q · 30 min · pass 75, from quiz.json's `exam` block with client defaults, [`exam-core.js:33`](../public/assets/js/exam-core.js#L33)) vs untimed topic-filtered practice with instant reveal |
| `snapshot` / `validSnapshot` ([`exam.js:86`](../public/assets/js/exam.js#L86)) | Codable resume file | versioned; validate on load, fail loudly on mismatch |
| topic breakdown ([`exam-core.js:104`](../public/assets/js/exam-core.js#L104)) | results view | weakest-first ordering — *the ordering IS the study advice* |
| `buildAskPrompt` ([`exam-core.js:163`](../public/assets/js/exam-core.js#L163)) | per-question "Ask Captain Adel" | streams a grounded explanation inline via the same `/v1/chat` path; **cache per question** so re-renders never re-spend quota. Port fix: attach the Bearer token here too — the web forgets to ([`exam.js:740`](../public/assets/js/exam.js#L740)), so Pro users burn anon quota on explanations |
| `buildDebriefPrompt` ([`exam-core.js:193`](../public/assets/js/exam-core.js#L193)) | results → chat handoff | ≤1800 chars naming score, weakest topics, missed questions; in-app this is a primed prompt, not a `?q=` URL |
| bank loading + validation ([`exam-core.js:19`](../public/assets/js/exam-core.js#L19)) | bundled `quiz.json` | ship the bank in the app (offline exams); mirror the strict validation. **Render `cite` text only — never `citeUrl`**: the bank's own note says the web exam never reads it (the values are Fly GACA app paths that 404 on captadel) |
| voice ([`chat.js:110`](../public/assets/js/chat.js#L110)) | `AVSpeechSynthesizer` / `SFSpeechRecognizer` | strip markdown before speaking; `§` is spoken "section" / «مادة»; STT language follows the UI language |
| character states ([`chat.js:377`](../public/assets/js/chat.js#L377)) | a `CaptainState` publisher | listening on focus, thinking on send, talking per token (self-sustaining), grounded/salute/error on final — decay timings from [`adel-character.js:29`](../public/assets/js/adel-character.js#L29) |

---

## i18n and RTL

- **There is no string catalog to import.** Web strings live in `data-en`/`data-ar`
  attributes and inline `t(en, ar)` calls ([`i18n.js`](../public/assets/js/i18n.js)) — the
  port starts with an extraction pass into an Xcode **String Catalog** (`ar` as the
  development language, matching the site's Arabic-first authoring).
- Follow the system locale, with an in-app override (the `captadel:lang` equivalent —
  iOS also gives per-app language in Settings for free once the catalog exists).
- RTL layout is SwiftUI-automatic **except the one rule that isn't**: regulation
  identifiers — `§91.155(a)(2)`, corpus versions, callsign-like tokens — must stay
  **LTR-isolated inside Arabic text**. The web wraps every one in `<bdi dir="ltr">`; the
  app ports that as explicit bidi-controlled runs in its cite chips. This is the
  RTL-scrambling risk called out in [`data-contract.md`](data-contract.md), not a styling
  preference.
- **Known content gap, stated honestly:** the 174-question bank is authored in English —
  only bank *titles* carry `titleAr`, and `buildAskPrompt` already localises only the
  framing ([`exam-core.js:163`](../public/assets/js/exam-core.js#L163)). v1 shows English
  questions under bilingual chrome, exactly like the web. Bilingual bank authoring is a
  content roadmap item — **no silent machine translation.**

---

## App Store gates and compliance

| Gate | v1 answer | Changes in |
|---|---|---|
| 3.1.1 — digital subscriptions must use IAP | v1 sells nothing. 402 → a signpost sheet naming the web plans (SAR 35/mo · 299/yr as facts, no purchase link, no steering copy). Moyasar is web-only forever — the [`/.well-known` Apple Pay file](../public/.well-known/README.md) is Moyasar's *browser* domain verification, not StoreKit | **v2**: StoreKit 2 + a new server settle route (App Store Server API + server notifications) writing the same entitlement shape as Moyasar with `store:'APPSTORE'` ([`entitlements-core.js:5`](../src/billing/entitlements-core.js#L5)) |
| 4.8 — Sign in with Apple | not triggered: v1 offers no third-party login (email/password only) | **v1.x**: Google + `apple.com` OAuth provider land together |
| 5.1.1(v) — account deletion | not triggered: no in-app account creation in v1 | **v1.x**: in-app creation ships **with** the authed delete endpoint — **landed: [`POST /v1/account/delete`](../src/billing/routes.js)** purges Firestore + the Auth user |
| PDPL / in-Kingdom inference | unchanged: the app calls the same KSA Cloud Run service ([`RUNBOOK-captadel-deploy.md`](RUNBOOK-captadel-deploy.md)); no new data residency surface | — |
| App Privacy labels | honest and small: chat text is processed in-Kingdom and not used for tracking; feedback logs only `{rating, turnId, provider}` ([`server.js:244`](../src/server.js#L244)); no ads, no tracking → **no ATT prompt** | — |
| `PrivacyInfo.xcprivacy` | required-reason entries for `UserDefaults`; list no tracking domains | — |
| Export compliance | standard HTTPS-only exemption | — |
| Works without an account | yes by construction — anonymous is the same first-class path the website ships | — |

---

## Phasing (never ship proof you don't have)

| Phase | Ships | Backed by | Server work |
|---|---|---|---|
| **0 — spike** | the `AdelSSE` parser + one streamed grounded turn, on TestFlight | production `/v1/chat` | none |
| **v1 — App Store** | chat + mock exam + optional email sign-in + paywall signpost | the API exactly as deployed today | **none** |
| **v1.x — accounts** | Google + Sign in with Apple, in-app account creation | Firebase `apple.com` provider config | **`POST /v1/account/delete`** (already landed) |
| **v2 — billing** | StoreKit 2 subscription, purchase-restores, paywall that sells | App Store Server API | a settle route + server-notification handler writing `entitlement{store:'APPSTORE'}`; mind the ~60 s `/v1/me` entitlement cache in the post-purchase UX ([`auth.js:24`](../src/middleware/auth.js#L24)) |

The degradation rule mirrors the data contract's: every phase renders only fields and
states the deployed server can actually produce. Nothing in v1's UI depends on v1.x or v2
server work existing.

---

## Non-goals

- No speculative backend work in v1 — the API is consumed **exactly as deployed**.
- No cross-platform framework; no Android commitment implied by this plan.
- No push notifications, no offline chat, no on-device model.
- No client-side Firestore, ever ([`firestore.rules`](../firestore.rules) stays deny-all).
- No new response fields requested from the brain; no `X-Adel-Api-Version` bump.

---

## Verification and follow-on

- **Equivalence, not vibes:** `AdelChatCore`/`AdelExamCore` unit tests mirror
  [`test/chat-core.test.js`](../test/chat-core.test.js) and
  [`test/exam-core.test.js`](../test/exam-core.test.js) case for case.
- **Recorded stream fixtures** — one each of grounded / partial / refusal / `na`, plus
  `reset`-bearing streams and a stream that dies without `final` — as `AdelSSE` test
  vectors. Recorded by [`scripts/record-sse-fixtures.js`](../scripts/record-sse-fixtures.js):
  the real server pipeline (routing → retrieval → grounding → SSE serialization) with
  stubbed providers — byte-exact, deterministic, key-free, and regression-guarded in CI by
  [`test/sse-fixtures.test.js`](../test/sse-fixtures.test.js). A deliberate improvement
  over live-API capture, which would be nondeterministic and need production keys.
- **TestFlight against production** captadel.com from Phase 0 — no staging fork.
- This repo's gates stay green — `npm run smoke && npm run test:unit && npm run eval:dry` —
  and the unit run now includes the fixture cross-check above.

---

## Risks this plan closes

- **3.1.1 rejection** — v1 sells nothing; the paywall signposts, StoreKit waits for v2.
- **Sign-in-with-Apple surprise** — email-only v1 never triggers 4.8.
- **Streamed-text corruption** — the `reset`-discard rule and *final-replaces-stream* are
  spelled out as unconditional client law.
- **Cellular 429 confusion** — shared-IP rate limits are designed for, with honest copy.
- **Markdown injection** — the web's allow-list policy is ported as policy; no
  general-purpose renderer ever touches model output.
- **RTL cite scrambling** — the `<bdi dir="ltr">` rule survives the port as bidi-isolated
  attributed runs.
- **Entitlement drift** — `/v1/me` is the single source of plan truth; Firestore stays
  closed; the 60 s cache lag is a documented UX fact, not a bug report.
- **Dead exam links** — `citeUrl` is never rendered; cite text + "Ask Captain Adel" is
  the tap action.
- **Trusted-key leakage** — `X-Adel-Api-Key` is named as a never-ship.
- **"Wrapper" review risk** — moot by decision, and the offline exam + native voice give
  the app obvious non-web value on day one.
