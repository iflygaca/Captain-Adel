// swift-tools-version:5.9
// AdelCore — the Captain Adel iOS model layer (Phase-0 spike).
//
// COMPILE-UNVERIFIED: authored in the Captain-Adel repo on Linux with no Swift
// toolchain (see ios/README.md — `swift test` on a Mac is step 1). The package
// mirrors the architecture block of docs/ios-app-plan.md: AdelAPI (lenient
// Codable models) + AdelSSE (the POST-SSE parser and transport). macOS is in
// the platform list purely so `swift test` runs toolchain-only, no simulator.
// Zero external dependencies; nothing references repo-relative paths, so the
// whole ios/AdelCore/ directory extracts to the Captain-Adel-iOS repo unchanged.
import PackageDescription

let package = Package(
    name: "AdelCore",
    platforms: [.iOS(.v17), .macOS(.v14)],
    products: [
        .library(name: "AdelAPI", targets: ["AdelAPI"]),
        .library(name: "AdelSSE", targets: ["AdelSSE"]),
    ],
    targets: [
        .target(name: "AdelAPI"),
        .target(name: "AdelSSE", dependencies: ["AdelAPI"]),
        .testTarget(
            name: "AdelSSETests",
            dependencies: ["AdelAPI", "AdelSSE"],
            resources: [.copy("Fixtures")]
        ),
    ]
)
