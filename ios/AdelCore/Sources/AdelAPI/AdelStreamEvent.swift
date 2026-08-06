// AdelStreamEvent.swift — the /v1/chat SSE event union.
//
// COMPILE-UNVERIFIED: authored without a Swift toolchain (see ios/README.md).
// Mirrors the event grammar at src/brain/answer.js:190-193 plus the HTTP-layer
// error frame at src/server.js:218:
//
//   {type:"token", delta}   append to the provisional answer
//   {type:"reset"}          DISCARD everything streamed so far (unconditional:
//                           fires on provider fallback AND agentic tool rounds)
//   {type:"final", ...}     terminal payload — replaces the streamed buffer
//   {type:"error", error}   engine failure mid-stream (HTTP status was 200)
//
// An unknown `type` decodes to nil and is skipped — the contract is additive.

import Foundation

public enum AdelStreamEvent: Equatable, Sendable {
    case token(delta: String)
    case reset
    case final(AdelFinalPayload)
    case error(code: String)

    private struct Probe: Decodable {
        let type: String?
        let delta: String?
        let error: String?
    }

    /// Decode one `data:` payload. Returns nil for malformed JSON or an
    /// unknown frame type — both are silently skipped, exactly like the web
    /// client (public/assets/js/chat-core.js:154).
    public static func decode(_ json: String) -> AdelStreamEvent? {
        guard let data = json.data(using: .utf8) else { return nil }
        let decoder = JSONDecoder()
        guard let probe = try? decoder.decode(Probe.self, from: data) else { return nil }
        switch probe.type {
        case "token":
            return .token(delta: probe.delta ?? "")
        case "reset":
            return .reset
        case "final":
            guard let payload = try? decoder.decode(AdelFinalPayload.self, from: data) else { return nil }
            return .final(payload)
        case "error":
            return .error(code: probe.error ?? "engine_error")
        default:
            return nil
        }
    }
}
