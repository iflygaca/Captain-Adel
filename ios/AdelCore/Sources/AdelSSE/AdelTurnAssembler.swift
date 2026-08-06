// AdelTurnAssembler.swift — the client-side state machine for one chat turn.
//
// COMPILE-UNVERIFIED: authored without a Swift toolchain (see ios/README.md).
// Client law, each rule with its server anchor (docs/ios-app-plan.md §SSE):
//
//   1. `token` appends to the provisional text.
//   2. `reset` discards the provisional text UNCONDITIONALLY — it fires on
//      provider fallback and on agentic tool rounds alike (src/brain/answer.js:191).
//   3. `final` REPLACES the provisional text. The buffer is never byte-complete
//      because the server holds back an 80-char trailer window
//      (src/brain/answer.js:202) — replacement is mandatory, not cosmetic.
//   4. An `error` frame is terminal → AdelError.engineError.
//   5. A stream that ends without `final` is an error, `[DONE]` or not
//      → AdelError.endedWithoutFinal.
//   6. kind / sources / grounding / suggestions / meta are read only off
//      `final` — never incrementally.

import Foundation
import AdelAPI

public struct AdelTurnAssembler {
    /// What the UI renders while streaming. Provisional by definition —
    /// a `reset` may wipe it and `final` always replaces it.
    public private(set) var provisionalText = ""

    /// Set when a `reset` wiped streamed text; the UI clears its bubble.
    public private(set) var didReset = false

    public private(set) var finalPayload: AdelFinalPayload?
    public private(set) var sawDone = false
    private var errorCode: String?

    public init() {}

    public mutating func apply(_ frame: AdelSSEFrame) {
        switch frame {
        case .done:
            sawDone = true
        case .event(.token(let delta)):
            provisionalText += delta
        case .event(.reset):
            provisionalText = ""
            didReset = true
        case .event(.final(let payload)):
            finalPayload = payload
            provisionalText = payload.answer
        case .event(.error):
            errorCode = "engine_error"
        }
    }

    /// Call when the byte stream ends. Returns the authoritative payload or
    /// throws the turn's terminal error.
    public func finish() throws -> AdelFinalPayload {
        if errorCode != nil { throw AdelError.engineError }
        guard let payload = finalPayload else { throw AdelError.endedWithoutFinal }
        return payload
    }
}
