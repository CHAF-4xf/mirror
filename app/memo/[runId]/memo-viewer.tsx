import Link from 'next/link';
import type { ReactNode } from 'react';
import { CoverageBadge } from '@/app/_components/coverage-badge';
import { QuoteStack } from '@/app/_components/quote-stack';
import type { CoverageGrade, MemoDTO, SplitFinding, ThemeDTO } from '@/types';

export type MemoViewerMeta = {
  companyName: string;
  companyDomain: string;
  coverageGrade: CoverageGrade;
  generatedAt: string;
  costUsd: number;
  runtimeSeconds: number;
};

export type MemoViewerProps = {
  memo: MemoDTO;
  meta: MemoViewerMeta;
};

function Section({ num, label, children }: {
  num: string;
  label: string;
  children: ReactNode;
}) {
  return (
    <section style={{ marginBottom: 64 }}>
      <div style={{
        display: 'flex', alignItems: 'baseline', gap: 16,
        marginBottom: 24, paddingBottom: 12,
        borderBottom: '1px solid var(--line)',
      }}>
        <span className="mono" style={{ fontSize: 11, color: 'var(--muted-2)' }}>{num}</span>
        <span className="small-caps">{label}</span>
      </div>
      {children}
    </section>
  );
}

function MemoHeader({ meta }: { meta: MemoViewerMeta }) {
  return (
    <header
      style={{
        position: 'sticky',
        top: 53,
        zIndex: 30,
        background: 'var(--paper)',
        borderBottom: '1px solid var(--line)',
        padding: '20px 32px',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          gap: 24,
          flexWrap: 'wrap',
          alignItems: 'center',
        }}
      >
        <div>
          <div
            style={{
              display: 'flex',
              alignItems: 'baseline',
              gap: 16,
              flexWrap: 'wrap',
            }}
          >
            <span className="mono" style={{ fontSize: 11, color: 'var(--muted)' }}>
              memo
            </span>
            <span
              style={{
                fontSize: 18,
                fontWeight: 500,
                letterSpacing: '-.01em',
              }}
            >
              {meta.companyName}
              <span
                className="mono"
                style={{
                  fontWeight: 400,
                  marginLeft: 10,
                  fontSize: 12,
                  color: 'var(--muted)',
                }}
              >
                {meta.companyDomain}
              </span>
            </span>
          </div>
          <div className="micro" style={{ marginTop: 6 }}>
            generated {meta.generatedAt} · {meta.runtimeSeconds}s · ${meta.costUsd.toFixed(2)}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <CoverageBadge grade={meta.coverageGrade} />
          <span className="mono" style={{ color: 'var(--muted)' }}>·</span>
          <Link href="/" className="ghost-btn" style={{ textDecoration: 'none' }}>
            New analysis
          </Link>
        </div>
      </div>
    </header>
  );
}

function DominantPattern({ memo }: { memo: MemoDTO }) {
  return (
    <Section num="03" label="Dominant pattern">
      <div style={{
        padding: '32px 36px',
        border: '1px solid var(--ink)',
        borderRadius: 4,
        background: 'var(--paper)',
      }}>
        <div className="small-caps" style={{ color: 'var(--accent)', marginBottom: 14 }}>
          falsifiable claim
        </div>
        <div className="serif" style={{
          fontSize: 28,
          lineHeight: 1.3,
          letterSpacing: '-0.01em',
          color: 'var(--ink)',
        }}>
          {memo.dominantPattern.statement}
        </div>
        {memo.dominantPattern.falsifiabilityCheck === 'SPECIFIC' ? (
          <span className="pill" style={{ marginTop: 18 }}>
            <span className="dot" style={{ background: 'var(--accent-2)' }} />
            Verified specific
          </span>
        ) : null}
      </div>
    </Section>
  );
}

