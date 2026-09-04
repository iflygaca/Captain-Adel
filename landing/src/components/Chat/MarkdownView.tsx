import React, { useMemo } from 'react';
import DOMPurify from 'dompurify';
import styles from './MarkdownView.module.css';

export interface MarkdownViewProps {
  markdown: string;
  showCitations?: boolean;
}

const MarkdownView: React.FC<MarkdownViewProps> = ({ markdown, showCitations = false }) => {
  const html = useMemo(() => {
    let result = markdown
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/__(.*?)__/g, '<u>$1</u>')
      .replace(/\[(.*?)\]\((https?:\/\/[^\)]+|\/[^\)]+|mailto:[^\)]+)\)/g, '<a href="$2">$1</a>')
      .replace(/^- (.+)$/gm, '<li>$1</li>')
      .replace(/^(\d+)\. (.+)$/gm, '<li>$2</li>')
      .replace(/(?:^|\n)- /gm, (match) => match === '\n- ' ? '' : '<ul><li>')
      .replace(/(<li>.*<\/li>)/s, (match) => {
        const isOrdered = /^\d+\./.test(markdown);
        const tag = isOrdered ? 'ol' : 'ul';
        return `<${tag}>${match}</${tag}>`;
      })
      .replace(/\n\n/g, '</p><p>')
      .replace(/§(\d+\.\d+)/g, '<bdi data-section="$1">§$1</bdi>');

    if (!result.includes('<p>')) {
      result = `<p>${result}</p>`;
    }

    const config = {
      ALLOWED_TAGS: ['p', 'ul', 'ol', 'li', 'strong', 'em', 'u', 'a', 'span', 'bdi', 'br'],
      ALLOWED_ATTR: ['href', 'data-section', 'aria-label', 'role', 'tabindex'],
      KEEP_CONTENT: true,
    };

    return DOMPurify.sanitize(result, config);
  }, [markdown]);

  return (
    <div
      className={styles.markdown}
      dangerouslySetInnerHTML={{ __html: html }}
      role="region"
      aria-live="polite"
    />
  );
};

export default MarkdownView;
