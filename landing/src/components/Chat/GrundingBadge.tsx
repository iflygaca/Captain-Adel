import React from 'react';
import styles from './GrundingBadge.module.css';

export interface GrundingBadgeProps {
  state: 'grounded' | 'partial' | 'refusal';
  section?: string;
}

const GrundingBadge: React.FC<GrundingBadgeProps> = ({ state, section }) => {
  const icons = {
    grounded: '✓',
    partial: '⚠',
    refusal: '✕',
  };

  const labels = {
    grounded: section ? `Cited: GACAR §${section}` : 'Grounded in GACAR',
    partial: section ? `Cited: §${section} (partial)` : 'Partially grounded',
    refusal: 'Cannot cite relevant section',
  };

  return (
    <span
      className={`${styles.badge} ${styles[state]}`}
      role="status"
      aria-label={labels[state]}
    >
      <span className={styles.icon}>{icons[state]}</span>
      <span className={styles.label}>{labels[state]}</span>
    </span>
  );
};

export default GrundingBadge;
