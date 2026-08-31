import AdelAPI
import SwiftUI

public struct CaptainAdelRootView: View {
    @StateObject private var viewModel = AdelChatViewModel()
    @State private var showingSettings = false

    public init() {}

    private let samplePrompts = [
        "What are VFR cloud clearances in Class G?",
        "ما هي شروط الطيران الليلي للطيار الخاص؟",
        "Explain standard holding pattern entries (Sector 1, 2, 3)",
        "GACAR Part 91 minimum fuel reserves",
        "What is the ICAO Level 4 readback structure?"
    ]

    public var body: some View {
        NavigationStack {
            ZStack {
                AdelTheme.night.ignoresSafeArea()

                VStack(spacing: 0) {
                    // Header Status Bar
                    HStack(spacing: 8) {
                        Image(systemName: "airplane.circle.fill")
                            .font(.title3)
                            .foregroundStyle(AdelTheme.gold)
                        VStack(alignment: .leading, spacing: 2) {
                            Text("CAPTAIN ADEL")
                                .font(.system(size: 13, weight: .black, design: .monospaced))
                                .foregroundStyle(.white)
                            Text("GACAR & AIP CITE-OR-REFUSE AI")
                                .font(.system(size: 9, weight: .bold))
                                .foregroundStyle(AdelTheme.teal)
                        }
                        Spacer()

                        Button {
                            showingSettings = true
                        } label: {
                            Image(systemName: "gearshape.fill")
                                .font(.subheadline)
                                .foregroundStyle(AdelTheme.textMuted)
                        }
                    }
                    .padding(.horizontal)
                    .padding(.vertical, 10)
                    .background(AdelTheme.deep)

                    // Chat Scroll Area
                    ScrollViewReader { proxy in
                        ScrollView {
                            LazyVStack(spacing: 16) {
                                // Prompt suggestions (if few messages)
                                if viewModel.messages.count <= 1 {
                                    VStack(alignment: .leading, spacing: 10) {
                                        Text("HIGH-YIELD GACAR TOPICS")
                                            .font(.system(size: 10, weight: .black))
                                            .foregroundStyle(AdelTheme.gold)

                                        ScrollView(.horizontal, showsIndicators: false) {
                                            HStack(spacing: 8) {
                                                ForEach(samplePrompts, id: \.self) { prompt in
                                                    Button {
                                                        viewModel.sendMessage(prompt)
                                                    } label: {
                                                        Text(prompt)
                                                            .font(.caption)
                                                            .padding(.horizontal, 12)
                                                            .padding(.vertical, 8)
                                                            .background(AdelTheme.deep)
                                                            .foregroundStyle(.white)
                                                            .clipShape(RoundedRectangle(cornerRadius: 10))
                                                            .overlay(
                                                                RoundedRectangle(cornerRadius: 10)
                                                                    .strokeBorder(AdelTheme.mist, lineWidth: 1)
                                                            )
                                                    }
                                                }
                                            }
                                        }
                                    }
                                    .padding(.horizontal)
                                    .padding(.top, 8)
                                }

                                ForEach(viewModel.messages) { msg in
                                    MessageBubble(msg: msg, onSpeak: {
                                        viewModel.speakText(msg.content)
                                    }, onSelectCitation: { cite in
                                        viewModel.selectedCitation = cite
                                    })
                                    .id(msg.id)
                                }
                            }
                            .padding(.vertical)
                        }
                        .onChange(of: viewModel.messages.count) { _, _ in
                            if let lastId = viewModel.messages.last?.id {
                                withAnimation {
                                    proxy.scrollTo(lastId, anchor: .bottom)
                                }
                            }
                        }
                    }

                    // Input Bar
                    VStack(spacing: 0) {
                        Divider()
                            .background(AdelTheme.mist)

                        HStack(spacing: 10) {
                            TextField("Ask about GACAR or Saudi AIP / اسأل كابتن عادل", text: $viewModel.inputText)
                                .textFieldStyle(.plain)
                                .padding(10)
                                .background(AdelTheme.deep)
                                .clipShape(RoundedRectangle(cornerRadius: 12))
                                .foregroundStyle(.white)
                                .onSubmit {
                                    viewModel.sendMessage()
                                }

                            Button {
                                viewModel.sendMessage()
                            } label: {
                                Image(systemName: "arrow.up.circle.fill")
                                    .font(.system(size: 32))
                                    .foregroundStyle(viewModel.inputText.isEmpty ? AdelTheme.textMuted : AdelTheme.gold)
                            }
                            .disabled(viewModel.inputText.isEmpty || viewModel.isGenerating)
                        }
                        .padding(.horizontal)
                        .padding(.vertical, 10)
                        .background(AdelTheme.night)
                    }
                }
            }
            .sheet(item: $viewModel.selectedCitation) { citation in
                CitationSheetView(citation: citation)
            }
            .sheet(isPresented: $showingSettings) {
                AdelSettingsView()
            }
        }
    }
}

