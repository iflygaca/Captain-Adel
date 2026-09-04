import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../hooks/useAuth';
import { useChatStream } from '../hooks/useChatStream';
import styles from './Chat.module.css';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp?: string;
}

/**
 * Chat page for the landing app.
 * Displays a conversation interface with Captain Adel.
 * Guards access with authentication and initializes the chat stream.
 */
export default function Chat() {
  const { t, i18n } = useTranslation();
  const { user, loading: authLoading } = useAuth();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const { stream, abort } = useChatStream({
    apiUrl: '/api/chat',
    tenantId: user?.tenantId,
    onToken: (token) => {
      setMessages((prev) => {
        const lastMessage = prev[prev.length - 1];
        if (lastMessage?.role === 'assistant') {
          return [
            ...prev.slice(0, -1),
            {
              ...lastMessage,
              content: lastMessage.content + token,
            },
          ];
        }
        return prev;
      });
    },
    onError: (error) => {
      console.error('Chat stream error:', error);
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: t('chat.error', 'Sorry, there was an error processing your message.'),
          timestamp: new Date().toLocaleTimeString(),
        },
      ]);
      setIsStreaming(false);
    },
    onDone: () => {
      setIsStreaming(false);
    },
  });

  // Redirect to home if not authenticated
  useEffect(() => {
    if (!authLoading && !user) {
      window.location.href = '/';
    }
  }, [user, authLoading]);

  const handleSendMessage = async () => {
    if (!input.trim() || isStreaming) {
      return;
    }

    const userMessage: ChatMessage = {
      role: 'user',
      content: input,
      timestamp: new Date().toLocaleTimeString(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setIsStreaming(true);

    const assistantMessage: ChatMessage = {
      role: 'assistant',
      content: '',
      timestamp: new Date().toLocaleTimeString(),
    };
    setMessages((prev) => [...prev, assistantMessage]);

    try {
      await stream({
        message: input,
        language: i18n.language,
      });
    } catch (error) {
      console.error('Failed to stream message:', error);
      setIsStreaming(false);
    }
  };

  if (authLoading) {
    return (
      <div className={styles.container}>
        <div className={styles.loading}>{t('common.loading', 'Loading...')}</div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1>{t('chat.title', 'Captain Adel')}</h1>
        <p className={styles.subtitle}>
          {t('chat.subtitle', 'Your GACAR flight instructor')}
        </p>
      </div>

      <div className={styles.messageList} role="log" aria-label={t('chat.messages', 'Chat messages')}>
        {messages.length === 0 ? (
          <div className={styles.welcome}>
            <p>{t('chat.welcome', 'Start a conversation about Saudi aviation regulations.')}</p>
          </div>
        ) : (
          messages.map((msg, idx) => (
            <div
              key={idx}
              className={`${styles.message} ${styles[msg.role]}`}
              role={msg.role === 'assistant' ? 'article' : 'complementary'}
              data-role={msg.role}
            >
              <div className={styles.bubble}>
                <div className={styles.content}>{msg.content}</div>
                {msg.timestamp && <div className={styles.time}>{msg.timestamp}</div>}
              </div>
            </div>
          ))
        )}
      </div>

      <div className={styles.inputArea}>
        <textarea
          className={styles.input}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && e.ctrlKey) {
              handleSendMessage();
            }
          }}
          placeholder={t('chat.placeholder', 'Ask about GACAR regulations...')}
          disabled={isStreaming}
          aria-label={t('chat.messageInput', 'Chat message input')}
        />
        <button
          className={styles.sendButton}
          onClick={handleSendMessage}
          disabled={!input.trim() || isStreaming}
          aria-label={t('chat.send', 'Send message')}
        >
          {isStreaming ? t('chat.streaming', 'Streaming...') : t('chat.send', 'Send')}
        </button>
        {isStreaming && (
          <button
            className={styles.cancelButton}
            onClick={abort}
            aria-label={t('chat.cancel', 'Cancel')}
          >
            {t('chat.cancel', 'Cancel')}
          </button>
        )}
      </div>
    </div>
  );
}
