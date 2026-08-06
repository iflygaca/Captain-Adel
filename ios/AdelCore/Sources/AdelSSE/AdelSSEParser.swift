// AdelSSEParser.swift — the transport-agnostic incremental SSE frame parser.
//
// COMPILE-UNVERIFIED: authored without a Swift toolchain (see ios/README.md).
// Mirrors public/assets/js/chat-core.js:139-157 line for line — parser law:
//
//   • buffer BYTES, split on single \n            (the server writes `data: {json}\n\n`;
//     a UTF-8 continuation byte can never be 0x0A, so an Arabic scalar split
//     across network chunks survives — decoding happens per complete line)
//   • trim each line (JS .trim())
//   • lines not starting with "data:" are skipped  (eats keep-alive `:` lines
//     and the blank inter-frame lines)
//   • payload = drop 5 chars, trim                 (so `data:[DONE]` with no
//     space still terminates)
//   • payload == "[DONE]" → emit .done and go INERT — nothing after [DONE]
//     is ever yielded
//   • malformed JSON payloads are swallowed silently
//
// No Foundation networking here — AdelChatTransport owns URLSession, so the
// parser and assembler test without ever touching the network.

import Foundation
import AdelAPI

public enum AdelSSEFrame: Equatable, Sendable {
    case event(AdelStreamEvent)
    /// The literal `data: [DONE]` terminator.
    case done
}

public struct AdelSSEParser {
    private var buffer: [UInt8] = []
    private var inert = false

    public init() {}

    /// Feed a chunk of raw bytes from the wire; returns every frame completed
    /// by this chunk (possibly none). After `[DONE]`, always returns [].
    public mutating func feed(_ bytes: some Sequence<UInt8>) -> [AdelSSEFrame] {
        guard !inert else { return [] }
        buffer.append(contentsOf: bytes)
        var frames: [AdelSSEFrame] = []
        while let newline = buffer.firstIndex(of: 0x0A) {
            let lineBytes = Array(buffer[buffer.startIndex..<newline])
            buffer.removeSubrange(buffer.startIndex...newline)
            guard let raw = String(bytes: lineBytes, encoding: .utf8) else { continue }
            let line = raw.trimmingCharacters(in: .whitespacesAndNewlines)
            guard line.hasPrefix("data:") else { continue }
            let payload = String(line.dropFirst(5)).trimmingCharacters(in: .whitespacesAndNewlines)
            if payload == "[DONE]" {
                inert = true
                buffer.removeAll()
                frames.append(.done)
                return frames
            }
            if let event = AdelStreamEvent.decode(payload) {
                frames.append(.event(event))
            }
        }
        return frames
    }

    /// Convenience for tests and string sources: feeds the UTF-8 bytes.
    public mutating func feed(_ text: some StringProtocol) -> [AdelSSEFrame] {
        feed(Array(text.utf8))
    }
}
