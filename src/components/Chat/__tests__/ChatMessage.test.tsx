import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ChatMessage } from '../ChatMessage';

describe('ChatMessage', () => {
  it('renders user message with correct styling', () => {
    const { container } = render(
      <ChatMessage role="user" content="What is GACAR?" />
    );

    expect(screen.getByText('What is GACAR?')).toBeInTheDocument();
    const messageContainer = container.querySelector('[data-role="user"]');
    expect(messageContainer).toHaveClass('userMessageContainer');
  });

  it('renders assistant message with correct styling', () => {
    const { container } = render(
      <ChatMessage role="assistant" content="GACAR is the General Authority of Civil Aviation Regulations." />
    );

    expect(screen.getByText(/GACAR is the General Authority/)).toBeInTheDocument();
    const messageContainer = container.querySelector('[data-role="assistant"]');
    expect(messageContainer).toHaveClass('assistantMessageContainer');
  });

  it('renders timestamp when provided', () => {
    const testDate = new Date('2026-09-04T14:30:00');
    const { container } = render(
      <ChatMessage role="user" content="Test" timestamp={testDate} />
    );

    // Check for time formatting (locale-dependent, so just verify it exists)
    const timeStr = testDate.toLocaleTimeString(undefined, {
      hour: '2-digit',
      minute: '2-digit',
    });
    expect(screen.getByText(timeStr)).toBeInTheDocument();
  });

  it('renders streaming indicator for assistant message when isStreaming=true', () => {
    const { container } = render(
      <ChatMessage role="assistant" content="Streaming..." isStreaming={true} />
    );

    const dots = container.querySelectorAll('.typingDot');
    expect(dots.length).toBe(3);
  });

  it('does not render streaming indicator for user messages', () => {
    const { container } = render(
      <ChatMessage role="user" content="Test" isStreaming={true} />
    );

    const dots = container.querySelectorAll('.typingDot');
    expect(dots.length).toBe(0);
  });

  it('renders grounding badge for assistant messages', () => {
    const { container } = render(
      <ChatMessage
        role="assistant"
        content="Test"
        groundingState="grounded"
      />
    );

    const badge = container.querySelector('[role="status"]');
    expect(badge).toBeInTheDocument();
  });

  it('does not render grounding badge for user messages', () => {
    const { container } = render(
      <ChatMessage
        role="user"
        content="Test"
        groundingState="grounded"
      />
    );

    const badge = container.querySelector('[role="status"]');
    expect(badge).not.toBeInTheDocument();
  });

  it('sets data-message-id attribute', () => {
    const { container } = render(
      <ChatMessage role="user" content="Test" messageId="msg-123" />
    );

    const messageContainer = container.querySelector('[data-message-id="msg-123"]');
    expect(messageContainer).toBeInTheDocument();
  });

  it('handles React ReactNode content', () => {
    const { container } = render(
      <ChatMessage
        role="assistant"
        content={<span data-testid="custom-content">Custom HTML</span>}
      />
    );

    expect(screen.getByTestId('custom-content')).toBeInTheDocument();
  });

  it('applies responsive classes correctly', () => {
    const { container } = render(
      <ChatMessage role="user" content="Test message" />
    );

    const messageBubble = container.querySelector('.userMessage');
    expect(messageBubble).toBeInTheDocument();
    // CSS Module applies max-width: min(600px, 100%)
    const computedStyle = window.getComputedStyle(messageBubble!);
    // Cannot test CSS computed values in JSDOM without actual rendering, but structure is correct
    expect(messageBubble).toHaveClass('userMessage');
  });

  it('renders without timestamp when not provided', () => {
    const { container } = render(
      <ChatMessage role="user" content="Test" />
    );

    const timestampElement = container.querySelector('.timestamp');
    expect(timestampElement).not.toBeInTheDocument();
  });
});
