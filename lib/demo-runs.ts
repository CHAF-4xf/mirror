import type { Prisma } from '@prisma/client';
import type { MemoDTO } from '@/types';
import { gradeCoverage } from '@/types';
import { prisma } from './prisma';

export const DEMO_RUN_DETAIL_INCLUDE = {
  memo: true,
  _count: {
    select: { themes: true, sources: true },
  },
} satisfies Prisma.RunInclude;

export type RunDemoDetail = Prisma.RunGetPayload<{
  include: typeof DEMO_RUN_DETAIL_INCLUDE;
}>;

/** First clause of JTBD: split on `.` or `—`, then trim to ≤200 chars. */
export function headlineFindingFromJTBD(statement: unknown): string {
  if (typeof statement !== 'string' || !statement.trim()) return '';
  const trimmed = statement.trim();
  let out = trimmed;
  const emIdx = out.indexOf('—');
  const dotIdx = out.indexOf('.');
  if (emIdx !== -1 && (dotIdx === -1 || emIdx <= dotIdx)) {
    out = out.slice(0, emIdx).trim();
  } else if (dotIdx !== -1) {
    out = out.slice(0, dotIdx + 1).trim();
  }
  if (out.length > 200) {
    let t = out.slice(0, 197);
    const lastSpace = t.lastIndexOf(' ');
    if (lastSpace > 140) {
      t = t.slice(0, lastSpace);
    }
    return `${t.trimEnd()}…`;
  }
  return out;
}

const demoRunListSelect = {
  id: true,
  demoSlug: true,
  url: true,
  createdAt: true,
  companyDomain: true,
  companyName: true,
  memo: { select: { contentJson: true } },
  _count: {
    select: { sources: true, themes: true },
  },
} satisfies Prisma.RunSelect;

export type DemoRunListRow = Prisma.RunGetPayload<{
  select: typeof demoRunListSelect;
}>;

export type SidebarRun = DemoRunListRow;

const DEMO_SLUG_ORDER = ['rewst-demo', 'mangomint-demo', 'deputy-demo'] as const;

function sortPinnedDemos(rows: DemoRunListRow[]): DemoRunListRow[] {
  const rank = (slug: string | null): number => {
    if (!slug) return 999;
    const i = DEMO_SLUG_ORDER.indexOf(slug as (typeof DEMO_SLUG_ORDER)[number]);
    return i === -1 ? 500 : i;
  };
  return [...rows].sort((a: DemoRunListRow, b: DemoRunListRow) => rank(a.demoSlug) - rank(b.demoSlug));
}

function toSidebarRunDTO(row: DemoRunListRow): SidebarRun {
  return row;
}

/** Landing list: COMPLETE runs with demoSlug, newest first. */
export async function listDemoRuns(): Promise<DemoRunListRow[]> {
  return prisma.run.findMany({
    where: {
      demoSlug: { not: null },
      status: 'COMPLETE',
    },
    orderBy: { createdAt: 'desc' },
    select: demoRunListSelect,
  });
}

/** Sidebar list: pinned demos first, then newest completed live run per company. */
export async function listSidebarRuns(): Promise<SidebarRun[]> {
  const [demos, liveRaw] = await Promise.all([
    prisma.run.findMany({
      where: {
        demoSlug: { not: null },
        status: 'COMPLETE',
      },
      orderBy: { createdAt: 'desc' },
      select: demoRunListSelect,
    }),
    prisma.run.findMany({
      where: {
        demoSlug: null,
        status: 'COMPLETE',
      },
      orderBy: { createdAt: 'desc' },
      select: demoRunListSelect,
    }),
  ]);

  const seen = new Set<string>();
  const live: DemoRunListRow[] = [];
  for (const run of liveRaw) {
    const key = run.companyDomain.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    live.push(run);
    if (live.length >= 20) break;
  }

  return [...sortPinnedDemos(demos), ...live].map((row: DemoRunListRow) =>
    toSidebarRunDTO(row),
  );
}

export async function aggregateSourceCoverageForRun(runId: string): Promise<{
  totalSources: number;
  customerStories: number;
  redditPosts: number;
  xMentions: number;
  reviews: number;
  coverageGrade: MemoDTO['sourceCoverage']['coverageGrade'];
}> {
  const groups = await prisma.source.groupBy({
    by: ['type'],
    where: { runId },
    _count: { _all: true },
  });

  let customerStories = 0;
  let redditPosts = 0;
  let xMentions = 0;
  let reviews = 0;
  let totalSources = 0;

  for (const g of groups) {
    const n = g._count._all;
    totalSources += n;
    switch (g.type) {
      case 'CUSTOMER_STORY':
        customerStories += n;
        break;
      case 'REDDIT_POST':
      case 'REDDIT_COMMENT':
        redditPosts += n;
        break;
      case 'X_MENTION':
        xMentions += n;
        break;
      case 'TRUSTPILOT_REVIEW':
      case 'OTHER_REVIEW':
      case 'THIRD_PARTY_REVIEW':
        reviews += n;
        break;
      default:
        break;
    }
  }

  const coverageGrade =
    totalSources === 0
      ? ('THIN' as const)
      : gradeCoverage({
          totalSources,
          customerStories,
          externalSources: redditPosts + xMentions + reviews,
        });

  return {
    totalSources,
    customerStories,
    redditPosts,
    xMentions,
    reviews,
    coverageGrade,
  };
}

export async function findRunBySlugOrId(slugOrId: string): Promise<RunDemoDetail | null> {
  const bySlug = await prisma.run.findFirst({
    where: { demoSlug: slugOrId },
    include: DEMO_RUN_DETAIL_INCLUDE,
  });
  if (bySlug) return bySlug;

  return prisma.run.findUnique({
    where: { id: slugOrId },
    include: DEMO_RUN_DETAIL_INCLUDE,
  });
}

export type MemoSourceCoverageCore = Pick<
  MemoDTO['sourceCoverage'],
  | 'totalSources'
  | 'customerStories'
  | 'redditPosts'
  | 'xMentions'
  | 'reviews'
  | 'coverageGrade'
>;

export function sourceCoverageFromMemoOrAggregate(
  memo: RunDemoDetail['memo'],
  aggregate: Awaited<ReturnType<typeof aggregateSourceCoverageForRun>>,
): MemoSourceCoverageCore {
  const partial = memo?.contentJson ? (memo.contentJson as Partial<MemoDTO>) : undefined;
  const sc = partial?.sourceCoverage;

  return {
    totalSources: sc?.totalSources ?? aggregate.totalSources,
    customerStories: sc?.customerStories ?? aggregate.customerStories,
    redditPosts: sc?.redditPosts ?? aggregate.redditPosts,
    xMentions: sc?.xMentions ?? aggregate.xMentions,
    reviews: sc?.reviews ?? aggregate.reviews,
    coverageGrade: sc?.coverageGrade ?? aggregate.coverageGrade,
  };
}
