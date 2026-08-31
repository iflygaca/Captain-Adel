import AdelAPI
import SwiftUI

extension AdelSource: Identifiable {
    public var id: String {
        url.isEmpty ? citation : url
    }
}

public struct CitationSheetView: View {
    public let citation: AdelSource
    @Environment(\.dismiss) private var dismiss

    public init(citation: AdelSource) {
        self.citation = citation
    }

    public var body: some View {
        NavigationStack {
            ZStack {
                AdelTheme.night.ignoresSafeArea()

                VStack(alignment: .leading, spacing: 16) {
                    VStack(alignment: .leading, spacing: 6) {
                        Text("GACAR REGULATORY CITATION")
                            .font(.system(size: 10, weight: .black))
                            .foregroundStyle(AdelTheme.gold)

                        Text(citation.citation.isEmpty ? "GACAR Regulation" : citation.citation)
                            .font(.title2.bold())
                            .foregroundStyle(.white)

                        if let part = citation.part {
                            Text("Part \(part)" + (citation.section != nil ? " §\(citation.section!)" : ""))
                                .font(.subheadline)
                                .foregroundStyle(AdelTheme.teal)
                        }
                    }
                    .padding()
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(AdelTheme.deep)
                    .clipShape(RoundedRectangle(cornerRadius: 16))

                    VStack(alignment: .leading, spacing: 12) {
                        Label("Authority Grounding", systemImage: "shield.checkerboard")
                            .font(.headline)
                            .foregroundStyle(AdelTheme.gold)

                        Text("This answer was grounded strictly in verified General Authority of Civil Aviation regulations. When operating in Saudi airspace, ensure full compliance with published GACAR amendments and AIP supplements.")
                            .font(.body)
                            .foregroundStyle(.secondary)

                        if !citation.url.isEmpty, let url = URL(string: citation.url.starts(with: "http") ? citation.url : "https://flygaca.com/\(citation.url)") {
                            Link(destination: url) {
                                HStack {
                                    Image(systemName: "safari.fill")
                                    Text("View in Regulations Library")
                                    Spacer()
                                    Image(systemName: "arrow.up.right")
                                }
                                .font(.subheadline.bold())
                                .padding()
                                .background(AdelTheme.teal)
                                .foregroundStyle(.white)
                                .clipShape(RoundedRectangle(cornerRadius: 12))
                            }
                            .padding(.top, 8)
                        }
                    }
                    .padding()
                    .background(AdelTheme.deep)
                    .clipShape(RoundedRectangle(cornerRadius: 16))

                    Spacer()
                }
                .padding()
            }
            .navigationTitle("Citation Details")
            #if os(iOS)
            .navigationBarTitleDisplayMode(.inline)
            #endif
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Done") { dismiss() }
                        .foregroundStyle(AdelTheme.gold)
                }
            }
        }
    }
}
