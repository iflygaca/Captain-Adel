// ModelDecodingTests.swift — the lenient-decode contract: additive server
// growth can never crash the app, and the pre-stream error mapping the JS
// suite never covered (chat-core.js:132-134) is pinned here.
//
// COMPILE-UNVERIFIED: authored without a Swift toolchain (see ios/README.md).

import XCTest
import AdelAPI
@testable import AdelSSE

final class ModelDecodingTests: XCTestCase {

    /// The real grounded fixture's `final` payload decodes with every field.
    func testFinalPayloadFromFixtureDecodesFully() throws {
        let bytes = [UInt8](try Fixtures.data("grounded-long.sse"))
        var parser = AdelSSEParser()
        var payload: AdelFinalPayload?
        for frame in parser.feed(bytes) {
            if case .event(.final(let final)) = frame { payload = final }
        }
        let final = try XCTUnwrap(payload, "the fixture carries a final frame")

        XCTAssertEqual(final.kind, .grounded)
        XCTAssertNil(final.refusalClass)
        XCTAssertEqual(final.grounding?.state, "grounded")
        XCTAssertEqual(final.sources?.count, 1)
        let source = try XCTUnwrap(final.sources?.first)
        XCTAssertEqual(source.citation, "GACAR Part 91, §91.155(a)")
        XCTAssertEqual(source.part, "91")
        XCTAssertEqual(source.sectionAnchor, "91.155")
        XCTAssertEqual(source.corpusVersion, "AIRAC 2505")
        XCTAssertNotNil(source.verbatim)
        XCTAssertEqual(final.meta?.provider, "gemini")
        XCTAssertNil(final.meta?.model, "the server never sets meta.model")
        XCTAssertEqual(final.suggestions?.count, 3)
        XCTAssertNotNil(final.suggestions?.first?.qAr,
                        "suggestions carry qAr — send it when the UI is Arabic")
    }

    /// Unknown fields and an unknown kind degrade, never fail (additive contract).
    func testUnknownFieldsAndUnknownKindDegrade() {
        let json = """
        {"type":"final","answer":"Roger.","kind":"verified","futureField":{"deep":[1,2]},
         "sources":[{"citation":"GACAR Part 5, §5.1","url":"x","surprise":true}]}
        """
        guard case .final(let payload)? = AdelStreamEvent.decode(json) else {
            return XCTFail("payload with unknown extras must still decode")
        }
        XCTAssertEqual(payload.answer, "Roger.")
        XCTAssertNil(payload.kind, "an unknown kind degrades to nil, never a decode error")
        XCTAssertEqual(payload.sources?.first?.citation, "GACAR Part 5, §5.1")
    }

    /// The floor of the contract: nothing is required beyond `answer`.
    func testMinimalPayloadDecodes() {
        guard case .final(let payload)? = AdelStreamEvent.decode(#"{"type":"final","answer":"x"}"#) else {
            return XCTFail("a bare answer must decode")
        }
        XCTAssertEqual(payload.answer, "x")
        XCTAssertNil(payload.kind)
        XCTAssertNil(payload.sources)
    }

    /// A worked tool call survives the AdelJSONValue round trip.
    func testToolCallDecodesFromFixture() throws {
        let bytes = [UInt8](try Fixtures.data("reset-toolround.sse"))
        var parser = AdelSSEParser()
        var payload: AdelFinalPayload?
        for frame in parser.feed(bytes) {
            if case .event(.final(let final)) = frame { payload = final }
        }
        let toolCall = try XCTUnwrap(try XCTUnwrap(payload).meta?.toolCalls?.first)
        XCTAssertEqual(toolCall.name, "compute_wind")
        guard case .object(let result)? = toolCall.result,
              case .array(let steps)? = result["steps"] else {
            return XCTFail("the worked steps decode as structured JSON")
        }
        XCTAssertEqual(steps.count, 2)
    }

    /// The pre-stream status mapping (untested in the JS suite — closed here).
    func testPreStreamErrorMapping() {
        XCTAssertNil(AdelContract.preStreamError(status: 200, retryAfter: nil))
        XCTAssertEqual(AdelContract.preStreamError(status: 429, retryAfter: "7"),
                       .rateLimited(retryAfter: 7))
        XCTAssertEqual(AdelContract.preStreamError(status: 402, retryAfter: "3600"),
                       .quotaExceeded(retryAfter: 3600, limit: nil))
        XCTAssertEqual(AdelContract.preStreamError(status: 400, retryAfter: nil), .badRequest)
        XCTAssertEqual(AdelContract.preStreamError(status: 413, retryAfter: nil), .payloadTooLarge)
        XCTAssertEqual(AdelContract.preStreamError(status: 502, retryAfter: nil), .engineError)
        XCTAssertEqual(AdelContract.preStreamError(status: 503, retryAfter: nil),
                       .backend(status: 503))
    }

    /// The session id the app mints must satisfy the server's regex — anything
    /// else is silently dropped and rate-limit bucketing falls back to IP.
    func testSessionPatternAcceptsTheAppFormat() throws {
        let regex = try NSRegularExpression(pattern: AdelContract.sessionPattern)
        func matches(_ s: String) -> Bool {
            regex.firstMatch(in: s, range: NSRange(s.startIndex..., in: s)) != nil
        }
        XCTAssertTrue(matches("ios-" + UUID().uuidString))
        XCTAssertTrue(matches("fixture-grounded-long-01"))
        XCTAssertFalse(matches("short"), "under 8 chars is dropped")
        XCTAssertFalse(matches("has space in it"), "spaces are dropped")
    }
}
