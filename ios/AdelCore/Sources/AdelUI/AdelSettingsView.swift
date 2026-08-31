import SwiftUI

public struct AdelSettingsView: View {
    @Environment(\.dismiss) private var dismiss
    @AppStorage("adel_endpoint") private var apiEndpoint = "https://captadel.com"
    @AppStorage("adel_offline_fallback") private var allowOfflineFallback = true
    @AppStorage("adel_haptics") private var enableHaptics = true

    public init() {}

    public var body: some View {
        NavigationStack {
            ZStack {
                AdelTheme.night.ignoresSafeArea()

                Form {
                    Section("Service Connection") {
                        TextField("API Endpoint", text: $apiEndpoint)
                            .font(.system(.body, design: .monospaced))
                            .autocorrectionDisabled()
                        Toggle("Offline Regulatory Fallback", isOn: $allowOfflineFallback)
                    }

                    Section("Preferences") {
                        Toggle("Haptic Feedback", isOn: $enableHaptics)
                    }

                    Section("About Captain Adel") {
                        HStack {
                            Text("Version")
                            Spacer()
                            Text("1.0.0 (Native)")
                                .foregroundStyle(.secondary)
                        }
                        HStack {
                            Text("Backend Engine")
                            Spacer()
                            Text("AdelCore 5.9")
                                .foregroundStyle(.secondary)
                        }
                        HStack {
                            Text("Corpus")
                            Spacer()
                            Text("GACAR & Saudi AIP")
                                .foregroundStyle(AdelTheme.gold)
                        }
                    }

                    Section("Legal & Authority") {
                        Text("Captain Adel is an independent educational tool and is not affiliated with, endorsed by, or operated by GACA. Official regulations are hosted at gaca.gov.sa.")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }
                .scrollContentBackground(.hidden)
            }
            .navigationTitle("Settings")
            #if os(iOS)
            .navigationBarTitleDisplayMode(.inline)
            #endif
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") { dismiss() }
                        .foregroundStyle(AdelTheme.gold)
                }
            }
        }
    }
}
