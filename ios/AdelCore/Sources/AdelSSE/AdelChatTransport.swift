// AdelChatTransport.swift — the URLSession POST-SSE transport.
//
// COMPILE-UNVERIFIED: authored without a Swift toolchain (see ios/README.md).
// The ONLY file in the package that imports networking — parser and assembler
// tests never touch it. Mirrors public/assets/js/chat-core.js:124-136 plus the
// richer pre-stream statuses from test/server-chat.test.js:
//
//   • POST {base}/v1/chat?stream=1, Content-Type: application/json,
//     Accept: text/event-stream, optional `Authorization: Bearer <token>`
//     (auth never blocks /v1/chat — on token trouble, send anonymous)
//   • the body field is `session` — NEVER `sessionId` (src/server.js:91)
//   • 429/402/400/413 arrive as plain JSON BEFORE the stream: branch on the
//     HTTP status before parsing
//   • 90 s request timeout: the first request after a cold start pays for the
//     resident BM25 index build — show "connecting", don't give up
//   • the stream yields events verbatim AND finishes by running the
//     assembler's end-of-stream check, so `endedWithoutFinal` / `engineError`
//     surface as the thrown error callers rely on.

import Foundation
import AdelAPI

public struct AdelHistoryTurn: Encodable, Equatable, Sendable {
    /// "user" or "model" — the server keeps the last 24 turns.
    public let role: String
    public let text: String

    public init(role: String, text: String) {
        self.role = role
        self.text = text
    }
}

struct AdelChatRequestBody: Encodable {
    let message: String
    let history: [AdelHistoryTurn]
    /// The field is `session`, never `sessionId` (src/server.js:91-97).
    let session: String?
    let product: String
    let mode: String?
}

public final class AdelChatTransport: @unchecked Sendable {
    private let baseURL: URL
    private let urlSession: URLSession

    public init(baseURL: URL = AdelContract.defaultBaseURL, urlSession: URLSession? = nil) {
        self.baseURL = baseURL
        if let urlSession {
            self.urlSession = urlSession
        } else {
            let config = URLSessionConfiguration.ephemeral
            config.timeoutIntervalForRequest = 90   // cold-start BM25 build
            self.urlSession = URLSession(configuration: config)
        }
    }

    /// One streamed chat turn. Events arrive verbatim (`token`/`reset`/`final`/
    /// `error`); the stream throws AdelError for pre-stream rejections, an
    /// engine error, or a stream that ends without `final`.
    public func stream(
        message: String,
        history: [AdelHistoryTurn] = [],
        session: String? = nil,
        mode: String? = nil,
        bearerToken: String? = nil
    ) -> AsyncThrowingStream<AdelStreamEvent, Error> {
        AsyncThrowingStream { continuation in
            let task = Task {
                do {
                    var request = URLRequest(url: AdelContract.chatURL(base: self.baseURL, stream: true))
                    request.httpMethod = "POST"
                    request.setValue("application/json", forHTTPHeaderField: "Content-Type")
                    request.setValue("text/event-stream", forHTTPHeaderField: "Accept")
                    if let bearerToken, !bearerToken.isEmpty {
                        request.setValue("Bearer \(bearerToken)", forHTTPHeaderField: "Authorization")
                    }
                    request.httpBody = try JSONEncoder().encode(AdelChatRequestBody(
                        message: message,
                        history: history,
                        session: session,
                        product: "captadel",
                        mode: mode
                    ))

                    let (bytes, response) = try await self.urlSession.bytes(for: request)
                    guard let http = response as? HTTPURLResponse else {
                        throw AdelError.backend(status: -1)
                    }
                    if let rejection = AdelContract.preStreamError(
                        status: http.statusCode,
                        retryAfter: http.value(forHTTPHeaderField: "Retry-After")) {
                        throw rejection
                    }

                    var parser = AdelSSEParser()
                    var assembler = AdelTurnAssembler()
                    var chunk: [UInt8] = []
                    chunk.reserveCapacity(1024)

                    func drain(_ frames: [AdelSSEFrame]) -> Bool {
                        for frame in frames {
                            assembler.apply(frame)
                            if case .event(let event) = frame {
                                continuation.yield(event)
                            }
                            if case .done = frame { return true }
                        }
                        return false
                    }

                    var finished = false
                    for try await byte in bytes {
                        chunk.append(byte)
                        if chunk.count >= 1024 {
                            finished = drain(parser.feed(chunk))
                            chunk.removeAll(keepingCapacity: true)
                            if finished { break }
                        }
                    }
                    if !finished, !chunk.isEmpty {
                        _ = drain(parser.feed(chunk))
                    }

                    _ = try assembler.finish()   // throws endedWithoutFinal / engineError
                    continuation.finish()
                } catch {
                    continuation.finish(throwing: error)
                }
            }
            continuation.onTermination = { _ in task.cancel() }
        }
    }
}
