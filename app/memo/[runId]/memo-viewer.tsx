'use client';

import Link from 'next/link';
import { type ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
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

const STORAGE_KEY = 'cvm-theme-preference';

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

function SunIcon(): ReactNode {
  return (
    <svg
      width={16}
      height={16}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="2" />
      <path
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"
      />
    </svg>
  );
}

function MoonIcon(): ReactNode {
  return (
    <svg
      width={16}
      height={16}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <path
        d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function markdownComponents(isDark: boolean): Components {
  const border = isDark ? '#2a2a2a' : '#e5e5e5';
  const heading = isDark ? '#ffffff' : '#0a0a0a';
  const paragraph = isDark ? '#d4d4d4' : '#262626';
  const blockquoteFg = isDark ? '#9ca3af' : '#525252';
  const inlineCodeBg = isDark ? '#1a1a1a' : '#f5f5f5';

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
        style={{ color: '#0ea5e9', textDecoration: 'none' }}
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
  const [mode, setMode] = useState<'dark' | 'light'>('dark');
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setHydrated(true);
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored === 'light' || stored === 'dark') {
        setMode(stored);
      }
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(STORAGE_KEY, mode);
    } catch {
      /* ignore */
    }
  }, [mode, hydrated]);

  const isDark = mode === 'dark';
  const bg = isDark ? '#0a0a0a' : '#fafafa';
  const border = isDark ? '#2a2a2a' : '#e5e5e5';
  const backColor = isDark ? '#9ca3af' : '#6b7280';
  const headingColor = isDark ? '#ffffff' : '#0a0a0a';
  const subtextColor = isDark ? '#9ca3af' : '#6b7280';
  const metaValueColor = isDark ? '#ffffff' : '#0a0a0a';
  const toggleIconColor = isDark ? '#ffffff' : '#0a0a0a';

  const components = useMemo(() => markdownComponents(isDark), [isDark]);

  const toggleTheme = useCallback(() => {
    setMode((m) => (m === 'dark' ? 'light' : 'dark'));
  }, []);

  const costFormatted = `$${meta.costUsd.toFixed(2)}`;

  return (
    <div
      data-memo-theme={mode}
      style={{
        background: bg,
        minHeight: '100vh',
        color: headingColor,
        fontFamily: 'inherit',
        transition: 'background 0.15s ease',
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
          <button
            type="button"
            onClick={toggleTheme}
            aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
            style={{
              width: 32,
              height: 32,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'transparent',
              border: `0.5px solid ${border}`,
              borderRadius: 8,
              cursor: 'pointer',
              padding: 0,
              color: toggleIconColor,
            }}
          >
            {isDark ? <SunIcon /> : <MoonIcon />}
          </button>
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
          ).map(({ label, node }) => (
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
