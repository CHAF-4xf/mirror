import 'dotenv/config';
import { runPipeline } from '@/lib/orchestrator';
import { prisma } from '@/lib/prisma';

const TARGET_URL = 'https://rewst.io';
const TARGET_DOMAIN = 'rewst.io';
const TARGET_NAME = 'Rewst';

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

  // ============================================================
  // Fetch and print final state
  // ============================================================
  const finalRun = await prisma.run.findUniqueOrThrow({
    where: { id: run.id },
  });
  const agentRuns = await prisma.agentRun.findMany({
    where: { runId: run.id },
    orderBy: { startedAt: 'asc' },
  });
  const sourcesCount = await prisma.source.count({ where: { runId: run.id } });
  const themesCount = await prisma.theme.count({ where: { runId: run.id } });
  const themesWithQuotes = await prisma.theme.findMany({
    where: { runId: run.id },
    include: {
      verbatimQuotes: {
        include: { source: { select: { id: true, type: true } } },
      },
    },
  });
  const memo = await prisma.memo.findUnique({ where: { runId: run.id } });

  console.log('');
  console.log('========================================');
  console.log('=== Final Run record ===');
  console.log('========================================');
  console.log(`id:              ${finalRun.id}`);
  console.log(`url:             ${finalRun.url}`);
  console.log(`companyDomain:   ${finalRun.companyDomain}`);
  console.log(`companyName:     ${finalRun.companyName}`);
  console.log(`status:          ${finalRun.status}`);
  console.log(`createdAt:       ${finalRun.createdAt.toISOString()}`);
  console.log(`completedAt:     ${finalRun.completedAt?.toISOString() ?? '(null)'}`);
  console.log(`error:           ${finalRun.error ?? '(null)'}`);
  console.log(`totalCostUsd:    $${finalRun.totalCostUsd.toFixed(4)}`);
  console.log(`totalLatencyMs:  ${finalRun.totalLatencyMs} (sum of AgentRun latencies)`);
  console.log(`wallClockMs:     ${wallElapsedMs} (test script wall-clock)`);

  console.log('');
  console.log('========================================');
  console.log(`=== AgentRun records (${agentRuns.length}) ===`);
  console.log('========================================');
  for (const a of agentRuns) {
    console.log(`- ${a.agentName} [${a.state}]`);
    console.log(`    startedAt:    ${a.startedAt?.toISOString() ?? '(null)'}`);
    console.log(`    completedAt:  ${a.completedAt?.toISOString() ?? '(null)'}`);
    console.log(`    latencyMs:    ${a.latencyMs}`);
    console.log(`    costUsd:      $${a.costUsd.toFixed(4)}`);
    console.log(`    message:      ${a.message}`);
    if (a.errorDetail) {
      console.log(`    errorDetail:  ${a.errorDetail.split('\n')[0]}`);
    }
  }

  console.log('');
  console.log('========================================');
  console.log('=== Persisted artifact counts ===');
  console.log('========================================');
  console.log(`Sources:        ${sourcesCount}`);
  console.log(`Themes:         ${themesCount}`);
  let totalQuotes = 0;
  let unresolvedQuotes = 0;
  for (const t of themesWithQuotes) {
    for (const q of t.verbatimQuotes) {
      totalQuotes += 1;
      if (!q.source) unresolvedQuotes += 1;
    }
  }
  console.log(`VerbatimQuotes: ${totalQuotes}`);
  console.log(`  resolved to a Source: ${totalQuotes - unresolvedQuotes}`);
  console.log(`  unresolved (orphan):  ${unresolvedQuotes}`);

  console.log('');
  console.log('========================================');
  console.log('=== Memo ===');
  console.log('========================================');
  if (!memo) {
    console.log('(no Memo persisted)');
  } else {
    const content = memo.contentJson as Record<string, unknown>;
    const dominantPattern = content.dominantPattern as
      | { falsifiabilityCheck?: string; statement?: string }
      | undefined;
    const sourceCoverage = content.sourceCoverage as
      | { coverageGrade?: string; totalSources?: number }
      | undefined;
    console.log(`id:                ${memo.id}`);
    console.log(`companyName:       ${memo.companyName}`);
    console.log(`generatedAt:       ${memo.generatedAt.toISOString()}`);
    console.log(`promptVersion:     ${memo.promptVersion}`);
    console.log(`renderedMarkdown:  ${memo.renderedMarkdown.length} chars`);
    console.log(`coverageGrade:     ${sourceCoverage?.coverageGrade ?? '(missing)'}`);
    console.log(`totalSources:      ${sourceCoverage?.totalSources ?? '(missing)'}`);
    console.log(`falsifiability:    ${dominantPattern?.falsifiabilityCheck ?? '(missing)'}`);
    console.log('');
    console.log('Memo dominant pattern statement:');
    console.log(`  ${dominantPattern?.statement ?? '(missing)'}`);
  }

  console.log('');
  console.log('========================================');
  console.log('=== Verification ===');
  console.log('========================================');
  const checks: Array<{ name: string; pass: boolean; detail: string }> = [
    {
      name: 'Run.status is COMPLETE',
      pass: finalRun.status === 'COMPLETE',
      detail: `actual=${finalRun.status}`,
    },
    {
      name: 'Memo.renderedMarkdown is non-empty',
      pass: !!memo && memo.renderedMarkdown.trim().length > 0,
      detail: memo ? `${memo.renderedMarkdown.length} chars` : 'no memo',
    },
    {
      name: 'All VerbatimQuote.sourceId resolve to real Source records',
      pass: totalQuotes > 0 && unresolvedQuotes === 0,
      detail: `${totalQuotes - unresolvedQuotes} / ${totalQuotes} resolved`,
    },
    {
      name: 'All four AgentRun records present',
      pass:
        agentRuns.filter((a: (typeof agentRuns)[number]) =>
          ['SCRAPER', 'EXTRACTOR', 'SYNTHESIZER', 'RENDERER'].includes(a.agentName),
        ).length === 4,
      detail: agentRuns.map((a: (typeof agentRuns)[number]) => a.agentName).join(', '),
    },
    {
      name: 'All AgentRuns reached COMPLETE state',
      pass: agentRuns.every((a: (typeof agentRuns)[number]) => a.state === 'COMPLETE'),
      detail: agentRuns
        .map((a: (typeof agentRuns)[number]) => `${a.agentName}=${a.state}`)
        .join(', '),
    },
  ];
  let allPass = true;
  for (const c of checks) {
    console.log(`${c.pass ? '✓' : '✗'} ${c.name} — ${c.detail}`);
    if (!c.pass) allPass = false;
  }

  console.log('');
  if (allPass) {
    console.log('All verification checks passed.');
  } else {
    console.log('One or more verification checks FAILED.');
    process.exitCode = 1;
  }
}

main()
  .catch((err: unknown) => {
    console.error('Fatal:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
