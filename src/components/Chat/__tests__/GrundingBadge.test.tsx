import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { GrundingBadge } from '../GrundingBadge';

describe('GrundingBadge', () => {
  it('renders grounded state with checkmark', () => {
    render(<GrundingBadge state="grounded" />);
    expect(screen.getByText('Grounded in GACAR')).toBeInTheDocument();
    expect(screen.getByText('✓')).toBeInTheDocument();
  });

  it('renders partial state with warning icon', () => {
    render(<GrundingBadge state="partial" />);
    expect(screen.getByText('Partially grounded')).toBeInTheDocument();
    expect(screen.getByText('⚠')).toBeInTheDocument();
  });

  it('renders refusal state with X icon', () => {
    render(<GrundingBadge state="refusal" />);
    expect(screen.getByText('Cannot ground in GACAR')).toBeInTheDocument();
    expect(screen.getByText('✕')).toBeInTheDocument();
  });

  it('sets role="status" for screen readers', () => {
    const { container } = render(<GrundingBadge state="grounded" />);
    expect(container.querySelector('[role="status"]')).toBeInTheDocument();
  });

  it('renders expand button only when sources are provided', () => {
    const { rerender } = render(<GrundingBadge state="grounded" sources={[]} />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();

    rerender(<GrundingBadge state="grounded" sources={['§91.155']} />);
    expect(screen.getByRole('button')).toBeInTheDocument();
  });

  it('expands and collapses sources list on button click', () => {
    render(<GrundingBadge state="grounded" sources={['§91.155', '§135.61']} />);

    const button = screen.getByRole('button');
    expect(button).toHaveAttribute('aria-expanded', 'false');

    fireEvent.click(button);
    expect(button).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('region', { name: /Citation sources/ })).toBeInTheDocument();

    fireEvent.click(button);
    expect(button).toHaveAttribute('aria-expanded', 'false');
  });

  it('renders all provided sources in list', () => {
    render(
      <GrundingBadge
        state="grounded"
        sources={['§91.155', '§135.61', '§141.39']}
      />
    );

    fireEvent.click(screen.getByRole('button'));

    expect(screen.getByText('§91.155')).toBeInTheDocument();
    expect(screen.getByText('§135.61')).toBeInTheDocument();
    expect(screen.getByText('§141.39')).toBeInTheDocument();
  });

  it('makes source links focusable and accessible', () => {
    render(<GrundingBadge state="grounded" sources={['§91.155']} />);

    fireEvent.click(screen.getByRole('button'));

    const link = screen.getByRole('link', { name: /GACAR citation/ });
    expect(link).toHaveAttribute('href', '#§91.155');
    expect(link).toHaveAttribute('aria-label');
  });

  it('renders BDI tags around sources for RTL support', () => {
    const { container } = render(
      <GrundingBadge state="grounded" sources={['§91.155']} />
    );

    fireEvent.click(screen.getByRole('button'));

    const bdi = container.querySelector('bdi');
    expect(bdi).toBeInTheDocument();
    expect(bdi?.textContent).toBe('§91.155');
  });

  it('applies correct styling class based on state', () => {
    const { rerender, container } = render(<GrundingBadge state="grounded" />);
    expect(container.querySelector('.badge')).toHaveClass('grounded');

    rerender(<GrundingBadge state="partial" />);
    expect(container.querySelector('.badge')).toHaveClass('partial');

    rerender(<GrundingBadge state="refusal" />);
    expect(container.querySelector('.badge')).toHaveClass('refusal');
  });

  it('renders without sources by default', () => {
    render(<GrundingBadge state="grounded" />);
    expect(screen.queryByRole('region')).not.toBeInTheDocument();
  });

  it('handles empty sources array', () => {
    render(<GrundingBadge state="grounded" sources={[]} />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('button updates aria-label text when expanding', () => {
    render(<GrundingBadge state="grounded" sources={['§91.155']} />);

    const button = screen.getByRole('button');
    expect(button).toHaveAttribute('aria-label', 'Expand sources');

    fireEvent.click(button);
    expect(button).toHaveAttribute('aria-label', 'Collapse sources');
  });

  it('applies accessibility label to badge status', () => {
    render(<GrundingBadge state="grounded" />);
    const badge = screen.getByRole('status');
    expect(badge).toHaveAttribute('aria-label', 'Grounded in GACAR');
  });

  it('handles long source lists with scrolling', () => {
    const sources = Array.from({ length: 20 }, (_, i) => `§${90 + i}.${100 + i}`);
    const { container } = render(
      <GrundingBadge state="grounded" sources={sources} />
    );

    fireEvent.click(screen.getByRole('button'));

    const list = container.querySelector('.sourcesList');
    expect(list).toHaveClass('sourcesList');
    // CSS max-height and overflow-y will handle scrolling
  });
});
