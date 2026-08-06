// ChatModels.swift — lenient Codable models for the /v1/chat final payload.
//
// COMPILE-UNVERIFIED: authored without a Swift toolchain (see ios/README.md).
// Mirrors the decorated response built at src/brain/grounding.js:320-341 and
// the contract tables in docs/ios-app-plan.md. The contract is ADDITIVE:
// decode leniently, tolerate unknown fields and wrong-typed extras, require
// nothing beyond `answer` — every field below is `try?`-decoded so a server
// addition can never crash the app.

import Foundation

/// The server-authoritative grounding verdict. `na` renders NO badge.
/// Decoded failably: a future kind degrades to nil, never a decode error.
public enum AdelKind: String, Sendable, Equatable {
    case grounded, partial, refusal, na
}

public struct AdelSource: Equatable, Sendable {
    public let citation: String
    /// Often RELATIVE ("library.html#91.155") — resolve against the site
    /// origin before opening (docs/ios-app-plan.md, API-binding table).
    public let url: String
    public let part: String?
    public let section: String?
    public let sectionAnchor: String?
    public let verbatim: String?
    public let corpusVersion: String?

    public init(citation: String = "", url: String = "", part: String? = nil,
                section: String? = nil, sectionAnchor: String? = nil,
                verbatim: String? = nil, corpusVersion: String? = nil) {
        self.citation = citation
        self.url = url
        self.part = part
        self.section = section
        self.sectionAnchor = sectionAnchor
        self.verbatim = verbatim
        self.corpusVersion = corpusVersion
    }
}

extension AdelSource: Decodable {
    private enum CodingKeys: String, CodingKey {
        case citation, url, part, section, sectionAnchor, verbatim, corpusVersion
    }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        self.init(
            citation: (try? c.decodeIfPresent(String.self, forKey: .citation)) ?? "",
            url: (try? c.decodeIfPresent(String.self, forKey: .url)) ?? "",
            part: (try? c.decodeIfPresent(String.self, forKey: .part)) ?? nil,
            section: (try? c.decodeIfPresent(String.self, forKey: .section)) ?? nil,
            sectionAnchor: (try? c.decodeIfPresent(String.self, forKey: .sectionAnchor)) ?? nil,
            verbatim: (try? c.decodeIfPresent(String.self, forKey: .verbatim)) ?? nil,
            corpusVersion: (try? c.decodeIfPresent(String.self, forKey: .corpusVersion)) ?? nil
        )
    }
}

public struct AdelClaim: Equatable, Sendable {
    public let claim: String?
    public let verdict: String?

    public init(claim: String? = nil, verdict: String? = nil) {
        self.claim = claim
        self.verdict = verdict
    }
}

extension AdelClaim: Decodable {
    private enum CodingKeys: String, CodingKey { case claim, verdict }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        self.init(claim: (try? c.decodeIfPresent(String.self, forKey: .claim)) ?? nil,
                  verdict: (try? c.decodeIfPresent(String.self, forKey: .verdict)) ?? nil)
    }
}

public struct AdelGrounding: Equatable, Sendable {
    public let state: String?
    public let mode: String?
    public let score: Double?
    public let claims: [AdelClaim]?
    public let resolved: [String]?
    public let unresolved: [String]?

    public init(state: String? = nil, mode: String? = nil, score: Double? = nil,
                claims: [AdelClaim]? = nil, resolved: [String]? = nil,
                unresolved: [String]? = nil) {
        self.state = state
        self.mode = mode
        self.score = score
        self.claims = claims
        self.resolved = resolved
        self.unresolved = unresolved
    }
}

extension AdelGrounding: Decodable {
    private enum CodingKeys: String, CodingKey {
        case state, mode, score, claims, resolved, unresolved
    }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        self.init(
            state: (try? c.decodeIfPresent(String.self, forKey: .state)) ?? nil,
            mode: (try? c.decodeIfPresent(String.self, forKey: .mode)) ?? nil,
            score: (try? c.decodeIfPresent(Double.self, forKey: .score)) ?? nil,
            claims: (try? c.decodeIfPresent([AdelClaim].self, forKey: .claims)) ?? nil,
            resolved: (try? c.decodeIfPresent([String].self, forKey: .resolved)) ?? nil,
            unresolved: (try? c.decodeIfPresent([String].self, forKey: .unresolved)) ?? nil
        )
    }
}

/// "Keep exploring" chips. When the UI language is Arabic, SEND `qAr` — the
/// server has no `lang` field and routes by the message's own language.
public struct AdelSuggestion: Equatable, Sendable {
    public let q: String?
    public let qAr: String?
    public let en: String?
    public let ar: String?

    public init(q: String? = nil, qAr: String? = nil, en: String? = nil, ar: String? = nil) {
        self.q = q
        self.qAr = qAr
        self.en = en
        self.ar = ar
    }
}

extension AdelSuggestion: Decodable {
    private enum CodingKeys: String, CodingKey { case q, qAr, en, ar }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        self.init(q: (try? c.decodeIfPresent(String.self, forKey: .q)) ?? nil,
                  qAr: (try? c.decodeIfPresent(String.self, forKey: .qAr)) ?? nil,
                  en: (try? c.decodeIfPresent(String.self, forKey: .en)) ?? nil,
                  ar: (try? c.decodeIfPresent(String.self, forKey: .ar)) ?? nil)
    }
}

