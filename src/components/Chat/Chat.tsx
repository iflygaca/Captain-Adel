import React, { useRef, useEffect, useState } from 'react';
import { useChatStream } from '../../hooks/useChatStream';
import { ChatMessage } from './ChatMessage';
import { MarkdownView } from './MarkdownView';
import styles from './Chat.module.css';

export interface ChatProps {
  tenantId?: string;
  apiUrl?: string;
  onClearChat?: () => void;
}

export const Chat: React.FC<ChatProps> = ({ tenantId, apiUrl, onClearChat }) => {
  const { messages, isLoading, error, sendMessage, clearChat, sseError } = useChatStream({
    tenantId,
    apiUrl,
  });

  const [inputValue, setInputValue] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSendMessage = async () => {
    if (!inputValue.trim() || isSubmitting || isLoading) return;

    setIsSubmitting(true);
    try {
      await sendMessage(inputValue);
      setInputValue('');
      if (inputRef.current) {
        inputRef.current.style.height = 'auto';
      }
    } catch (err) {
      console.error('Failed to send message:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInputValue(e.target.value);
    // Auto-expand textarea
    e.target.style.height = 'auto';
    e.target.style.height = Math.min(e.target.scrollHeight, 200) + 'px';
  };

  const handleClear = () => {
    clearChat();
    setInputValue('');
    if (inputRef.current) {
      inputRef.current.style.height = 'auto';
    }
    onClearChat?.();
  };

  const displayError = error || sseError;

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1 className={styles.title}>Ask Captain Adel</h1>
        {messages.length > 0 && (
          <button
            className={styles.clearButton}
            onClick={handleClear}
            disabled={isLoading}
            aria-label="Clear chat history"
          >
            Clear
          </button>
        )}
      </div>

      <div className={styles.messagesContainer}>
        {messages.length === 0 && !displayError && (
          <div className={styles.emptyState}>
            <p>Welcome to Captain Adel, your AI flight instructor.</p>
            <p>Ask me anything about GACAR, flight operations, or your studies.</p>
          </div>
        )}

        {displayError && (
          <div className={styles.errorBanner} role="alert">
            <p>{displayError}</p>
            {messages.length === 0 && (
              <button onClick={handleClear} className={styles.retryButton}>
                Retry
              </button>
            )}
          </div>
        )}

        {messages.map((message, index) => (
          <ChatMessage
            key={message.id}
            role={message.role}
            content={
              message.role === 'assistant' && message.content ? (
                <MarkdownView content={message.content} />
              ) : (
                message.content
              )
            }
            timestamp={message.timestamp}
            isStreaming={message.isStreaming}
            groundingState={message.groundingState}
            sources={message.sources}
            messageId={message.id}
          />
        ))}

        <div ref={messagesEndRef} />
      </div>

      <div className={styles.inputArea}>
        <div className={styles.inputWrapper}>
          <textarea
            ref={inputRef}
            className={styles.textarea}
            value={inputValue}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            placeholder="Ask Captain Adel a question... (Shift+Enter for new line)"
            disabled={isLoading || isSubmitting}
            rows={1}
            aria-label="Chat message input"
          />
          <button
            className={styles.sendButton}
            onClick={handleSendMessage}
            disabled={!inputValue.trim() || isLoading || isSubmitting}
            aria-label="Send message"
          >
            {isLoading || isSubmitting ? 'Sending...' : 'Send'}
          </button>
        </div>
        {isLoading && (
          <p className={styles.loadingIndicator} aria-live="polite">
            Captain Adel is thinking...
          </p>
        )}
      </div>
    </div>
  );
};

export default Chat;