function SplitFindings({ splits }: { splits: SplitFinding[] }) {
  if (splits.length === 0) return null;

  return (
    <Section num="02" label="Split findings">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 40 }}>
        {splits.map((split: SplitFinding, index: number) => (
          <div key={`${split.theme}-${index}`}>
            <h2
              style={{
                fontSize: 17,
                fontWeight: 500,
                letterSpacing: '-0.01em',
                margin: '0 0 18px',
              }}
            >
              Split finding: {split.theme}
            </h2>
            <div
              style={{
                fontSize: 17,
                fontWeight: 500,
                padding: 16,
                background: 'var(--paper-2)',
                borderLeft: '3px solid var(--accent)',
              }}
            >
              {split.pattern_a.claim}
            </div>
            <QuoteStack quotes={split.pattern_a.supporting_quotes} />
            <div
              style={{
                fontSize: 17,
                fontWeight: 500,
                padding: 16,
                background: 'var(--paper-2)',
                borderLeft: '3px solid var(--info)',
              }}
            >
              {split.pattern_b.claim}
            </div>
            <QuoteStack quotes={split.pattern_b.supporting_quotes} />
            <p
              style={{
                margin: '18px 0 0',
                color: 'var(--ink-2)',
                fontSize: 14,
                lineHeight: 1.6,
                fontStyle: 'italic',
              }}
            >
              <strong style={{ color: 'var(--ink)' }}>Why this isn&apos;t resolved:</strong>{' '}
              {split.why_unresolved}
            </p>
            {split.tier_note ? (
              <p
                style={{
                  margin: '8px 0 0',
                  color: 'var(--muted)',
                  fontSize: 13,
                  lineHeight: 1.5,
                  fontStyle: 'italic',
                }}
              >
                {split.tier_note}
              </p>
            ) : null}
          </div>
        ))}
      </div>
    </Section>
  );
}

function ThemeSection({
  num,
  label,
  themes,
  accent,
}: {
  num: string;
  label: string;
  themes: ThemeDTO[];
  accent: string;
}) {
  if (themes.length === 0) return null;

  return (
    <Section num={num} label={label}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 34 }}>
        {themes.map((theme: ThemeDTO, index: number) => (
          <div
            key={`${theme.category}-${index}`}
            style={{
              paddingLeft: 18,
              borderLeft: `2px solid ${accent}`,
            }}
          >
            <h2
              style={{
                fontSize: 17,
                fontWeight: 500,
                margin: '0 0 12px',
                letterSpacing: '-0.01em',
              }}
            >
              {theme.statement}
            </h2>
            <QuoteStack quotes={theme.verbatimQuotes} />
          </div>
        ))}
      </div>
    </Section>
  );
}

function CoverageLimitations({ memo }: { memo: MemoDTO }) {
  const coverage = memo.sourceCoverage;
  const limitations = coverage.limitations ?? [];

  return (
    <Section num="07" label="Coverage & limitations">
      <div style={{
        padding: '24px 28px',
        background: 'var(--paper-2)',
        border: '1px solid var(--line)',
        borderRadius: 8,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
          <CoverageBadge grade={coverage.coverageGrade} />
          <span className="mono" style={{ fontSize: 12, color: 'var(--muted)' }}>
            {coverage.totalSources} sources · {coverage.customerStories} stories · {coverage.redditPosts} reddit · {coverage.reviews} reviews
          </span>
        </div>
        {limitations.length > 0 ? (
          <p style={{
            fontSize: 14,
            lineHeight: 1.6,
            color: 'var(--ink-2)',
            margin: 0,
          }}>
            {limitations.join(' ')}
          </p>
        ) : null}
      </div>
    </Section>
  );
}

export function MemoViewer({ memo, meta }: MemoViewerProps) {
  const jtbdQuotes = memo.jobToBeDone.supportingQuotes.slice(0, 2);
  const splitFindings = memo.splitFindings ?? [];

  return (
    <>
      <MemoHeader meta={meta} />
      <main
        style={{
          maxWidth: 880,
          margin: '0 auto',
          padding: '56px 56px 120px',
          fontSize: 15,
          lineHeight: 1.65,
        }}
      >
        <Section num="01" label="Job to be done">
          <div className="serif" style={{
            fontSize: 32,
            lineHeight: 1.3,
            fontStyle: 'italic',
            color: 'var(--ink)',
            letterSpacing: '-0.01em',
            paddingLeft: 24,
            borderLeft: '3px solid var(--ink)',
            margin: '0 0 24px',
          }}>
            {memo.jobToBeDone.statement}
          </div>
          {jtbdQuotes.length > 0 ? (
            <>
              <p
                style={{
                  color: 'var(--muted)',
                  fontSize: 14,
                  lineHeight: 1.6,
                  margin: '0 0 6px',
                }}
              >
                Customers describe the same emotional core in their own words.
              </p>
              <QuoteStack quotes={jtbdQuotes} />
            </>
          ) : null}
        </Section>

        <SplitFindings splits={splitFindings} />
        <DominantPattern memo={memo} />
        <ThemeSection
          num="04"
          label="What customers love"
          themes={memo.whatTheyLove.themes}
          accent="var(--accent-2)"
        />
        <ThemeSection
          num="05"
          label="What frustrates them"
          themes={memo.whatFrustrates.themes}
          accent="var(--accent)"
        />
        <ThemeSection
          num="06"
          label="What they wish for"
          themes={memo.whatTheyWish.themes}
          accent="var(--info)"
        />
        <CoverageLimitations memo={memo} />
      </main>
    </>
  );
}