/// A tiny recursive JSON value so `meta.toolCalls[].args/result` decode with
/// zero dependencies and zero assumptions about the compute tools' shapes.
public indirect enum AdelJSONValue: Equatable, Sendable {
    case null
    case bool(Bool)
    case number(Double)
    case string(String)
    case array([AdelJSONValue])
    case object([String: AdelJSONValue])
}

extension AdelJSONValue: Decodable {
    public init(from decoder: Decoder) throws {
        let c = try decoder.singleValueContainer()
        if c.decodeNil() { self = .null }
        else if let b = try? c.decode(Bool.self) { self = .bool(b) }
        else if let n = try? c.decode(Double.self) { self = .number(n) }
        else if let s = try? c.decode(String.self) { self = .string(s) }
        else if let a = try? c.decode([AdelJSONValue].self) { self = .array(a) }
        else if let o = try? c.decode([String: AdelJSONValue].self) { self = .object(o) }
        else { self = .null }
    }
}

/// A worked flight-computer call — the web never rendered these; the app should
/// (steps become rows, per the mockups).
public struct AdelToolCall: Equatable, Sendable {
    public let name: String?
    public let args: AdelJSONValue?
    public let result: AdelJSONValue?

    public init(name: String? = nil, args: AdelJSONValue? = nil, result: AdelJSONValue? = nil) {
        self.name = name
        self.args = args
        self.result = result
    }
}

extension AdelToolCall: Decodable {
    private enum CodingKeys: String, CodingKey { case name, args, result }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        self.init(name: (try? c.decodeIfPresent(String.self, forKey: .name)) ?? nil,
                  args: (try? c.decodeIfPresent(AdelJSONValue.self, forKey: .args)) ?? nil,
                  result: (try? c.decodeIfPresent(AdelJSONValue.self, forKey: .result)) ?? nil)
    }
}

public struct AdelMeta: Equatable, Sendable {
    public let provider: String?
    public let model: String?
    public let rewrittenQuery: String?
    public let toolCalls: [AdelToolCall]?

    public init(provider: String? = nil, model: String? = nil,
                rewrittenQuery: String? = nil, toolCalls: [AdelToolCall]? = nil) {
        self.provider = provider
        self.model = model
        self.rewrittenQuery = rewrittenQuery
        self.toolCalls = toolCalls
    }
}

extension AdelMeta: Decodable {
    private enum CodingKeys: String, CodingKey { case provider, model, rewrittenQuery, toolCalls }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        self.init(
            provider: (try? c.decodeIfPresent(String.self, forKey: .provider)) ?? nil,
            model: (try? c.decodeIfPresent(String.self, forKey: .model)) ?? nil,
            rewrittenQuery: (try? c.decodeIfPresent(String.self, forKey: .rewrittenQuery)) ?? nil,
            toolCalls: (try? c.decodeIfPresent([AdelToolCall].self, forKey: .toolCalls)) ?? nil
        )
    }
}

/// The authoritative turn payload — arrives ONLY on the `final` frame, never
/// incrementally. `answer` is the full text; it REPLACES the streamed buffer
/// (the server holds back an 80-char trailer window, src/brain/answer.js:202).
public struct AdelFinalPayload: Equatable, Sendable {
    public let answer: String
    public let kind: AdelKind?
    public let refusalClass: String?
    public let grounding: AdelGrounding?
    public let suggestions: [AdelSuggestion]?
    public let sources: [AdelSource]?
    public let meta: AdelMeta?

    public init(answer: String, kind: AdelKind? = nil, refusalClass: String? = nil,
                grounding: AdelGrounding? = nil, suggestions: [AdelSuggestion]? = nil,
                sources: [AdelSource]? = nil, meta: AdelMeta? = nil) {
        self.answer = answer
        self.kind = kind
        self.refusalClass = refusalClass
        self.grounding = grounding
        self.suggestions = suggestions
        self.sources = sources
        self.meta = meta
    }
}

extension AdelFinalPayload: Decodable {
    private enum CodingKeys: String, CodingKey {
        case answer, kind, refusalClass, grounding, suggestions, sources, meta
    }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        let kindRaw = (try? c.decodeIfPresent(String.self, forKey: .kind)) ?? nil
        self.init(
            answer: (try? c.decodeIfPresent(String.self, forKey: .answer)) ?? "",
            kind: kindRaw.flatMap(AdelKind.init(rawValue:)),   // unknown kind → nil, never a failure
            refusalClass: (try? c.decodeIfPresent(String.self, forKey: .refusalClass)) ?? nil,
            grounding: (try? c.decodeIfPresent(AdelGrounding.self, forKey: .grounding)) ?? nil,
            suggestions: (try? c.decodeIfPresent([AdelSuggestion].self, forKey: .suggestions)) ?? nil,
            sources: (try? c.decodeIfPresent([AdelSource].self, forKey: .sources)) ?? nil,
            meta: (try? c.decodeIfPresent(AdelMeta.self, forKey: .meta)) ?? nil
        )
    }
}
