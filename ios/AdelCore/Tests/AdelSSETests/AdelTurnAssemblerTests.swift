// AdelTurnAssemblerTests.swift — the 7 stream behaviours of
// test/answer-stream.test.js:78-211 restated as assembler-observable sequences,
// including the golden invariant: tokens after the last reset reassemble to
// exactly final.answer.
//
// COMPILE-UNVERIFIED: authored without a Swift toolchain (see ios/README.md).

import XCTest
import AdelAPI
@testable import AdelSSE

final class AdelTurnAssemblerTests: XCTestCase {

    private func final(_ answer: String, kind: AdelKind? = nil,
                       provider: String? = nil) -> AdelSSEFrame {
        .event(.final(AdelFinalPayload(
            answer: answer, kind: kind,
            meta: provider.map { AdelMeta(provider: $0) })))
    }

    // answer-stream.test.js:78-97 — streamed tokens reassemble to final.answer.
    func testTokensReassembleToFinal() throws {
        var assembler = AdelTurnAssembler()
        assembler.apply(.event(.token(delta: "Cleared ")))
        assembler.apply(.event(.token(delta: "to land.")))
        assembler.apply(final("Cleared to land.", kind: .grounded))
        assembler.apply(.done)

        let payload = try assembler.finish()
        XCTAssertEqual(payload.answer, "Cleared to land.")
        XCTAssertEqual(payload.kind, .grounded)
        XCTAssertEqual(assembler.provisionalText, payload.answer)
        XCTAssertFalse(assembler.didReset)
    }

    // answer-stream.test.js:99-111 — one remainder token, then final.
    func testShortRemainderSingleTokenThenFinal() throws {
        var assembler = AdelTurnAssembler()
        let short = "Roger — on the line, Captain."
        assembler.apply(.event(.token(delta: short)))
        assembler.apply(final(short))
        assembler.apply(.done)
        XCTAssertEqual(try assembler.finish().answer, short)
    }

    // answer-stream.test.js:136-160 — reset discards streamed text
    // unconditionally; post-reset tokens reassemble to the final answer.
    func testResetDiscardsUnconditionally() throws {
        var assembler = AdelTurnAssembler()
        assembler.apply(.event(.token(delta: String(repeating: "x", count: 120))))
        assembler.apply(.event(.reset))
        XCTAssertEqual(assembler.provisionalText, "", "reset wipes the bubble")
        XCTAssertTrue(assembler.didReset)

        assembler.apply(.event(.token(delta: "The fallback ")))
        assembler.apply(.event(.token(delta: "answer.")))
        assembler.apply(final("The fallback answer.", provider: "allam"))
        assembler.apply(.done)

        let payload = try assembler.finish()
        XCTAssertEqual(payload.answer, "The fallback answer.")
        XCTAssertEqual(payload.meta?.provider, "allam")
    }

    // The trailer-hold consequence (answer.js:202): the streamed buffer is
    // never byte-complete, so final REPLACES the provisional text.
    func testFinalReplacesProvisionalText() throws {
        var assembler = AdelTurnAssembler()
        assembler.apply(.event(.token(delta: "In Class D airspace, VFR requi")))
        assembler.apply(final("In Class D airspace, VFR requires 5 km."))
        assembler.apply(.done)
        XCTAssertEqual(assembler.provisionalText, "In Class D airspace, VFR requires 5 km.")
        _ = try assembler.finish()
    }

    // server-chat.test.js:179-192 — an error frame is terminal (no [DONE]).
    func testErrorFrameIsTerminal() {
        var assembler = AdelTurnAssembler()
        assembler.apply(.event(.token(delta: "partial…")))
        assembler.apply(.event(.error(code: "engine_error")))
        XCTAssertThrowsError(try assembler.finish()) { error in
            XCTAssertEqual(error as? AdelError, .engineError)
        }
    }

    // Client law 5 (docs/ios-app-plan.md): a stream that ends without `final`
    // is an error — [DONE] or not.
    func testEndWithoutFinalThrows() {
        var assembler = AdelTurnAssembler()
        assembler.apply(.event(.token(delta: "half an answ")))
        assembler.apply(.done)
        XCTAssertThrowsError(try assembler.finish()) { error in
            XCTAssertEqual(error as? AdelError, .endedWithoutFinal)
        }
    }

    // answer-stream.test.js:206-211 — a single decorated final (the guard
    // path for an empty message) is a complete, valid turn.
    func testSingleFinalOnlyTurn() throws {
        var assembler = AdelTurnAssembler()
        assembler.apply(final("Say again, Captain?", kind: .na))
        assembler.apply(.done)
        XCTAssertEqual(try assembler.finish().kind, .na)
    }
}
