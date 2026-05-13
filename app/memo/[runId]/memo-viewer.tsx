'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import ReactMarkdown from 'react-markdown';
import type { Components } from 'react-markdown';

export type MemoViewerMeta = {
  companyName: string;
  coverageGrade: 'STRONG' | 'MODERATE' | 'THIN';
  themeCount: number;
  sourceCount: number;
  generatedAt: string;
  costUsd: number;
};

export type MemoViewerProps = {
  markdown: string;
  meta: MemoViewerMeta;
};

const COLORS = {
  green: '#1d9e75',
  greenBg: 'rgba(29, 158, 117, 0.1)',
  amber: '#ba7517',
  amberBg: 'rgba(186, 117, 23, 0.1)',
} as const;

const badgeBaseStyle = {
  display: 'inline-block' as const,
  padding: '3px 8px',
  borderRadius: 4,
  fontSize: 11,
  letterSpacing: '0.03em',
  fontWeight: 500,
};

function CoverageBadge({
  grade,
}: {
  grade: MemoViewerMeta['coverageGrade'];
}): ReactNode {
  if (grade === 'MODERATE' || grade === 'STRONG') {
    const label = grade === 'STRONG' ? 'STRONG' : 'MODERATE';
    return (
      <span
        style={{
          ...badgeBaseStyle,
          color: COLORS.green,
          background: COLORS.greenBg,
        }}
      >
        {label}
      </span>
    );
  }
  return (
    <span
      style={{
        ...badgeBaseStyle,
        color: COLORS.amber,
        background: COLORS.amberBg,
      }}
    >
      THIN
    </span>
  );
}

function markdownComponents(): Components {
  const border = 'var(--line)';
  const heading = 'var(--ink)';
  const paragraph = 'var(--ink-2)';
  const blockquoteFg = 'var(--muted)';
  const inlineCodeBg = 'var(--paper-2)';

  const headingStyle = (fontSize: number, marginTop: number, marginBottom: number) => ({
    fontSize,
    fontWeight: 500,
    marginTop,
    marginBottom,
    lineHeight: 1.3,
    color: heading,
  });

  return {
    h1: ({ children }) => (
      <h1
        style={{
          ...headingStyle(28, 48, 16),
        }}
      >
        {children}
      </h1>
    ),
    h2: ({ children }) => <h2 style={headingStyle(22, 40, 12)}>{children}</h2>,
    h3: ({ children }) => <h3 style={headingStyle(18, 28, 8)}>{children}</h3>,
    p: ({ children }) => (
      <p
        style={{
          fontSize: 16,
          lineHeight: 1.75,
          margin: '0 0 16px',
          color: paragraph,
        }}
      >
        {children}
      </p>
    ),
    blockquote: ({ children }) => (
      <blockquote
        style={{
          fontSize: 16,
          lineHeight: 1.7,
          paddingLeft: 16,
          borderLeft: `2px solid ${border}`,
          margin: '16px 0',
          color: blockquoteFg,
          fontStyle: 'italic',
        }}
      >
        {children}
      </blockquote>
    ),
    ul: ({ children }) => (
      <ul style={{ paddingLeft: 24, margin: '0 0 16px' }}>{children}</ul>
    ),
    ol: ({ children }) => (
      <ol style={{ paddingLeft: 24, margin: '0 0 16px' }}>{children}</ol>
    ),
    li: ({ children }) => (
      <li style={{ fontSize: 16, lineHeight: 1.75, marginBottom: 4, color: paragraph }}>
        {children}
      </li>
    ),
    a: ({ children, ...props }) => (
      <a
        {...props}
        style={{ color: 'var(--info)', textDecoration: 'none' }}
      >
        {children}
      </a>
    ),
    strong: ({ children }) => (
      <strong style={{ fontWeight: 500, color: heading }}>{children}</strong>
    ),
    em: ({ children }) => (
      <em style={{ fontStyle: 'italic', color: paragraph }}>{children}</em>
    ),
    hr: () => (
      <hr style={{ border: 'none', borderTop: `0.5px solid ${border}`, margin: '48px 0' }} />
    ),
    code: ({ className, children, ...props }) => {
      const isBlockChild =
        typeof className === 'string' && /^language-/.test(className);
      if (isBlockChild) {
        return (
          <code className={className} {...props} style={{ fontFamily: 'monospace' }}>
            {children}
          </code>
        );
      }
      return (
        <code
          {...props}
          style={{
            fontFamily: 'monospace',
            fontSize: '0.9em',
            background: inlineCodeBg,
            padding: '2px 6px',
            borderRadius: 4,
            color: paragraph,
          }}
        >
          {children}
        </code>
      );
    },
    pre: ({ children }) => (
      <pre
        style={{
          background: inlineCodeBg,
          padding: 12,
          borderRadius: 8,
          overflow: 'auto',
          margin: '0 0 16px',
          border: `0.5px solid ${border}`,
        }}
      >
        {children}
      </pre>
    ),
  };
}

