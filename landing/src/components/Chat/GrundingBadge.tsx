import React from 'react';
import styles from './GrundingBadge.module.css';

export type GrundingState = 'grounded' | 'partial' | 'refusal';

interface GrundingBadgeProps {
  /** Grounding state: grounded (full citations), partial (some citations), refusal (no citations) */
  state: GrundingState;
  /** Optional GACAR sources/citations for tooltip or expandable view */
  sources?: string[];
}

/**
 * GrundingBadge displays the citation/grounding status of an AI response.
 * Three states: grounded (green), partial (amber), refusal (red).
 * Token-based styling with RTL support and accessibility attributes.
 */
export const GrundingBadge: React.FC<GrundingBadgeProps> = ({ state, sources = [] }) => {
  const [expanded, setExpanded] = React.useState(false);

  const stateConfig = {
    grounded: {
      label: 'Grounded in GACAR',
      icon: '✓',
      color: 'var(--color-data-positive, #10B981)',
      className: styles.grounded,
    },
    partial: {
      label: 'Partially grounded',
      icon: '⚠',
      color: 'var(--color-data-neutral, #6B7280)',
      className: styles.partial,
    },
    refusal: {
      label: 'Cannot ground in GACAR',
      icon: '✕',
      color: 'var(--color-data-negative, #EF4444)',
      className: styles.refusal,
    },
  };

  const config = stateConfig[state];

  return (
    <div className={`${styles.badge} ${config.className}`} role="status" aria-label={config.label}>
      <span className={styles.icon} style={{ color: config.color }}>
        {config.icon}
      </span>
      <span className={styles.label}>{config.label}</span>

      {sources.length > 0 && (
        <button
          className={styles.expandButton}
          onClick={() => setExpanded(!expanded)}
          aria-expanded={expanded}
          aria-label={`${expanded ? 'Collapse' : 'Expand'} sources`}
          type="button"
        >
          {expanded ? '−' : '+'}
        </button>
      )}

      {expanded && sources.length > 0 && (
        <div className={styles.sourcesList} role="region" aria-label="Citation sources">
          {sources.map((source, idx) => (
            <div key={idx} className={styles.sourceItem}>
              <a
                href={`#${source}`}
                className={styles.sourceLink}
                aria-label={`GACAR citation: ${source}`}
              >
                <bdi>{source}</bdi>
              </a>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default GrundingBadge;
