import 'dotenv/config';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { runPipeline } from '@/lib/orchestrator';
import { prisma } from '@/lib/prisma';

const TARGET_URL = 'https://deputy.com';
const TARGET_DOMAIN = 'deputy.com';
const TARGET_NAME = 'Deputy';
const MEMO_OUT = 'tmp/deputy-memo.md';

interface MemoContent {
  companyName?: string;
  jobToBeDone?: { statement?: string; rationale?: string };
  whatTheyLove?: { themes?: unknown[] };
  whatFrustrates?: { themes?: unknown[] };
  whatTheyWish?: { themes?: unknown[] };
  contradictions?: { themes?: unknown[] };
  dominantPattern?: {
    statement?: string;
    elaboration?: string;
    falsifiabilityCheck?: string;
  };
  sourceCoverage?: {
    coverageGrade?: string;
    totalSources?: number;
    customerStories?: number;
    redditPosts?: number;
    xMentions?: number;
    reviews?: number;
  };
}

async function main(): Promise<void> {
  console.log(`Creating Run for ${TARGET_URL}...`);
  const run = await prisma.run.create({
    data: {
      url: TARGET_URL,
      companyName: TARGET_NAME,
      companyDomain: TARGET_DOMAIN,
    },
    select: { id: true, status: true, createdAt: true },
  });
  console.log(`Created Run ${run.id} (status=${run.status})`);
  console.log('');

  const wallStartedAt = Date.now();
  await runPipeline(run.id);
  const wallElapsedMs = Date.now() - wallStartedAt;

  const finalRun = await prisma.run.findUniqueOrThrow({ where: { id: run.id } });
  const agentRuns = await prisma.agentRun.findMany({
    where: { runId: run.id },
    orderBy: { startedAt: 'asc' },
  });
  const memo = await prisma.memo.findUnique({ where: { runId: run.id } });

  console.log('');
  console.log('========================================');
  console.log('=== Final Run record ===');
  console.log('========================================');
  console.log(`id:              ${finalRun.id}`);
  console.log(`url:             ${finalRun.url}`);
  console.log(`status:          ${finalRun.status}`);
  console.log(`completedAt:     ${finalRun.completedAt?.toISOString() ?? '(null)'}`);
  console.log(`error:           ${finalRun.error ?? '(null)'}`);
  console.log(`totalCostUsd:    $${finalRun.totalCostUsd.toFixed(4)}`);
  console.log(`totalLatencyMs:  ${finalRun.totalLatencyMs} (sum of AgentRun latencies)`);
  console.log(`wallClockMs:     ${wallElapsedMs} (script wall-clock)`);

  console.log('');
  console.log('========================================');
  console.log(`=== AgentRun records (${agentRuns.length}) ===`);
  console.log('========================================');
  for (const a of agentRuns) {
    console.log(`- ${a.agentName} [${a.state}]  ${a.latencyMs}ms  $${a.costUsd.toFixed(4)}`);
    console.log(`    ${a.message ?? '(no message)'}`);
    if (a.errorDetail) {
      console.log(`    errorDetail: ${a.errorDetail.split('\n')[0]}`);
    }
  }

  if (!memo) {
    console.log('');
    console.log('No Memo was persisted — aborting summary');
    process.exitCode = 1;
    return;
  }

  const content = memo.contentJson as MemoContent;
  const sc = content.sourceCoverage ?? {};
  const dp = content.dominantPattern ?? {};
  const jtbd = content.jobToBeDone ?? {};

  console.log('');
  console.log('========================================');
  console.log('=== Memo summary ===');
  console.log('========================================');
  console.log(`companyName:               ${content.companyName ?? memo.companyName}`);
  console.log(`coverageGrade:             ${sc.coverageGrade ?? '(missing)'}`);
  console.log(`totalSources:              ${sc.totalSources ?? '(missing)'}`);
  console.log(`  customer stories:        ${sc.customerStories ?? '(missing)'}`);
  console.log(`  reddit:                  ${sc.redditPosts ?? '(missing)'}`);
  console.log(`  x:                       ${sc.xMentions ?? '(missing)'}`);
  console.log(`  reviews:                 ${sc.reviews ?? '(missing)'}`);
  console.log('');
  console.log(`JTBD statement:`);
  console.log(`  ${jtbd.statement ?? '(missing)'}`);
  console.log('');
  console.log(`Dominant pattern statement:`);
  console.log(`  ${dp.statement ?? '(missing)'}`);
  console.log(`Dominant pattern falsifiability check: ${dp.falsifiabilityCheck ?? '(missing)'}`);
  console.log('');
  console.log('Theme counts per section:');
  console.log(`  whatTheyLove:     ${content.whatTheyLove?.themes?.length ?? 0}`);
  console.log(`  whatFrustrates:   ${content.whatFrustrates?.themes?.length ?? 0}`);
  console.log(`  whatTheyWish:     ${content.whatTheyWish?.themes?.length ?? 0}`);
  console.log(`  contradictions:   ${content.contradictions?.themes?.length ?? 0}`);

  await mkdir(dirname(MEMO_OUT), { recursive: true });
  await writeFile(MEMO_OUT, memo.renderedMarkdown, 'utf-8');
  console.log('');
  console.log(`Wrote ${memo.renderedMarkdown.length} chars to ${MEMO_OUT}`);

  console.log('');
  console.log('========================================');
  console.log(`=== Rendered memo (${MEMO_OUT}) ===`);
  console.log('========================================');
  console.log(memo.renderedMarkdown);
}

main()
  .catch((err: unknown) => {
    console.error('Fatal:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
