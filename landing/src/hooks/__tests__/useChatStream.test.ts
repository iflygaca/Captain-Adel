import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useChatStream } from '../useChatStream';

describe('useChatStream', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('initializes with empty messages', () => {
    const { result } = renderHook(() => useChatStream());

    expect(result.current.messages).toEqual([]);
    expect(result.current.isLoading).toBe(false);
    expect(result.current.error).toBe(null);
  });

  it('sends a message and adds it to messages', async () => {
    global.fetch = vi.fn();

    // Mock SSE response
    const mockStream = new ReadableStream({
      start(controller) {
        controller.enqueue(
          new TextEncoder().encode('data: {"type":"token","token":"Hello "}\n')
        );
        controller.enqueue(
          new TextEncoder().encode('data: {"type":"token","token":"world"}\n')
        );
        controller.enqueue(
          new TextEncoder().encode('data: {"type":"done"}\n')
        );
        controller.close();
      },
    });

    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      body: mockStream,
      status: 200,
      statusText: 'OK',
    });

    const { result } = renderHook(() => useChatStream());

    await act(async () => {
      await result.current.sendMessage('Test message');
    });

    await waitFor(() => {
      expect(result.current.messages).toHaveLength(2); // user + assistant
    });

    const userMessage = result.current.messages[0];
    expect(userMessage.role).toBe('user');
    expect(userMessage.content).toBe('Test message');

    const assistantMessage = result.current.messages[1];
    expect(assistantMessage.role).toBe('assistant');
    expect(assistantMessage.content).toContain('Hello');
    expect(assistantMessage.isStreaming).toBe(false);
  });

  it('handles grounding state changes', async () => {
    global.fetch = vi.fn();

    const mockStream = new ReadableStream({
      start(controller) {
        controller.enqueue(
          new TextEncoder().encode('data: {"type":"grounding","state":"partial","sources":["§91.155"]}\n')
        );
        controller.enqueue(
          new TextEncoder().encode('data: {"type":"done"}\n')
        );
        controller.close();
      },
    });

    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      body: mockStream,
      status: 200,
      statusText: 'OK',
    });

    const { result } = renderHook(() => useChatStream());

    await act(async () => {
      await result.current.sendMessage('Test');
    });

    await waitFor(() => {
      const msg = result.current.messages[1];
      expect(msg.groundingState).toBe('partial');
      expect(msg.sources).toContain('§91.155');
    });
  });

  it('sets error state on fetch failure', async () => {
    global.fetch = vi.fn().mockRejectedValueOnce(
      new Error('Network error')
    );

    const { result } = renderHook(() => useChatStream());

    await act(async () => {
      await result.current.sendMessage('Test').catch(() => {
        // Ignore expected error
      });
    });

    expect(result.current.error).toContain('Network error');
  });

  it('clears chat history with clearChat', async () => {
    global.fetch = vi.fn();

    const mockStream = new ReadableStream({
      start(controller) {
        controller.enqueue(
          new TextEncoder().encode('data: {"type":"token","token":"test"}\n')
        );
        controller.enqueue(
          new TextEncoder().encode('data: {"type":"done"}\n')
        );
        controller.close();
      },
    });

    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      body: mockStream,
      status: 200,
      statusText: 'OK',
    });

    const { result } = renderHook(() => useChatStream());

    await act(async () => {
      await result.current.sendMessage('Test');
    });

    expect(result.current.messages.length).toBeGreaterThan(0);

    act(() => {
      result.current.clearChat();
    });

    expect(result.current.messages).toEqual([]);
    expect(result.current.error).toBe(null);
  });

  it('sets isLoading during stream', async () => {
    global.fetch = vi.fn();

    const mockStream = new ReadableStream({
      start(controller) {
        setTimeout(() => {
          controller.enqueue(
            new TextEncoder().encode('data: {"type":"token","token":"test"}\n')
          );
          controller.close();
        }, 100);
      },
    });

    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      body: mockStream,
      status: 200,
      statusText: 'OK',
    });

    const { result } = renderHook(() => useChatStream());

    expect(result.current.isLoading).toBe(false);

    const promise = act(async () => {
      await result.current.sendMessage('Test');
    });

    expect(result.current.isLoading).toBe(true);

    await promise;

    expect(result.current.isLoading).toBe(false);
  });

  it('includes tenant ID header when provided', async () => {
    global.fetch = vi.fn();

    const mockStream = new ReadableStream({
      start(controller) {
        controller.enqueue(
          new TextEncoder().encode('data: {"type":"done"}\n')
        );
        controller.close();
      },
    });

    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      body: mockStream,
      status: 200,
      statusText: 'OK',
    });

    const { result } = renderHook(() =>
      useChatStream({ tenantId: 'tenant-123' })
    );

    await act(async () => {
      await result.current.sendMessage('Test');
    });

    const call = (global.fetch as any).mock.calls[0];
    const headers = call[1].headers;
    expect(headers['X-Tenant-Id']).toBe('tenant-123');
  });

  it('uses custom API URL when provided', async () => {
    global.fetch = vi.fn();

    const mockStream = new ReadableStream({
      start(controller) {
        controller.enqueue(
          new TextEncoder().encode('data: {"type":"done"}\n')
        );
        controller.close();
      },
    });

    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      body: mockStream,
      status: 200,
      statusText: 'OK',
    });

    const { result } = renderHook(() =>
      useChatStream({ apiUrl: '/custom/api' })
    );

    await act(async () => {
      await result.current.sendMessage('Test');
    });

    const call = (global.fetch as any).mock.calls[0];
    expect(call[0]).toBe('/custom/api');
  });

  it('ignores empty or whitespace-only messages', async () => {
    const { result } = renderHook(() => useChatStream());

    await act(async () => {
      await result.current.sendMessage('');
      await result.current.sendMessage('   ');
    });

    expect(result.current.messages).toHaveLength(0);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('streams tokens progressively into message content', async () => {
    global.fetch = vi.fn();

    const mockStream = new ReadableStream({
      start(controller) {
        controller.enqueue(
          new TextEncoder().encode('data: {"type":"token","token":"Hello "}\n')
        );
        controller.enqueue(
          new TextEncoder().encode('data: {"type":"token","token":"world"}\n')
        );
        controller.enqueue(
          new TextEncoder().encode('data: {"type":"done"}\n')
        );
        controller.close();
      },
    });

    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      body: mockStream,
      status: 200,
      statusText: 'OK',
    });

    const { result } = renderHook(() => useChatStream());

    await act(async () => {
      await result.current.sendMessage('Test');
    });

    await waitFor(() => {
      const assistantMsg = result.current.messages[1];
      expect(assistantMsg.content).toBe('Hello world');
    });
  });

  it('handles API errors gracefully', async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
    });

    const { result } = renderHook(() => useChatStream());

    await act(async () => {
      await result.current.sendMessage('Test').catch(() => {
        // Expected error
      });
    });

    expect(result.current.error).toContain('500');
  });

  it('passes language preference in Accept-Language header', async () => {
    global.fetch = vi.fn();

    const mockStream = new ReadableStream({
      start(controller) {
        controller.enqueue(
          new TextEncoder().encode('data: {"type":"done"}\n')
        );
        controller.close();
      },
    });

    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      body: mockStream,
      status: 200,
      statusText: 'OK',
    });

    const { result } = renderHook(() => useChatStream());

    await act(async () => {
      await result.current.sendMessage('Test');
    });

    const call = (global.fetch as any).mock.calls[0];
    const headers = call[1].headers;
    expect(headers['Accept-Language']).toBeDefined();
  });
});
