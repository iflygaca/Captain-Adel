<div align="center">

# 📱 Captain Adel iOS — `AdelCore` Swift Package & Spike
### Zero-Dependency Native Swift SDK & SSE Streaming Parser for iOS
#### حزمة سويفت الأصلية لمدرّب الطيران الذكي · معالجة البث اللحظي · دعم بيئة iOS

<p align="center">
  <img src="https://img.shields.io/badge/Made%20in-Saudi%20Arabia-006C35?style=for-the-badge&labelColor=0a0e12" alt="صنع في السعودية" />
  <img src="https://img.shields.io/badge/Swift-5.9%2B-F05138?style=for-the-badge&logo=swift&logoColor=white&labelColor=0a0e12" alt="Swift 5.9+" />
  <img src="https://img.shields.io/badge/iOS-17.0%2B-000000?style=for-the-badge&logo=apple&logoColor=white&labelColor=0a0e12" alt="iOS 17+" />
  <img src="https://img.shields.io/badge/Dependencies-Zero-0D96F6?style=for-the-badge&labelColor=0a0e12" alt="Zero Dependencies" />
</p>

</div>

---

## 🧭 Package Architecture

`AdelCore` is a standalone Swift Package Manager (SPM) library designed for seamless integration of Captain Adel's streaming AI into native iOS applications.

```
AdelCore/                      # Standalone Swift Package (Zero external dependencies)
├── Sources/
│   ├── AdelAPI/              # Wire models, contract constants, lenient Codable decoders
│   │   ├── AdelKind.swift    # Grounding enum (.grounded, .refusal, .partial, .na)
│   │   ├── AdelMessage.swift # Chat message representations
│   │   └── AdelPayload.swift # Final response schema with source citations
│   └── AdelSSE/              # Incremental SSE parser, turn assembler, network transport
│       ├── AdelChatTransport.swift # URLSession streaming POST client
│       ├── AdelSSEParser.swift     # Byte-exact line/event parser
│       └── AdelTurnAssembler.swift # Stream state machine and token accumulator
└── Tests/
    └── AdelSSETests/         # Parity test suites & committed wire fixtures
        ├── FixturePlaybackTests.swift
        └── Fixtures/         # Byte-exact test captures from production Node backend
```

---

## ⚡ Swift Package Integration

### 1. Run Unit Tests & Fixture Playback (macOS CLI)
```bash
cd ios/AdelCore
swift test
```
The test suite includes `FixturePlaybackTests`, which replays committed wire fixtures through the parser and verifies byte-for-byte equivalence against the Node.js server contract.

### 2. Add Local Package in Xcode
1. In Xcode: **File → Add Package Dependencies… → Add Local…**
2. Select the `ios/AdelCore` directory.
3. Link both **`AdelAPI`** and **`AdelSSE`** to your iOS app target.

---

## 💻 SwiftUI Implementation Example

```swift
import SwiftUI
import AdelAPI
import AdelSSE

struct CaptainAdelChatView: View {
    @State private var inputText = ""
    @State private var streamText = ""
    @State private var groundingKind: AdelKind?
    @State private var isStreaming = false
    @State private var sources: [AdelSource] = []

    private let transport = AdelChatTransport() // Connects to production captadel.com

    var body: some View {
        NavigationStack {
            VStack(spacing: 16) {
                ScrollView {
                    VStack(alignment: .leading, spacing: 12) {
                        if !streamText.isEmpty {
                            Text(streamText)
                                .font(.body)
                                .textSelection(.enabled)
                        }

                        if let kind = groundingKind {
                            HStack {
                                Text(kind.rawValue.uppercased())
                                    .font(.caption.bold())
                                    .padding(.horizontal, 8)
                                    .padding(.vertical, 4)
                                    .background(kind == .grounded ? Color.green.opacity(0.2) : Color.orange.opacity(0.2))
                                    .clipShape(Capsule())
                                Spacer()
                            }
                        }

                        ForEach(sources, id: \.url) { source in
                            Link(destination: URL(string: source.url)!) {
                                Label(source.citation, systemImage: "book.closed")
                                    .font(.caption)
                            }
                        }
                    }
                    .padding()
                }

                HStack {
                    TextField("Ask Captain Adel about GACAR...", text: $inputText)
                        .textFieldStyle(.roundedBorder)
                    
                    Button("Send") {
                        Task { await sendMessage() }
                    }
                    .disabled(inputText.isEmpty || isStreaming)
                }
                .padding()
            }
            .navigationTitle("Captain Adel")
        }
    }

    private func sendMessage() async {
        let query = inputText
        inputText = ""
        streamText = ""
        groundingKind = nil
        sources = []
        isStreaming = true

        do {
            let session = "ios-" + UUID().uuidString
            for try await event in transport.stream(message: query, session: session) {
                switch event {
                case .token(let delta):
                    streamText += delta
                case .reset:
                    streamText = ""
                case .final(let payload):
                    streamText = payload.answer
                    groundingKind = payload.kind
                    sources = payload.sources
                case .error:
                    break
                }
            }
        } catch {
            streamText = "Connection error: \(error.localizedDescription)"
        }
        isStreaming = false
    }
}
```

---

## 🛡️ License

Distributed under the **MIT License**.

---

<div align="center">

<sub>🇸🇦 صنع في السعودية · Made in Saudi Arabia</sub>

</div>
