import Link from "next/link";
import {
  type SidebarRun,
  listSidebarRuns,
} from "@/lib/demo-runs";
import { CoverageBadge } from "./_components/coverage-badge";
import { UrlInput } from "./_components/url-input";
import type { MemoDTO } from "@/types";

export const dynamic = "force-dynamic";

function coverageGradeFromRun(row: SidebarRun): MemoDTO["sourceCoverage"]["coverageGrade"] {
  const memoPartial = row.memo?.contentJson as Partial<MemoDTO> | undefined;
  return memoPartial?.sourceCoverage?.coverageGrade ?? "THIN";
}

function formatRelativeTime(date: Date): string {
  const now = new Date();
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const daysAgo = Math.floor(
    (startToday.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24),
  );

  if (daysAgo <= 0) return "today";
  if (daysAgo === 1) return "yesterday";
  if (daysAgo < 14) return `${daysAgo} days ago`;
  if (daysAgo < 56) return `${Math.floor(daysAgo / 7)} weeks ago`;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default async function HomePage() {
  let sidebarRuns: SidebarRun[] = [];
  try {
    sidebarRuns = await listSidebarRuns();
  } catch (err) {
    console.error("[HomePage] listSidebarRuns failed:", err);
  }

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "minmax(0, 1fr) 320px",
        minHeight: "calc(100vh - 53px)",
      }}
    >
      <main
        style={{
          maxWidth: 880,
          width: "100%",
          margin: "0 auto",
          padding: "104px 80px 96px",
        }}
      >
        <div className="micro" style={{ marginBottom: 18 }}>
          ─── new analysis
        </div>

        <h1
          style={{
            maxWidth: 720,
            fontFamily: "var(--sans)",
            fontSize: 56,
            fontWeight: 500,
            lineHeight: 1.05,
            letterSpacing: "-0.02em",
            margin: "0 0 18px",
          }}
        >
          <span>A structured analyst memo on any B2B SaaS,</span>{" "}
          <span
            className="serif"
            style={{
              display: "block",
              fontSize: 60,
              fontWeight: 400,
              fontStyle: "italic",
              color: "var(--ink-2)",
              letterSpacing: "-0.01em",
            }}
          >
            grounded in their customers&apos; own words.
          </span>
        </h1>

        <p
          style={{
            color: "var(--muted)",
            fontSize: 15.5,
            lineHeight: 1.55,
            maxWidth: 560,
            margin: "0 0 38px",
          }}
        >
          Mirror reads customer stories, Reddit threads, and third-party
          reviews, then writes a memo where every claim is backed by a verbatim
          quote. Paraphrases are rejected by construction.
        </p>

        <UrlInput />

        <section
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
            gap: "22px 48px",
            marginTop: 64,
            maxWidth: 760,
          }}
        >
          {[
            {
              num: "01",
              title: "Verbatim verification",
              description:
                "Every claim cites a quote that exists, exact-text, in the original source.",
            },
            {
              num: "02",
              title: "The different-company test",
              description:
                "Themes that could describe any SaaS company are rejected and rewritten.",
            },
            {
              num: "03",
              title: "Falsifiable patterns",
              description:
                "The dominant pattern names the conditions under which it would be wrong.",
            },
            {
              num: "04",
              title: "Split findings",
              description:
                "When evidence genuinely contradicts itself, Mirror surfaces both sides.",
            },
          ].map((pillar) => (
            <div
              key={pillar.num}
              style={{
                display: "grid",
                gridTemplateColumns: "32px 1fr",
                gap: 12,
              }}
            >
              <div
                className="mono"
                style={{
                  color: "var(--muted-2)",
                  fontSize: 11,
                  paddingTop: 3,
                }}
              >
                {pillar.num}
              </div>
              <div>
                <div
                  style={{
                    fontWeight: 500,
                    fontSize: 14,
                    marginBottom: 4,
                  }}
                >
                  {pillar.title}
                </div>
                <p
                  style={{
                    fontSize: 13,
                    color: "var(--muted)",
                    lineHeight: 1.5,
                    margin: 0,
                  }}
                >
                  {pillar.description}
                </p>
              </div>
            </div>
          ))}
        </section>
      </main>

      <aside
        style={{
          borderLeft: "1px solid var(--line)",
          padding: "28px 24px",
          background: "var(--paper-2)",
          maxHeight: "calc(100vh - 200px)",
          overflowY: "auto",
          alignSelf: "start",
        }}
      >
        <div
          className="small-caps"
          style={{
            marginBottom: 16,
            position: "sticky",
            top: 0,
            zIndex: 1,
            background: "var(--paper-2)",
            paddingBottom: 8,
          }}
        >
          Recent memos
        </div>

        {sidebarRuns.length === 0 ? (
          <p style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.5 }}>
            Demo memos not available — check back soon.
          </p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            {sidebarRuns.map((row: SidebarRun) => {
              const href = `/memo/${row.demoSlug || row.id}`;
              const company = row.companyName ?? "Company";
              const grade = coverageGradeFromRun(row);

              return (
                <Link
                  key={row.id}
                  href={href}
                  className="ghost-btn"
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr auto",
                    gap: 10,
                    alignItems: "baseline",
                    padding: "10px 8px",
                    textAlign: "left",
                    borderRadius: 8,
                    textDecoration: "none",
                    color: "inherit",
                  }}
                >
                  <span>
                    <span
                      style={{
                        display: "block",
                        fontWeight: 500,
                        fontSize: 14,
                        color: "var(--ink)",
                      }}
                    >
                      {company}
                    </span>
                    <span
                      className="mono"
                      style={{
                        display: "block",
                        fontSize: 11,
                        color: "var(--muted)",
                        marginTop: 2,
                      }}
                    >
                      {row.companyDomain}
                    </span>
                  </span>
                  <span style={{ textAlign: "right" }}>
                    <CoverageBadge grade={grade} mini />
                    <span
                      className="mono"
                      style={{
                        display: "block",
                        fontSize: 10.5,
                        color: "var(--muted-2)",
                        marginTop: 2,
                      }}
                    >
                      {formatRelativeTime(row.createdAt)}
                    </span>
                  </span>
                </Link>
              );
            })}
          </div>
        )}
      </aside>
    </div>
  );
}
