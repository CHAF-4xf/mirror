/**
 * Remove the mistaken "foo" run and rely on FK cascade for children.
 * One-off: `npx tsx scripts/cleanup-bad-run.ts`
 */
import 'dotenv/config';
import { prisma } from '../lib/prisma';

const BAD_RUN_ID = 'cmp1zrvgh00273pa7gr3lldin';

async function main(): Promise<void> {
  const existing = await prisma.run.findUnique({
    where: { id: BAD_RUN_ID },
    include: {
      _count: { select: { sources: true, themes: true, agentRuns: true } },
      memo: { select: { id: true } },
    },
  });

  if (!existing) {
    console.log(`Run ${BAD_RUN_ID} not found — already deleted or wrong id.`);
    return;
  }

  console.log('Before delete:', {
    runId: existing.id,
    companyDomain: existing.companyDomain,
    url: existing.url,
    counts: {
      sources: existing._count.sources,
      themes: existing._count.themes,
      agentRuns: existing._count.agentRuns,
      memo: existing.memo ? 1 : 0,
    },
  });

  const result = await prisma.run.delete({
    where: { id: BAD_RUN_ID },
  });
  console.log('Deleted run:', result.id);

  const [runGone, danglingMemo, danglingSources] = await Promise.all([
    prisma.run.findUnique({ where: { id: BAD_RUN_ID } }),
    prisma.memo.findFirst({ where: { runId: BAD_RUN_ID } }),
    prisma.source.findFirst({ where: { runId: BAD_RUN_ID } }),
  ]);

  if (runGone || danglingMemo || danglingSources) {
    console.error('Verification FAILED — leftover rows:', {
      runStillExists: Boolean(runGone),
      danglingMemoId: danglingMemo?.id,
      danglingSourceId: danglingSources?.id,
    });
    process.exit(1);
  }

  console.log('Verification OK — run and related rows are gone (cascade).');
}

main().then(() => process.exit(0)).catch((err) => {
  console.error(err);
  process.exit(1);
});