export function MemoViewer({ markdown, meta }: MemoViewerProps) {
  const border = 'var(--line)';
  const backColor = 'var(--muted)';
  const headingColor = 'var(--ink)';
  const subtextColor = 'var(--muted)';
  const metaValueColor = 'var(--ink)';
  const components = markdownComponents();
  const costFormatted = `$${meta.costUsd.toFixed(2)}`;

  return (
    <div
      style={{
        background: 'var(--paper)',
        minHeight: '100vh',
        color: headingColor,
        fontFamily: 'inherit',
      }}
    >
      <main
        style={{
          maxWidth: 720,
          margin: '0 auto',
          padding: '32px 48px 64px',
        }}
      >
        {/* Section 1 — Top nav */}
        <nav
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 32,
          }}
        >
          <Link
            href="/"
            className="memo-back-link"
            style={{
              fontSize: 14,
              fontWeight: 500,
              color: backColor,
              textDecoration: 'none',
              transition: 'color 0.15s ease',
            }}
          >
            ← Back to all memos
          </Link>
        </nav>

        {/* Section 2 — Memo header */}
        <header style={{ marginBottom: 24 }}>
          <p
            style={{
              fontSize: 11,
              fontWeight: 500,
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              color: '#6b7280',
              margin: 0,
              marginBottom: 12,
            }}
          >
            CUSTOMER VOICE MIRROR
          </p>
          <h1
            style={{
              fontSize: 32,
              fontWeight: 500,
              lineHeight: 1.2,
              letterSpacing: '-0.02em',
              margin: '0 0 8px',
              color: headingColor,
            }}
          >
            {meta.companyName}
          </h1>
          <p
            style={{
              fontSize: 14,
              color: subtextColor,
              margin: 0,
            }}
          >
            Generated {meta.generatedAt}
          </p>
        </header>

        {/* Section 3 — Metadata strip */}
        <section
          style={{
            padding: '16px 0',
            marginBottom: 48,
            borderTop: `0.5px solid ${border}`,
            borderBottom: `0.5px solid ${border}`,
            display: 'flex',
            flexWrap: 'wrap',
            gap: 32,
            alignItems: 'center',
          }}
        >
          {(
            [
              { label: 'SOURCES', node: meta.sourceCount },
              { label: 'THEMES', node: meta.themeCount },
              {
                label: 'COVERAGE',
                node: <CoverageBadge grade={meta.coverageGrade} />,
              },
              { label: 'COST', node: costFormatted },
            ] as const
          ).map(({ label, node }: { label: string; node: ReactNode }) => (
            <div key={label} style={{ flex: '0 0 auto', minHeight: '2.75rem', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 500,
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  color: '#6b7280',
                  marginBottom: 4,
                }}
              >
                {label}
              </div>
              <div
                style={{
                  fontSize: 14,
                  fontWeight: 500,
                  color: typeof node === 'string' || typeof node === 'number' ? metaValueColor : undefined,
                  display: 'flex',
                  alignItems: 'center',
                }}
              >
                {node}
              </div>
            </div>
          ))}
        </section>

        {/* Section 4 — Memo body */}
        <article className="memo-md-root">
          <ReactMarkdown components={components}>{markdown}</ReactMarkdown>
        </article>

        {/* Section 5 — Footer */}
        <footer
          style={{
            marginTop: 64,
            paddingTop: 24,
            borderTop: `0.5px solid ${border}`,
          }}
        >
          <p
            style={{
              fontSize: 12,
              color: '#6b7280',
              lineHeight: 1.5,
              margin: 0,
            }}
          >
            This memo summarizes patterns in public customer voice. It does not
            interpret strategic implications. The reader draws their own conclusions.
          </p>
        </footer>
      </main>
    </div>
  );
}
