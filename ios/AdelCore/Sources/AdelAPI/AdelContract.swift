// AdelContract.swift — constants and error mapping pinned to the deployed API.
//
// COMPILE-UNVERIFIED: authored without a Swift toolchain (see ios/README.md).
// Mirrors: src/server.js:36 (apiVersion), src/server.js:96 (session regex),
// src/brain/grounding.js:32,38 (verbatim/source caps), and the pre-stream
// status mapping in public/assets/js/chat-core.js:132-134 — which the JS test
// suite does NOT cover; ModelDecodingTests closes that gap here.

import Foundation

public enum AdelContract {
    /// Echoed by the server as `X-Adel-Api-Version` on every /v1/chat response.
    public static let apiVersion = "1"

    /// Server-side validation for the `session` body field (src/server.js:96).
    /// Anything not matching is silently dropped server-side — validate before
    /// sending so rate-limit bucketing actually works.
    public static let sessionPattern = "^[A-Za-z0-9._-]{8,128}$"

    /// The UI caps the server enforces when shaping `sources` (grounding.js).
    public static let maxSources = 3
    public static let maxVerbatim = 600

    /// Production origin. The spike talks to production — there is no staging.
    public static let defaultBaseURL = URL(string: "https://captadel.com")!

    public static func chatURL(base: URL = defaultBaseURL, stream: Bool = true) -> URL {
        var components = URLComponents(url: base.appendingPathComponent("v1/chat"),
                                       resolvingAgainstBaseURL: false)!
        if stream { components.queryItems = [URLQueryItem(name: "stream", value: "1")] }
        return components.url!
    }

    public static func configURL(base: URL = defaultBaseURL) -> URL {
        base.appendingPathComponent("v1/config")
    }

    public static func meURL(base: URL = defaultBaseURL) -> URL {
        base.appendingPathComponent("v1/me")
    }

    public static func feedbackURL(base: URL = defaultBaseURL) -> URL {
        base.appendingPathComponent("v1/feedback")
    }

    public static func healthURL(base: URL = defaultBaseURL) -> URL {
        base.appendingPathComponent("health")
    }

    /// Map a pre-stream HTTP rejection to a typed error. 429/402/400/413 are
    /// rejected as plain JSON BEFORE the SSE branch opens (src/server.js:126-174)
    /// — always branch on status before handing the body to the parser.
    /// Returns nil for 2xx.
    public static func preStreamError(status: Int, retryAfter: String?, limit: Int? = nil) -> AdelError? {
        let after = retryAfter.flatMap { Int($0.trimmingCharacters(in: .whitespaces)) }
        switch status {
        case 200...299: return nil
        case 429: return .rateLimited(retryAfter: after)
        case 402: return .quotaExceeded(retryAfter: after, limit: limit)
        case 400: return .badRequest
        case 413: return .payloadTooLarge
        case 502: return .engineError
        default: return .backend(status: status)
        }
    }
}

/// Transport/contract failures, one case per behaviour the UI must own.
public enum AdelError: Error, Equatable, Sendable {
    /// 429 — the abuse limiter. On cellular this is often carrier-NAT sharing
    /// the IP budget (scope "ip"): show "busy right now", never blame the user.
    case rateLimited(retryAfter: Int?)
    /// 402 — allowance spent. The v1 paywall SIGNPOST (no in-app purchase).
    case quotaExceeded(retryAfter: Int?, limit: Int?)
    case badRequest
    case payloadTooLarge
    case backend(status: Int)
    /// 502, or a mid-stream `{type:"error"}` frame (HTTP status was already 200).
    case engineError
    /// The stream ended without a `final` frame — `[DONE]` or not, this is an
    /// error: `final.answer` is the only authoritative text.
    case endedWithoutFinal
}
