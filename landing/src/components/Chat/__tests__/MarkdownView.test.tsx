import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MarkdownView } from '../MarkdownView';

describe('MarkdownView', () => {
  it('renders paragraph text', () => {
    render(<MarkdownView content="This is a paragraph." />);
    expect(screen.getByText('This is a paragraph.')).toBeInTheDocument();
  });

  it('parses bold syntax (**text**)', () => {
    render(<MarkdownView content="This is **bold** text." />);
    const bold = screen.getByText('bold');
    expect(bold.tagName).toBe('STRONG');
  });

  it('parses links ([text](url))', () => {
    render(
      <MarkdownView content="Visit [Fly GACA](https://flygaca.com) for more." />
    );
    const link = screen.getByRole('link', { name: /Fly GACA/ });
    expect(link).toHaveAttribute('href', 'https://flygaca.com');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('rejects invalid URLs (javascript:, data:)', () => {
    const { container } = render(
      <MarkdownView content="Bad link: [click](javascript:alert('xss'))" />
    );

    const link = container.querySelector('a');
    expect(link).not.toBeInTheDocument();
  });

  it('accepts mailto: links', () => {
    render(<MarkdownView content="Email [support](mailto:support@flygaca.com)" />);
    const link = screen.getByRole('link', { name: /support/ });
    expect(link).toHaveAttribute('href', 'mailto:support@flygaca.com');
  });

  it('accepts relative links', () => {
    render(<MarkdownView content="Go to [home](/)" />);
    const link = screen.getByRole('link', { name: /home/ });
    expect(link).toHaveAttribute('href', '/');
  });

  it('parses GACAR citations (§NNN.NNN)', () => {
    render(<MarkdownView content="Per §91.155, pilots must maintain VFR minima." />);
    const citation = screen.getByRole('doc-biblioref');
    expect(citation).toHaveAttribute('aria-label', 'GACAR section §91.155');
  });

  it('renders unordered lists', () => {
    const listContent = `Requirements:
- Maintain altitude
- Check weather
- File flight plan`;

    const { container } = render(<MarkdownView content={listContent} />);
    const list = container.querySelector('ul');
    expect(list).toBeInTheDocument();

    const items = container.querySelectorAll('li');
    expect(items.length).toBe(3);
  });

  it('handles multiple paragraphs', () => {
    const content = `First paragraph.

Second paragraph.

Third paragraph.`;

    const { container } = render(<MarkdownView content={content} />);
    const paragraphs = container.querySelectorAll('p');
    expect(paragraphs.length).toBe(3);
  });

  it('combines multiple markdown features in one passage', () => {
    const content = `According to **GACAR §91.155**, you must:
- Maintain visual reference to ground
- Have [charts](https://flygaca.com) available
- Check [weather](https://example.com)`;

    const { container } = render(<MarkdownView content={content} />);

    expect(container.textContent).toContain('GACAR');
    expect(container.textContent).toContain('§91.155');
    const links = container.querySelectorAll('a');
    expect(links.length).toBe(2);
  });

  it('applies accessibility attributes to citations', () => {
    const { container } = render(<MarkdownView content="Per §91.155, altitude rules apply." />);
    const citation = container.querySelector('[role="doc-biblioref"]');
    expect(citation).toHaveAttribute('aria-label');
    expect(citation?.getAttribute('aria-label')).toContain('§91.155');
  });

  it('renders BDI tags around citations for RTL text support', () => {
    const { container } = render(<MarkdownView content="Per §91.155, altitude rules." />);
    const bdi = container.querySelector('bdi');
    expect(bdi).toBeInTheDocument();
    expect(bdi?.textContent).toContain('§91.155');
  });

  it('makes citations focusable', () => {
    const { container } = render(<MarkdownView content="Per §91.155, rules apply." />);
    const citation = container.querySelector('[role="doc-biblioref"]');
    expect(citation).toHaveAttribute('tabIndex', '0');
  });

  it('handles empty content gracefully', () => {
    const { container } = render(<MarkdownView content="" />);
    expect(container.firstChild).toBeInTheDocument();
  });

  it('applies custom className', () => {
    const { container } = render(
      <MarkdownView content="Test" className="custom-class" />
    );
    expect(container.firstChild).toHaveClass('custom-class');
  });

  it('escapes HTML special characters in text nodes', () => {
    const { container } = render(<MarkdownView content="Test <script>alert('xss')</script>" />);
    // Text should be escaped, not executed
    expect(screen.getByText(/script/)).toBeInTheDocument();
    const scripts = container.querySelectorAll('script');
    expect(scripts.length).toBe(0);
  });
});