private struct MessageBubble: View {
    let msg: ChatMessage
    let onSpeak: () -> Void
    let onSelectCitation: (AdelSource) -> Void

    var isUser: Bool { msg.role == .user }

    var body: some View {
        HStack {
            if isUser { Spacer() }

            VStack(alignment: isUser ? .trailing : .leading, spacing: 6) {
                // Header (for Assistant)
                if !isUser {
                    HStack(spacing: 6) {
                        Image(systemName: "airplane")
                            .font(.caption2.bold())
                            .foregroundStyle(AdelTheme.gold)
                        Text("Captain Adel")
                            .font(.caption2.bold())
                            .foregroundStyle(AdelTheme.gold)

                        if let kind = msg.kind {
                            Text(kind.rawValue.uppercased())
                                .font(.system(size: 8, weight: .black))
                                .padding(.horizontal, 6)
                                .padding(.vertical, 2)
                                .background(kind == .grounded ? AdelTheme.sage.opacity(0.2) : AdelTheme.clay.opacity(0.2))
                                .foregroundStyle(kind == .grounded ? AdelTheme.sage : AdelTheme.clay)
                                .clipShape(Capsule())
                        }

                        Spacer()

                        Button(action: onSpeak) {
                            Image(systemName: "speaker.wave.2.fill")
                                .font(.caption2)
                                .foregroundStyle(AdelTheme.textMuted)
                        }
                    }
                }

                // Message Body
                Text(msg.content.isEmpty && msg.isStreaming ? "Thinking..." : msg.content)
                    .font(.body)
                    .foregroundStyle(.white)
                    .padding(14)
                    .background(isUser ? AdelTheme.teal : AdelTheme.deep)
                    .clipShape(RoundedRectangle(cornerRadius: 16))

                // Citations Row (if available)
                if !msg.citations.isEmpty {
                    VStack(alignment: .leading, spacing: 4) {
                        Text("CITATIONS")
                            .font(.system(size: 8, weight: .black))
                            .foregroundStyle(AdelTheme.gold)

                        ForEach(msg.citations, id: \.url) { cite in
                            Button {
                                onSelectCitation(cite)
                            } label: {
                                HStack(spacing: 4) {
                                    Image(systemName: "doc.text.fill")
                                    Text(cite.citation.isEmpty ? "GACAR Part \(cite.part ?? "")" : cite.citation)
                                    Spacer()
                                    Image(systemName: "chevron.right")
                                }
                                .font(.caption2.bold())
                                .padding(.horizontal, 10)
                                .padding(.vertical, 6)
                                .background(AdelTheme.mist)
                                .foregroundStyle(AdelTheme.gold)
                                .clipShape(RoundedRectangle(cornerRadius: 8))
                            }
                        }
                    }
                }
            }
            .frame(maxWidth: 320, alignment: isUser ? .trailing : .leading)

            if !isUser { Spacer() }
        }
        .padding(.horizontal)
    }
}
