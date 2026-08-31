import AVFoundation
import AdelAPI
import AdelSSE
import Foundation
import SwiftUI

public struct ChatMessage: Identifiable, Equatable {
    public let id: String
    public let role: Role
    public var content: String
    public var kind: AdelKind?
    public var citations: [AdelSource]
    public var isStreaming: Bool
    public let timestamp: Date

    public enum Role: String, Equatable {
        case user
        case assistant
    }

    public init(
        id: String = UUID().uuidString,
        role: Role,
        content: String,
        kind: AdelKind? = nil,
        citations: [AdelSource] = [],
        isStreaming: Bool = false,
        timestamp: Date = Date()
    ) {
        self.id = id
        self.role = role
        self.content = content
        self.kind = kind
        self.citations = citations
        self.isStreaming = isStreaming
        self.timestamp = timestamp
    }
}

@MainActor
public final class AdelChatViewModel: ObservableObject {
    @Published public var messages: [ChatMessage] = []
    @Published public var inputText: String = ""
    @Published public var isGenerating: Bool = false
    @Published public var selectedCitation: AdelSource? = nil
    @Published public var isSpeaking: Bool = false

    private let transport: AdelChatTransport
    private let speechSynthesizer = AVSpeechSynthesizer()
    private var currentSessionID: String

    public init(transport: AdelChatTransport = AdelChatTransport()) {
        self.transport = transport
        self.currentSessionID = "ios-adel-" + UUID().uuidString

        // Initial greeting
        self.messages.append(
            ChatMessage(
                role: .assistant,
                content: "السلام عليكم كابتن. أنا الكابتن عادل، مدربك الذكي المعتمد على لوائح الطيران المدني السعودي (GACAR & AIP). كيف يمكنني مساعدتك اليوم؟\n\nWelcome Captain. I am Captain Adel, your AI flight instructor grounded in Saudi civil aviation regulations. What can I clarify for you today?",
                kind: .grounded,
                citations: [
                    AdelSource(citation: "GACAR Part 91 General", url: "https://flygaca.com/library/gacar-part-91", part: "91", section: "General")
                ]
            )
        )
    }

    public func sendMessage(_ prompt: String? = nil) {
        let textToSend = (prompt ?? inputText).trimmingCharacters(in: .whitespacesAndNewlines)
        guard !textToSend.isEmpty, !isGenerating else { return }

        inputText = ""
        isGenerating = true

        let userMsg = ChatMessage(role: .user, content: textToSend)
        messages.append(userMsg)

        let assistantMsgId = UUID().uuidString
        let assistantMsg = ChatMessage(id: assistantMsgId, role: .assistant, content: "", isStreaming: true)
        messages.append(assistantMsg)

        Task {
            await streamResponse(for: textToSend, messageId: assistantMsgId)
        }
    }

    private func streamResponse(for question: String, messageId: String) async {
        do {
            var streamReceived = false
            for try await event in transport.stream(message: question, session: currentSessionID) {
                streamReceived = true
                guard let idx = messages.firstIndex(where: { $0.id == messageId }) else { break }

                switch event {
                case .token(let delta):
                    messages[idx].content += delta
                case .reset:
                    messages[idx].content = ""
                case .final(let payload):
                    messages[idx].content = payload.answer
                    messages[idx].kind = payload.kind
                    messages[idx].citations = payload.sources ?? []
                    messages[idx].isStreaming = false
                case .error(let err):
                    messages[idx].content = "Error: \(err)"
                    messages[idx].isStreaming = false
                }
            }

            if !streamReceived {
                applyOfflineFallback(for: question, messageId: messageId)
            }
        } catch {
            applyOfflineFallback(for: question, messageId: messageId)
        }

        isGenerating = false
    }

    private func applyOfflineFallback(for question: String, messageId: String) {
        guard let idx = messages.firstIndex(where: { $0.id == messageId }) else { return }
        let lower = question.lowercased()

        if lower.contains("vfr") || lower.contains("بصري") || lower.contains("weather") {
            messages[idx].content = "Under GACAR §91.155 (Basic VFR Weather Minimums), VFR flight in Class C/D/E controlled airspace requires at least 5 km (3 SM) flight visibility and cloud clearance of 1,500 m horizontal and 300 m (1,000 ft) vertical."
            messages[idx].kind = .grounded
            messages[idx].citations = [
                AdelSource(citation: "GACAR §91.155 Basic VFR Weather Minimums", url: "https://flygaca.com/library/gacar-part-91", part: "91", section: "155")
            ]
        } else if lower.contains("fuel") || lower.contains("وقود") {
            messages[idx].content = "GACAR Part 91.151 Fuel Requirements:\n• Day VFR: Fuel to destination + 30 minutes at normal cruising speed.\n• Night VFR: Fuel to destination + 45 minutes at normal cruising speed.\n• IFR (Part 91.167): Fuel to destination + alternate + 45 minutes reserve."
            messages[idx].kind = .grounded
            messages[idx].citations = [
                AdelSource(citation: "GACAR §91.151 Fuel Requirements for Flight in VFR Conditions", url: "https://flygaca.com/library/gacar-part-91", part: "91", section: "151")
            ]
        } else {
            messages[idx].content = "Grounded GACAR Flight Rule: Under GACAR Part 91 & Part 61, all pilot privileges, operating rules, and airspace clearances must adhere to published Saudi civil aviation authority minimums. For specific operations, please refer to the relevant GACAR Part."
            messages[idx].kind = .grounded
            messages[idx].citations = [
                AdelSource(citation: "GACAR Operating Rules", url: "https://flygaca.com/library/gacar-part-91", part: "91", section: "General")
            ]
        }
        messages[idx].isStreaming = false
    }

    public func speakText(_ text: String) {
        if speechSynthesizer.isSpeaking {
            speechSynthesizer.stopSpeaking(at: .immediate)
            isSpeaking = false
            return
        }

        let utterance = AVSpeechUtterance(string: text)
        let containsArabic = text.range(of: "\\p{Arabic}", options: .regularExpression) != nil
        utterance.voice = AVSpeechSynthesisVoice(language: containsArabic ? "ar-SA" : "en-US")
        utterance.rate = 0.52
        speechSynthesizer.speak(utterance)
        isSpeaking = true
    }

    public func stopSpeaking() {
        if speechSynthesizer.isSpeaking {
            speechSynthesizer.stopSpeaking(at: .immediate)
        }
        isSpeaking = false
    }
}
