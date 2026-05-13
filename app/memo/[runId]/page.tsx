import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import {
  aggregateSourceCoverageForRun,
  findRunBySlugOrId,
  sourceCoverageFromMemoOrAggregate,
} from '@/lib/demo-runs';
import { formatMemoHeaderDate } from '@/lib/memo-display';
import type { MemoDTO } from '@/types';
import { MemoViewer, type MemoViewerMeta } from './memo-viewer';

export const dynamic = 'force-dynamic';

type PageProps = {
  params: Promise<{ runId: string }>;
};

export async function generateMetadata(props: PageProps): Promise<Metadata> {
  const { runId } = await props.params;
  const run = await findRunBySlugOrId(runId);
  if (!run?.memo) {
    return { title: 'Memo not found · Customer Voice Mirror' };
  }
  return {
    title: `${run.memo.companyName} · Customer Voice Mirror`,
    description: `Generated memo for ${run.memo.companyName}.`,
  };
}

export default async function MemoPage(props: PageProps) {
  const { runId } = await props.params;
  const run = await findRunBySlugOrId(runId);

  if (!run || !run.memo?.contentJson) {
    notFound();
  }

  const aggregate = await aggregateSourceCoverageForRun(run.id);
  const sc = sourceCoverageFromMemoOrAggregate(run.memo, aggregate);
  const memo = run.memo.contentJson as unknown as MemoDTO;

  const meta: MemoViewerMeta = {
    companyName: run.memo.companyName,
    companyDomain: run.companyDomain,
    coverageGrade: sc.coverageGrade,
    generatedAt: formatMemoHeaderDate(run.memo.generatedAt),
    costUsd: run.totalCostUsd,
    runtimeSeconds: Math.round(run.totalLatencyMs / 1000),
  };

  return <MemoViewer memo={memo} meta={meta} />;
}
