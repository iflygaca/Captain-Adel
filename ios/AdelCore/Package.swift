// swift-tools-version:5.9
import PackageDescription

let package = Package(
    name: "AdelCore",
    platforms: [.iOS(.v17), .macOS(.v14)],
    products: [
        .library(name: "AdelAPI", targets: ["AdelAPI"]),
        .library(name: "AdelSSE", targets: ["AdelSSE"]),
        .library(name: "AdelUI", targets: ["AdelUI"]),
    ],
    targets: [
        .target(name: "AdelAPI"),
        .target(name: "AdelSSE", dependencies: ["AdelAPI"]),
        .target(name: "AdelUI", dependencies: ["AdelAPI", "AdelSSE"]),
        .testTarget(
            name: "AdelSSETests",
            dependencies: ["AdelAPI", "AdelSSE"],
            resources: [.copy("Fixtures")]
        ),
    ]
)
