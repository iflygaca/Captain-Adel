import React from 'react';
import { motion, Variants } from 'framer-motion';
import MarkdownView from './MarkdownView';
import GrundingBadge from './GrundingBadge';
import styles from './ChatMessage.module.css';

export interface Citation {
  section: string;
  label: string;
  url?: string;
}

export interface ChatMessageProps {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  citations?: Citation[];
  groundingState?: 'grounded' | 'partial' | 'refusal';
  groundingSection?: string;
  isStreaming?: boolean;
  timestamp?: Date;
}

const containerVariants: Variants = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.3, ease: 'easeOut' } },
};

const ChatMessage: React.FC<ChatMessageProps> = ({
  id,
  role,
  content,
  citations = [],
  groundingState,
  groundingSection,
  isStreaming = false,
  timestamp,
}) => {
  const isAssistant = role === 'assistant';
  const className = isAssistant ? styles.assistant : styles.user;
  const streamingCaret = isStreaming && isAssistant ? <span className={styles.caret} aria-label="typing indicator">▌</span> : null;

  return (
    <motion.article
      className={`${styles.message} ${className}`}
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      role="article"
      aria-label={`${isAssistant ? 'Captain Adel' : 'Your'} message${timestamp ? ` at ${timestamp.toLocaleTimeString()}` : ''}`}
      id={id}
    >
      <div className={styles.content}>
        <MarkdownView markdown={content} showCitations={isAssistant} />
        {streamingCaret}
      </div>
      {isAssistant && groundingState && (
        <GrundingBadge
          state={groundingState}
          citedSection={groundingSection || 'GACAR'}
        />
      )}
    </motion.article>
  );
};

export default ChatMessage;
