import { useEffect, useRef, useState, useCallback } from 'react';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  isStreaming?: boolean;
  groundingState?: 'grounded' | 'partial' | 'refusal';
  sources?: string[];
}

interface UseChatStreamOptions {
  /** API endpoint for chat messages (default: /api/chat) */
  apiUrl?: string;
  /** Optional tenant ID for multi-tenant routing */
  tenantId?: string;
}

interface UseChatStreamReturn {
  /** Array of chat messages in order */
  messages: ChatMessage[];
  /** Current loading state */
  isLoading: boolean;
  /** Error message if one occurred */
  error: string | null;
  /** Function to send a user message */
  sendMessage: (content: string) => Promise<void>;
  /** Clear chat history */
  clearChat: () => void;
  /** Current SSE error state */
  sseError: string | null;
}

/**
 * Hook for managing streaming chat with server-sent events.
 * Emits messages with token-by-token rendering support.
 * RTL/bilingual aware via navigator.language.
 */
export const useChatStream = (options: UseChatStreamOptions = {}): UseChatStreamReturn => {
  const { apiUrl = '/api/chat', tenantId } = options;

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sseError, setSseError] = useState<string | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);
  const messageIdCounterRef = useRef(0);

  const sendMessage = useCallback(
    async (content: string) => {
      if (!content.trim()) return;

      setError(null);
      setSseError(null);
      setIsLoading(true);

      const userMessageId = `user-${++messageIdCounterRef.current}`;
      const assistantMessageId = `assistant-${++messageIdCounterRef.current}`;

      // Add user message immediately
      const userMessage: ChatMessage = {
        id: userMessageId,
        role: 'user',
        content: content.trim(),
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, userMessage]);

      // Create assistant message placeholder
      const assistantMessage: ChatMessage = {
        id: assistantMessageId,
        role: 'assistant',
        content: '',
        timestamp: new Date(),
        isStreaming: true,
        groundingState: 'grounded',
        sources: [],
      };

      setMessages((prev) => [...prev, assistantMessage]);

      try {
        // Prepare request
        abortControllerRef.current = new AbortController();
        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
          Accept: 'text/event-stream',
        };

        // Add tenant ID if provided
        if (tenantId) {
          headers['X-Tenant-Id'] = tenantId;
        }

        // Add language preference
        headers['Accept-Language'] = navigator.language || 'en-US';

        const response = await fetch(apiUrl, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            messages: messages.map((m) => ({ role: m.role, content: m.content })).concat([
              { role: 'user', content },
            ]),
            tenantId,
          }),
          signal: abortControllerRef.current.signal,
        });

        if (!response.ok) {
          throw new Error(`API error: ${response.status} ${response.statusText}`);
        }

        if (!response.body) {
          throw new Error('No response body');
        }

        // Process streaming response
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let content = '';
        let groundingState: 'grounded' | 'partial' | 'refusal' = 'grounded';
        let sources: string[] = [];

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');

            // Keep incomplete line in buffer
            buffer = lines.pop() || '';

            for (const line of lines) {
              if (line.startsWith('data: ')) {
                try {
                  const data = JSON.parse(line.substring(6));

                  if (data.type === 'token') {
                    content += data.token || '';
                  } else if (data.type === 'grounding') {
                    groundingState = data.state || 'grounded';
                    sources = data.sources || [];
                  } else if (data.type === 'done') {
                    // End of stream
                    break;
                  }

                  // Update assistant message with streaming content
                  setMessages((prev) =>
                    prev.map((m) =>
                      m.id === assistantMessageId
                        ? {
                            ...m,
                            content,
                            groundingState,
                            sources,
                            isStreaming: data.type !== 'done',
                          }
                        : m
                    )
                  );
                } catch (e) {
                  // Ignore JSON parse errors on event lines
                  console.debug('SSE parse error:', e);
                }
              }
            }
          }

          // Flush remaining buffer
          if (buffer) {
            try {
              const data = JSON.parse(buffer.substring(6));
              if (data.type === 'token') {
                content += data.token || '';
              }
            } catch (e) {
              console.debug('Final buffer parse error:', e);
            }
          }

          // Mark streaming as complete
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantMessageId
                ? {
                    ...m,
                    content,
                    groundingState,
                    sources,
                    isStreaming: false,
                  }
                : m
            )
          );
        } catch (readerError) {
          if (readerError instanceof TypeError && readerError.message.includes('abort')) {
            // User aborted, ignore
          } else {
            setSseError(`Stream error: ${readerError instanceof Error ? readerError.message : 'Unknown error'}`);
            setMessages((prev) =>
              prev.map((m) => (m.id === assistantMessageId ? { ...m, isStreaming: false } : m))
            );
          }
        }
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Unknown error';
        setError(errorMsg);
        setSseError(errorMsg);

        // Remove assistant message on error
        setMessages((prev) => prev.filter((m) => m.id !== assistantMessageId));
      } finally {
        setIsLoading(false);
      }
    },
    [messages, apiUrl, tenantId]
  );

  const clearChat = useCallback(() => {
    setMessages([]);
    setError(null);
    setSseError(null);
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  return {
    messages,
    isLoading,
    error,
    sendMessage,
    clearChat,
    sseError,
  };
};

export default useChatStream;
