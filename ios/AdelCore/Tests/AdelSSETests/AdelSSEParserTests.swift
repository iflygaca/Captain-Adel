// AdelSSEParserTests.swift — mirrors test/chat-core.test.js:144-173 one-for-one,
// plus the byte-level cases the JS suite can't express.
//
// COMPILE-UNVERIFIED: authored without a Swift toolchain (see ios/README.md).

import XCTest
import AdelAPI
@testable import AdelSSE

final class AdelSSEParserTests: XCTestCase {

    // chat-core.test.js:144-155 — parses data: frames, stops at [DONE];
    // the frame after [DONE] is never yielded.
    func testParsesFramesAndStopsAtDone() {
        var parser = AdelSSEParser()
        let wire = "data: {\"type\":\"token\",\"delta\":\"Hello\"}\n\n"
            + "data: {\"type\":\"final\",\"answer\":\"Hello\",\"kind\":\"na\"}\n\n"
            + "data: [DONE]\n\n"
            + "data: {\"type\":\"token\",\"delta\":\"after\"}\n\n"
        let frames = parser.feed(wire)

        XCTAssertEqual(frames.count, 3)
        XCTAssertEqual(frames[0], .event(.token(delta: "Hello")))
        guard case .event(.final(let payload)) = frames[1] else {
            return XCTFail("second frame should be final")
        }
        XCTAssertEqual(payload.answer, "Hello")
        XCTAssertEqual(payload.kind, .na)
        XCTAssertEqual(frames[2], .done)

        // Inert after [DONE]: further feeds yield nothing.
        XCTAssertEqual(parser.feed("data: {\"type\":\"token\",\"delta\":\"x\"}\n\n"), [])
    }

    // chat-core.test.js:157-168 — a frame split across reads is buffered;
    // keep-alive `:` lines and malformed JSON are skipped silently.
    func testSplitFramesKeepAlivesAndMalformedSkipped() {
        var parser = AdelSSEParser()
        var frames = parser.feed("data: {\"type\":\"tok")            // split mid-frame
        XCTAssertEqual(frames, [])
        frames += parser.feed("en\",\"delta\":\"A\"}\n\n: keep-alive\n")
        frames += parser.feed("data: not-json\n\ndata: {\"type\":\"token\",\"delta\":\"B\"}\n\n")

        XCTAssertEqual(frames, [.event(.token(delta: "A")), .event(.token(delta: "B"))])
    }

    // chat-core.test.js:170-173 — end of stream without [DONE] just completes
    // at the parser level (the ASSEMBLER is what turns that into an error).
    func testEndWithoutDoneJustCompletes() {
        var parser = AdelSSEParser()
        let frames = parser.feed("data: {\"type\":\"token\",\"delta\":\"only\"}\n\n")
        XCTAssertEqual(frames, [.event(.token(delta: "only"))])
    }

    // Byte-level extra: an Arabic UTF-8 scalar split across two feeds must
    // survive — the parser buffers bytes and decodes whole lines only.
    func testMultibyteScalarSplitAcrossFeeds() {
        var parser = AdelSSEParser()
        let wire = Array("data: {\"type\":\"token\",\"delta\":\"مرحباً Captain\"}\n\n".utf8)
        // Split inside the Arabic bytes (well past the ASCII prefix).
        let cut = 20
        var frames = parser.feed(wire[0..<cut])
        XCTAssertEqual(frames, [])
        frames += parser.feed(wire[cut...])
        XCTAssertEqual(frames, [.event(.token(delta: "مرحباً Captain"))])
    }

    // The slice(5).trim() rule: `data:[DONE]` with no space still terminates.
    func testDoneWithoutSpaceStillTerminates() {
        var parser = AdelSSEParser()
        XCTAssertEqual(parser.feed("data:[DONE]\n"), [.done])
        XCTAssertEqual(parser.feed("data: {\"type\":\"reset\"}\n\n"), [])
    }
}
