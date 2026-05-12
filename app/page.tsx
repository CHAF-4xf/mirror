import Link from "next/link";
import type { CSSProperties, ReactElement } from "react";
import {
  type DemoRunListRow,
  headlineFindingFromJTBD,
  listDemoRuns,
} from "@/lib/demo-runs";
import { LANDING_COLORS as COLORS, eyebrowStyle } from "@/lib/landing-theme";
import type { MemoDTO } from "@/types";
import { BetaAnalyzeSection } from "./beta-analyze-section";

const DEMO_SLUG_ORDER = ["rewst-demo", "mangomint-demo", "deputy-demo"] as const;

function sortDemosForLanding<T extends { demoSlug: string | null }>(rows: T[]): T[] {
  const rank = (slug: string | null): number => {
    if (!slug) return 999;
    const i = DEMO_SLUG_ORDER.indexOf(
      slug as (typeof DEMO_SLUG_ORDER)[number],
    );
    return i === -1 ? 500 : i;
  };
  return [...rows].sort((a, b) => rank(a.demoSlug) - rank(b.demoSlug));
}

export const dynamic = "force-dynamic";

const badgeBase: CSSProperties = {
  padding: "3px 8px",
  borderRadius: 4,
  fontSize: 11,
  letterSpacing: "0.03em",
  fontWeight: 500,
};

const moderateLikeBadge: CSSProperties = {
  ...badgeBase,
  color: COLORS.green,
  background: COLORS.greenBg,
};

const thinBadge: CSSProperties = {
  ...badgeBase,
  color: COLORS.amber,
  background: COLORS.amberBg,
};

/** Landing badge visuals: STRONG shares MODERATE green treatment. */
function coverageBadgeStyles(grade: MemoDTO["sourceCoverage"]["coverageGrade"]): {
  label: string;
  style: CSSProperties;
} {
  if (grade === "THIN") {
    return { label: "THIN", style: thinBadge };
  }
  if (grade === "STRONG") {
    return { label: "STRONG", style: moderateLikeBadge };
  }
  return { label: "MODERATE", style: moderateLikeBadge };
}

function renderMetadataRow(metadata: string): ReactElement[] {
  const parts = metadata.split(" · ");
  const elements: ReactElement[] = [];
  parts.forEach((part, i) => {
    elements.push(<span key={`p-${i}`}>{part}</span>);
    if (i < parts.length - 1) {
      elements.push(
        <span key={`s-${i}`} aria-hidden>
          ·
        </span>,
      );
    }
  });
  return elements;
}

export default async function HomePage() {
  const demoRows = sortDemosForLanding(await listDemoRuns());

  return (
    <main
      style={{
        maxWidth: 720,
        margin: "0 auto",
        padding: "64px 48px",
      }}
    >
      {/* Section 1 — Header */}
      <header style={{ marginBottom: 56 }}>
        <p style={eyebrowStyle}>CUSTOMER VOICE MIRROR</p>
        <h1
          style={{
            fontSize: 36,
            fontWeight: 500,
            color: COLORS.text,
            lineHeight: 1.2,
            letterSpacing: "-0.02em",
            margin: 0,
            marginBottom: 16,
          }}
        >
          What your customers actually say.
        </h1>
        <p
          style={{
            fontSize: 16,
            color: COLORS.textMuted,
            lineHeight: 1.6,
            maxWidth: 560,
            margin: 0,
          }}
        >
          An AI pipeline that surfaces patterns in public customer voice across
          customer stories, Reddit, and third-party reviews. Designed against AI
          sanitization: verbatim quotes only, falsifiable claims, honest
          coverage limits.
        </p>
      </header>

      {/* Section 2 — Demo cards */}
      <section style={{ marginBottom: 48 }}>
        <p style={eyebrowStyle}>EXAMPLE MEMOS · OPENVIEW PORTFOLIO</p>
        {demoRows.length === 0 ? (
          <p
            style={{
              fontSize: 14,
              color: COLORS.textMuted,
              lineHeight: 1.6,
              margin: 0,
            }}
          >
            Demo memos not available — check back soon.
          </p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {demoRows.map((row: DemoRunListRow) => {
              const slug = row.demoSlug;
              if (!slug) return null;

              const memoPartial = row.memo?.contentJson as
                | Partial<MemoDTO>
                | undefined;
              const grade =
                memoPartial?.sourceCoverage?.coverageGrade ?? ("THIN" as const);
              const badge = coverageBadgeStyles(grade);
              const headlineRaw = headlineFindingFromJTBD(
                memoPartial?.jobToBeDone?.statement,
              );
              const headline =
                headlineRaw.trim().length === 0 ? "View memo" : headlineRaw;

              const company = row.companyName ?? "Company";
              const metaLine =
                `${row._count.sources} sources · ${row._count.themes} themes · ${row.companyDomain}`;

              return (
                <Link
                  key={row.id}
                  href={`/memo/${slug}`}
                  className="mirror-card"
                  style={{
                    background: COLORS.card,
                    border: `0.5px solid ${COLORS.border}`,
                    borderRadius: 8,
                    padding: "20px 24px",
                    textDecoration: "none",
                    cursor: "pointer",
                    display: "block",
                    color: "inherit",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      marginBottom: 8,
                    }}
                  >
                    <span
                      style={{
                        fontSize: 16,
                        fontWeight: 500,
                        color: COLORS.text,
                      }}
                    >
                      {company}
                    </span>
                    <span style={badge.style}>{badge.label}</span>
                  </div>
                  <p
                    style={{
                      fontSize: 14,
                      color: COLORS.textMuted,
                      lineHeight: 1.5,
                      margin: "8px 0 12px",
                    }}
                  >
                    {headline}
                  </p>
                  <div
                    style={{
                      display: "flex",
                      gap: 16,
                      fontSize: 12,
                      color: COLORS.textFaint,
                    }}
                  >
                    {renderMetadataRow(metaLine)}
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </section>

      {/* Section 3 — Beta URL input */}
      <BetaAnalyzeSection />

      {/* Section 4 — Footer */}
      <footer
        style={{
          marginTop: 64,
          paddingTop: 24,
          borderTop: `0.5px solid ${COLORS.border}`,
        }}
      >
        <p
          style={{
            fontSize: 12,
            color: COLORS.textFaint,
            lineHeight: 1.5,
            margin: 0,
          }}
        >
          Generated memos summarize patterns in public customer voice. They do
          not interpret strategic implications. The reader draws their own
          conclusions.
        </p>
      </footer>
    </main>
  );
}
