import React from 'react';
import styles from './ChatMessage.module.css';
import { GrundingBadge, GrundingState } from './GrundingBadge';

interface ChatMessageProps {
  /** 'user' for user messages, 'assistant' for Captain Adel messages */
  role: 'user' | 'assistant';
  /** Message content (markdown string, already sanitized) */
  content: React.ReactNode;
  /** Optional timestamp for the message */
  timestamp?: Date;
  /** Whether the message is currently streaming */
  isStreaming?: boolean;
  /** Grounding state badge (assistant messages only) */
  groundingState?: GrundingState;
  /** Optional GACAR sources for the answer */
  sources?: string[];
  /** Optional message ID for tracking */
  messageId?: string;
}

/**
 * ChatMessage component renders a single message in the chat interface.
 * Supports both user and assistant (Captain Adel) messages with full token-based styling.
 * RTL-aware with proper alignment and animation support.
 */
export const ChatMessage: React.FC<ChatMessageProps> = ({
  role,
  content,
  timestamp,
  isStreaming = false,
  groundingState = 'grounded',
  sources,
  messageId,
}) => {
  const containerClass =
    role === 'user' ? styles.userMessageContainer : styles.assistantMessageContainer;
  const messageClass = role === 'user' ? styles.userMessage : styles.assistantMessage;

  const formatTime = (date: Date): string => {
    return date.toLocaleTimeString(undefined, {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className={containerClass} data-message-id={messageId} data-role={role}>
      <div className={messageClass} data-testid="message-bubble">
        {/* Message content */}
        <div className={styles.content}>{content}</div>

        {/* Timestamp */}
        {timestamp && <div className={styles.timestamp} data-testid="timestamp">{formatTime(timestamp)}</div>}

        {/* Streaming indicator for assistant messages */}
        {isStreaming && role === 'assistant' && (
          <div className={styles.streamingIndicator}>
            <span className={styles.typingDot} data-testid="typing-dot"></span>
            <span className={styles.typingDot} data-testid="typing-dot"></span>
            <span className={styles.typingDot} data-testid="typing-dot"></span>
          </div>
        )}
      </div>

      {/* Grounding badge for assistant messages */}
      {role === 'assistant' && (
        <div className={styles.badgeContainer}>
          <GrundingBadge state={groundingState} sources={sources} />
        </div>
      )}
    </div>
  );
};

export default ChatMessage;
