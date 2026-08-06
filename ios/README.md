# Captain Adel iOS — Phase-0 spike (`AdelCore`)

> [!WARNING]
> **Compile-unverified.** Everything under `ios/` was authored in the
> Captain-Adel repo on Linux, where no Swift toolchain exists (and the network
> policy blocks installing one). The code has been reviewed against the JS
> reference implementations it mirrors, and its **fixtures are CI-verified**
> (`test/sse-fixtures.test.js` replays them with the shipped web parser on
> every push) — but no Swift compiler has seen it. Expect `swift test` to
> surface trivial fixes on first contact. That is step 1 below, not a surprise.

This directory is the in-repo half of **Phase 0** from
[`docs/ios-app-plan.md`](../docs/ios-app-plan.md): the `AdelSSE` POST-stream
parser and the lenient `AdelAPI` models, with tests that mirror the repo's own
stream suites (`test/answer-stream.test.js`, `test/chat-core.test.js`,
`test/server-chat.test.js`) case for case, plus byte-exact wire fixtures
recorded from the real server pipeline. The remaining half — an app target on
TestFlight — needs a Mac.

```
AdelCore/                      Swift package (SPM, zero dependencies)
  Sources/AdelAPI/             contract constants, event union, lenient Codable models
  Sources/AdelSSE/             the incremental SSE parser, the turn assembler,
                               and the only networking file (AdelChatTransport)
  Tests/AdelSSETests/          mirrored test suites + Fixtures/ (committed wire vectors)
```

## Prerequisites

- macOS 14+ with Xcode 15+ (Swift 5.9 toolchain).
- An Apple Developer Program membership for the TestFlight step.

## Step 1 — prove the port (no simulator needed)

```sh
cd ios/AdelCore
swift test
```

This runs the whole mirrored suite on macOS, including `FixturePlaybackTests`,
which replays every committed fixture through the parser + assembler and checks
it against `Tests/AdelSSETests/Fixtures/manifest.json` — the same manifest the
Node gate asserts. **Green here is the definition of "the port is proven
equivalent."** Fix any compiler complaints first (see the warning above); the
tests are the spec.

## Step 2 — the app target

1. In Xcode: **File → New → Project → iOS App** — name `CaptainAdel`,
   SwiftUI, iOS 17 minimum. (Per the plan doc the app eventually lives in its
   own `Captain-Adel-iOS` repo; for the spike a local project is fine.)
2. **File → Add Package Dependencies… → Add Local…** and pick `ios/AdelCore`.
3. Link both products, `AdelAPI` and `AdelSSE`, to the app target.

## Step 3 — `ChatSpikeView` (one streamed grounded turn)

The spike's whole UI — a hardcoded question, a streamed answer, a kind badge:

```swift
import SwiftUI
import AdelAPI
import AdelSSE

struct ChatSpikeView: View {
    @State private var text = ""
    @State private var kind: AdelKind?
    @State private var phase = "idle"   // idle · connecting · streaming · done · error

    private let transport = AdelChatTransport()   // production captadel.com
    private let question = "What are the VFR weather minima in controlled airspace?"

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 12) {
                Text(question).font(.headline)
                if phase == "connecting" {
                    Label("Connecting to the tower…", systemImage: "antenna.radiowaves.left.and.right")
                        .foregroundStyle(.secondary)   // cold start builds the BM25 index
                }
                if let kind {
                    Text(kind.rawValue.uppercased())
                        .font(.caption.bold())
                        .padding(.horizontal, 8).padding(.vertical, 3)
                        .background(kind == .grounded ? .green.opacity(0.2) : .orange.opacity(0.2))
                        .clipShape(Capsule())
                }
                Text(text)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding()
        }
        .task { await send() }
    }

    private func send() async {
        phase = "connecting"
        do {
            let session = "ios-spike-" + UUID().uuidString
            for try await event in transport.stream(message: question, session: session) {
                switch event {
                case .token(let delta): phase = "streaming"; text += delta
                case .reset: text = ""                    // unconditional — wipe the bubble
                case .final(let payload):                 // authoritative — replace the buffer
                    text = payload.answer
                    kind = payload.kind
                case .error: break                        // the stream's throw carries it
                }
            }
            phase = "done"
        } catch {
            phase = "error"
            text = "Stream failed: \(error)"
        }
    }
}
```

Point `AdelChatTransport()` at production (the default). There is no staging —
and no key: the app is an ordinary anonymous client. Never embed
`X-Adel-Api-Key`.

## Step 4 — TestFlight

Signing & Capabilities → your team; **Product → Archive**; distribute to an
internal TestFlight group.

## Definition of done

One streamed, grounded answer rendered on a device from TestFlight. Then tick
the **Phase 0 spike** box in [`ROADMAP.md`](../ROADMAP.md) (📱 Mobile track).

## Regenerating the fixtures

From the repo root, on any machine with Node 20 (no keys, no network):

```sh
npm run fixtures:sse
```

Review the git diff — the capture is deterministic, so an unexpected diff means
the stream contract moved. `test/sse-fixtures.test.js` guards the committed set
in CI; never regenerate in CI.

## Extraction note

`ios/AdelCore/` references nothing outside itself — fixtures ride along inside
the test bundle — so the directory copies into the future `Captain-Adel-iOS`
repo unchanged.
