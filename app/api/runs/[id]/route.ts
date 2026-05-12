import { NextResponse } from 'next/server';
import {
  aggregateSourceCoverageForRun,
  findRunBySlugOrId,
  sourceCoverageFromMemoOrAggregate,
} from '@/lib/demo-runs';

type RouteCtx = {
  params: Promise<{ id: string }>;
};

export async function GET(_request: Request, context: RouteCtx) {
  const { id } = await context.params;
  const run = await findRunBySlugOrId(id);

  if (!run) {
    return NextResponse.json({ error: 'Run not found' }, { status: 404 });
  }

  const aggregate = await aggregateSourceCoverageForRun(run.id);
  const sourceCoverage = sourceCoverageFromMemoOrAggregate(run.memo, aggregate);

  const memoOut = run.memo
    ? {
        id: run.memo.id,
        companyName: run.memo.companyName,
        generatedAt: run.memo.generatedAt,
        promptVersion: run.memo.promptVersion,
        contentJson: run.memo.contentJson as object,
        renderedMarkdown: run.memo.renderedMarkdown,
      }
    : null;

  const runOut = {
    id: run.id,
    demoSlug: run.demoSlug,
    url: run.url,
    companyName: run.companyName,
    companyDomain: run.companyDomain,
    status: run.status,
    createdAt: run.createdAt,
    completedAt: run.completedAt,
    totalCostUsd: run.totalCostUsd,
    totalLatencyMs: run.totalLatencyMs,
  };

  return NextResponse.json({
    run: runOut,
    memo: memoOut,
    sourceCoverage,
    themeCount: run._count.themes,
    sourceCount: run._count.sources,
  });
}
