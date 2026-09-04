import React from 'react';
import styles from './MarkdownView.module.css';

interface MarkdownViewProps {
  /** Markdown string (already sanitized by DOMPurify) */
  content: string;
  /** Optional className for styling customization */
  className?: string;
}

/**
 * MarkdownView renders minimal Markdown (bold, links, lists, paragraphs, citations).
 * Input MUST be sanitized by DOMPurify before passing here.
 * RTL-aware: respects dir attribute on parent container.
 */
export const MarkdownView: React.FC<MarkdownViewProps> = ({ content, className = '' }) => {
  // Simple Markdown parser: bold (**text**), links ([text](url)), lists, paragraphs
  const parseMarkdown = (md: string): React.ReactNode[] => {
    const lines = md.split('\n');
    const result: React.ReactNode[] = [];
    let inList = false;
    let listItems: React.ReactNode[] = [];

    lines.forEach((line, idx) => {
      const trimmed = line.trim();

      // List item
      if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
        inList = true;
        const text = trimmed.substring(2);
        listItems.push(
          <li key={`item-${idx}`} className={styles.listItem}>
            {parseInline(text)}
          </li>
        );
      } else {
        // Flush list if we were in one
        if (inList && listItems.length > 0) {
          result.push(
            <ul key={`list-${idx}`} className={styles.list}>
              {listItems}
            </ul>
          );
          listItems = [];
          inList = false;
        }

        // Paragraph
        if (trimmed) {
          result.push(
            <p key={`p-${idx}`} className={styles.paragraph}>
              {parseInline(trimmed)}
            </p>
          );
        }
      }
    });

    // Final list flush
    if (inList && listItems.length > 0) {
      result.push(
        <ul key="list-final" className={styles.list}>
          {listItems}
        </ul>
      );
    }

    return result;
  };

  // Inline parsing: bold, links, citations (§123.45 format)
  const parseInline = (text: string): React.ReactNode[] => {
    const result: React.ReactNode[] = [];
    let lastIdx = 0;

    // Pattern: **bold**, [link text](url), §NNN.NNN (GACAR citations)
    const patterns = [
      { regex: /\*\*(.*?)\*\*/g, type: 'bold' as const },
      { regex: /\[(.*?)\]\((https?:\/\/[^\s)]+|mailto:[^\s)]+|\/[^\s)]*)\)/g, type: 'link' as const },
      { regex: /§\d+\.\d+/g, type: 'citation' as const },
    ];

    // Collect all matches with positions
    const matches: { start: number; end: number; type: string; groups: string[] }[] = [];
    patterns.forEach(({ regex, type }) => {
      let m;
      const pattern = new RegExp(regex.source, regex.flags);
      while ((m = pattern.exec(text))) {
        matches.push({
          start: m.index,
          end: m.index + m[0].length,
          type,
          groups: m.slice(1),
        });
      }
    });

    // Sort by position
    matches.sort((a, b) => a.start - b.start);

    matches.forEach((match, idx) => {
      // Add text before match
      if (lastIdx < match.start) {
        result.push(text.substring(lastIdx, match.start));
      }

      // Add match
      if (match.type === 'bold') {
        result.push(
          <strong key={`bold-${idx}`} className={styles.bold}>
            {match.groups[0]}
          </strong>
        );
      } else if (match.type === 'link') {
        const [linkText, href] = match.groups;
        // Validate URL: only http/https/mailto/relative
        const isValidUrl =
          /^(https?:\/\/|mailto:|\/)/i.test(href) && !/^(javascript|data|vbscript):/i.test(href);
        if (isValidUrl) {
          result.push(
            <a key={`link-${idx}`} href={href} className={styles.link} target="_blank" rel="noopener noreferrer">
              {linkText}
            </a>
          );
        } else {
          result.push(linkText);
        }
      } else if (match.type === 'citation') {
        const citationText = text.substring(match.start, match.end);
        result.push(
          <span
            key={`cite-${idx}`}
            className={styles.citation}
            role="doc-biblioref"
            aria-label={`GACAR section ${citationText}`}
            tabIndex={0}
          >
            <bdi>{citationText}</bdi>
          </span>
        );
      }

      lastIdx = match.end;
    });

    // Final text
    if (lastIdx < text.length) {
      result.push(text.substring(lastIdx));
    }

    return result.length ? result : [text];
  };

  const parsed = parseMarkdown(content);

  return <div className={`${styles.root} ${className}`}>{parsed}</div>;
};

export default MarkdownView;
