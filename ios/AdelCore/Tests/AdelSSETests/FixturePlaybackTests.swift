// FixturePlaybackTests.swift — replay the committed wire fixtures against the
// same manifest.json that drives test/sse-fixtures.test.js in the Node gate.
// One manifest, two consumers: the Node and Swift views of the stream contract
// cannot fork silently. Fixtures are byte-exact captures of the REAL server
// pipeline (scripts/record-sse-fixtures.js).
//
// COMPILE-UNVERIFIED: authored without a Swift toolchain (see ios/README.md).

import XCTest
import AdelAPI
@testable import AdelSSE

// MARK: - Manifest schema (mirrors scripts/record-sse-fixtures.js output)

struct FixtureManifest: Decodable {
    let apiVersion: String
    let fixtures: [Entry]

    struct Entry: Decodable {
        let file: String
        let transport: String
        let description: String
        let expect: Expect
    }

    struct Expect: Decodable {
        // SSE fixtures
        let done: Bool?
        let final: Bool?
        let error: Bool?
        let kind: String?
        let refusalClass: String?
        let tokens: Int?
        let resets: Int?
        let reassemblyEqualsFinal: Bool?
        let sources: Int?
        let provider: String?
        // JSON envelope fixtures
        let status: Int?
        let errorCode: String?
        let retryAfter: Int?
    }
}

// MARK: - Fixture loading (shared with ModelDecodingTests — same test module)

enum Fixtures {
    static func data(_ file: String) throws -> Data {
        let parts = file.split(separator: ".", maxSplits: 1)
        guard let url = Bundle.module.url(
            forResource: String(parts[0]),
            withExtension: parts.count > 1 ? String(parts[1]) : nil,
            subdirectory: "Fixtures") else {
            throw XCTSkip("fixture \(file) missing from the test bundle")
        }
        return try Data(contentsOf: url)
    }

    static func manifest() throws -> FixtureManifest {
        try JSONDecoder().decode(FixtureManifest.self, from: data("manifest.json"))
    }
}

// MARK: - Playback

final class FixturePlaybackTests: XCTestCase {

    private struct Replay {
        var events: [AdelStreamEvent] = []
        var assembler = AdelTurnAssembler()
    }

    /// Run one fixture through parser + assembler, feeding `chunkSize` bytes
    /// at a time (nil = whole buffer).
    private func replay(_ bytes: [UInt8], chunkSize: Int?) -> Replay {
        var parser = AdelSSEParser()
        var out = Replay()
        var index = 0
        while index < bytes.count {
            let end = chunkSize.map { min(index + $0, bytes.count) } ?? bytes.count
            for frame in parser.feed(bytes[index..<end]) {
                out.assembler.apply(frame)
                if case .event(let event) = frame { out.events.append(event) }
            }
            index = end
        }
        return out
    }

    func testFixturesMatchTheirManifestDeclarations() throws {
        let manifest = try Fixtures.manifest()
        XCTAssertEqual(manifest.apiVersion, AdelContract.apiVersion,
                       "fixtures were recorded against the contract this package pins")

        for entry in manifest.fixtures where entry.transport == "sse" {
            let bytes = [UInt8](try Fixtures.data(entry.file))
            XCTAssertFalse(bytes.contains(0x0D),
                           "\(entry.file): \\r bytes mean EOL conversion corrupted the fixture")

            let whole = replay(bytes, chunkSize: nil)
            let chunked = replay(bytes, chunkSize: 7)   // force frames to split across feeds
            XCTAssertEqual(whole.events, chunked.events,
                           "\(entry.file): chunked parse must agree with whole-buffer parse")

            var tokens = 0, resets = 0, errors = 0
            var reassembly = ""
            var finalPayload: AdelFinalPayload?
            for event in whole.events {
                switch event {
                case .token(let delta): tokens += 1; reassembly += delta
                case .reset: resets += 1; reassembly = ""
                case .final(let payload): finalPayload = payload
                case .error: errors += 1
                }
            }

            XCTAssertEqual(tokens, entry.expect.tokens, "\(entry.file): token count")
            XCTAssertEqual(resets, entry.expect.resets, "\(entry.file): reset count")
            XCTAssertEqual(errors > 0, entry.expect.error ?? false, "\(entry.file): error frame")
            XCTAssertEqual(finalPayload != nil, entry.expect.final ?? false, "\(entry.file): final presence")

            if let payload = finalPayload {
                XCTAssertEqual(payload.kind?.rawValue, entry.expect.kind, "\(entry.file): kind")
                XCTAssertEqual(payload.refusalClass, entry.expect.refusalClass, "\(entry.file): refusalClass")
                XCTAssertEqual(payload.sources?.count ?? 0, entry.expect.sources, "\(entry.file): sources")
                XCTAssertLessThanOrEqual(payload.sources?.count ?? 0, AdelContract.maxSources)
                for source in payload.sources ?? [] {
                    if let verbatim = source.verbatim {
                        XCTAssertLessThanOrEqual(verbatim.count, AdelContract.maxVerbatim)
                    }
                }
                XCTAssertEqual(payload.meta?.provider, entry.expect.provider, "\(entry.file): provider")
                if entry.expect.reassemblyEqualsFinal == true {
                    XCTAssertEqual(reassembly, payload.answer,
                                   "\(entry.file): tokens after the last reset reassemble to final.answer")
                }
                XCTAssertEqual(try whole.assembler.finish(), payload, "\(entry.file): finish() returns the final")
            } else if entry.expect.error == true {
                XCTAssertThrowsError(try whole.assembler.finish(), "\(entry.file): errored turn throws") { error in
                    XCTAssertEqual(error as? AdelError, .engineError)
                }
            }
        }
    }

    func testJsonEnvelopeFixture() throws {
        struct Envelope: Decodable {
            struct Body: Decodable { let error: String?; let retryAfter: Int? }
            let status: Int
            let body: Body
        }
        let manifest = try Fixtures.manifest()
        for entry in manifest.fixtures where entry.transport == "json" {
            let envelope = try JSONDecoder().decode(Envelope.self, from: try Fixtures.data(entry.file))
            XCTAssertEqual(envelope.status, entry.expect.status, "\(entry.file): status")
            XCTAssertEqual(envelope.body.error, entry.expect.errorCode, "\(entry.file): error code")
            XCTAssertEqual(envelope.body.retryAfter, entry.expect.retryAfter, "\(entry.file): retryAfter")

            // The mapping the JS suite never tested: 429 → .rateLimited.
            let mapped = AdelContract.preStreamError(
                status: envelope.status,
                retryAfter: envelope.body.retryAfter.map(String.init))
            XCTAssertEqual(mapped, .rateLimited(retryAfter: envelope.body.retryAfter),
                           "\(entry.file): pre-stream mapping")
        }
    }
}
