// AccountModels.swift — decode-only models for the launch/account calls.
//
// COMPILE-UNVERIFIED: authored without a Swift toolchain (see ios/README.md).
// Mirrors src/billing/routes.js:346-382. Spike scope is decode-only: the app
// calls GET /v1/config at launch (feature flags) and GET /v1/me with the
// Bearer token (both return 200 whether or not you are signed in). Entitlement
// truth comes ONLY from /v1/me — Firestore is deny-all to clients — and lags
// a web purchase by up to ~60 s (the server's entitlement cache).

import Foundation

/// GET /v1/config — public feature flags.
/// `authEnabled: false` → hide sign-in entirely (the backend ships dark until
/// Firebase env is set). `launchMode: true` → everyone is Pro; hide the paywall.
public struct AdelConfig: Decodable, Equatable, Sendable {
    public let launchMode: Bool?
    public let billingEnabled: Bool?
    public let authEnabled: Bool?
    public let moyasarPublishableKey: String?
    public let freeDaily: Int?
    public let anonDaily: Int?
    public let period: String?

    public init(launchMode: Bool? = nil, billingEnabled: Bool? = nil,
                authEnabled: Bool? = nil, moyasarPublishableKey: String? = nil,
                freeDaily: Int? = nil, anonDaily: Int? = nil, period: String? = nil) {
        self.launchMode = launchMode
        self.billingEnabled = billingEnabled
        self.authEnabled = authEnabled
        self.moyasarPublishableKey = moyasarPublishableKey
        self.freeDaily = freeDaily
        self.anonDaily = anonDaily
        self.period = period
    }
}

/// GET /v1/me — 200 either way: `{signedIn:false, launchMode}` when anonymous.
public struct AdelMe: Decodable, Equatable, Sendable {
    public struct Quota: Decodable, Equatable, Sendable {
        public let remaining: Int?
        public let limit: Int?

        public init(remaining: Int? = nil, limit: Int? = nil) {
            self.remaining = remaining
            self.limit = limit
        }
    }

    public let signedIn: Bool?
    public let uid: String?
    public let email: String?
    public let plan: String?
    public let launchMode: Bool?
    public let quota: Quota?
    public let period: String?

    public init(signedIn: Bool? = nil, uid: String? = nil, email: String? = nil,
                plan: String? = nil, launchMode: Bool? = nil, quota: Quota? = nil,
                period: String? = nil) {
        self.signedIn = signedIn
        self.uid = uid
        self.email = email
        self.plan = plan
        self.launchMode = launchMode
        self.quota = quota
        self.period = period
    }
}
