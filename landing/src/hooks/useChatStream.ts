import { useCallback, useRef } from 'react';

export interface ChatStreamEvent {
  type: 'token' | 'citation' | 'metadata' | 'error' | 'done';
  content?: string;
  data?: Record<string, unknown>;
}

export interface UseChatStreamOptions {
  apiUrl: string;
  tenantId?: string;
  conversationId?: string;
  onToken?: (token: string) => void;
  onEvent?: (event: ChatStreamEvent) => void;
  onError?: (error: Error) => void;
  onDone?: () => void;
}

/**
 * Hook to stream chat responses from the API.
 * Handles SSE (Server-Sent Events) parsing and provides callbacks for each event.
 *
 * Example:
 * ```tsx
 * const { stream, abort } = useChatStream({
 *   apiUrl: '/api/chat',
 *   onToken: (token) => setMessage(m => m + token),
 *   onError: (error) => console.error(error),
 * });
 *
 * stream({ message: 'Hello', conversationId: 'conv-123' });
 * ```
 */
export function useChatStream(options: UseChatStreamOptions) {
  const abortRef = useRef<AbortController | null>(null);

  const stream = useCallback(
    async (payload: Record<string, unknown>) => {
      abortRef.current = new AbortController();

      try {
        const response = await fetch(options.apiUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(options.tenantId && { 'X-Tenant-ID': options.tenantId }),
            ...(localStorage.getItem('auth_token') && {
              Authorization: `Bearer ${localStorage.getItem('auth_token')}`,
            }),
          },
          body: JSON.stringify({
            ...payload,
            conversationId: options.conversationId,
          }),
          signal: abortRef.current.signal,
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const reader = response.body?.getReader();
        if (!reader) {
          throw new Error('Response body not readable');
        }

        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });

          // Parse SSE format: "data: {...}\n\n"
          const lines = buffer.split('\n');
          buffer = lines[lines.length - 1]; // Keep incomplete line

          for (let i = 0; i < lines.length - 1; i++) {
            const line = lines[i].trim();
            if (!line) continue;
            if (!line.startsWith('data: ')) continue;

            const jsonStr = line.slice('data: '.length);
            try {
              const event = JSON.parse(jsonStr) as ChatStreamEvent;
              options.onEvent?.(event);

              if (event.type === 'token' && event.content) {
                options.onToken?.(event.content);
              }

              if (event.type === 'done') {
                options.onDone?.();
              }
            } catch (e) {
              console.error('Failed to parse SSE event:', jsonStr, e);
            }
          }
        }

        // Handle any remaining buffer
        if (buffer.trim().startsWith('data: ')) {
          const jsonStr = buffer.trim().slice('data: '.length);
          try {
            const event = JSON.parse(jsonStr) as ChatStreamEvent;
            options.onEvent?.(event);
          } catch (e) {
            console.error('Failed to parse final SSE event:', jsonStr, e);
          }
        }
      } catch (error) {
        if (error instanceof Error) {
          if (error.name !== 'AbortError') {
            options.onError?.(error);
          }
        }
      }
    },
    [options]
  );

  const abort = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  return { stream, abort };
}
