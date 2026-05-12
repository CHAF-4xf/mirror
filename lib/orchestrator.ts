import { Prisma } from '@prisma/client';
import type { AgentName, MemoDTO, RunStatus, SourceDTO, ThemeDTO } from '@/types';
import { prisma } from './prisma';
import { scrapeCustomerStories } from './scraper/customer-stories';
import { scrapeReddit } from './scraper/reddit';
import { scrapeThirdPartyReviews } from './scraper/third-party-reviews';
import { ExtractorAgent } from './agents/extractor';
import { SynthesizerAgent } from './agents/synthesizer';
import { renderMemo } from './agents/renderer';

const LOG_PREFIX = '[orchestrator]';

// Statuses we treat as "already running or finished" — short-circuit. Only
// PENDING is allowed to proceed. FAILED is included so that re-invocation
// after a previous failure doesn't quietly append a second set of AgentRun
// rows; the caller must reset the Run explicitly to retry.
const SHORT_CIRCUIT_STATUSES: ReadonlySet<RunStatus> = new Set<RunStatus>([
  'SCRAPING',
  'EXTRACTING',
  'SYNTHESIZING',
  'RENDERING',
  'COMPLETE',
  'FAILED',
]);

/**
 * Run the full Customer Voice Mirror pipeline end-to-end against an existing
 * Run record. Idempotent: re-invocation on a Run that is already in flight or
 * finished returns early without doing work.
 *
 * Never throws on pipeline failure — instead, persists Run.status='FAILED'
 * with a descriptive error message and the failing AgentRun row.
 */
export async function runPipeline(runId: string): Promise<void> {
  const run = await prisma.run.findUnique({ where: { id: runId } });
  if (!run) {
    throw new Error(`runPipeline: Run not found: ${runId}`);
  }

  if (SHORT_CIRCUIT_STATUSES.has(run.status)) {
    console.log(
      `${LOG_PREFIX} run ${runId} status=${run.status} — returning early (idempotency)`,
    );
    return;
  }

  const companyName = run.companyName ?? deriveCompanyName(run.companyDomain);
  const slug = companyDomainSlug(run.companyDomain);
  const refPrefixes = {
    stories: `${slug}_story`,
    reddit: `${slug}_reddit`,
    review: `${slug}_review`,
  };

  // In-memory data carried across stages. Each stage hands off to the next
  // via these variables; the DB is the durable record but not the dataflow.
  let sources: SourceDTO[] = [];
  let sourceIdMap: Map<string, string> = new Map();
  let themes: ThemeDTO[] = [];
  let memo: MemoDTO | null = null;
  let memoRowId: string | null = null;

  try {
    // ============================================================
    // STAGE 1 — SCRAPING
    // ============================================================
    await updateRunStatus(runId, 'SCRAPING');
    sources = await withAgentRun(runId, 'SCRAPER', async () => {
      console.log(
        `${LOG_PREFIX} scrape: ${companyName} (${run.url}) via 3 scrapers in parallel`,
      );
      const [stories, reddit, thirdParty] = await Promise.all([
        scrapeCustomerStories(run.url, refPrefixes.stories),
        scrapeReddit(companyName, refPrefixes.reddit),
        scrapeThirdPartyReviews(companyName, refPrefixes.review),
      ]);
      const all = [...stories, ...reddit, ...thirdParty];
      if (all.length === 0) {
        throw new Error('All three scrapers returned zero sources');
      }
      return {
        result: all,
        message:
          `Scraped ${all.length} source(s): ` +
          `${stories.length} stories, ${reddit.length} reddit, ${thirdParty.length} reviews`,
        costUsd: 0,
      };
    });
    sourceIdMap = await persistSources(runId, sources);
    console.log(`${LOG_PREFIX} persisted ${sourceIdMap.size} Source row(s)`);

    // ============================================================
    // STAGE 2 — EXTRACTING
    // ============================================================
    await updateRunStatus(runId, 'EXTRACTING');
    themes = await withAgentRun(runId, 'EXTRACTOR', async () => {
      const agent = new ExtractorAgent({
        onUpdate: (u) => console.log(`${LOG_PREFIX} extractor.${u.stage}: ${u.message}`),
      });
      const result = await agent.extract(sources);
      if (result.themes.length === 0) {
        throw new Error(
          `Extractor produced zero accepted themes ` +
            `(${result.rejected.length} rejected)`,
        );
      }
      return {
        result: result.themes,
        message:
          `Extracted ${result.themes.length} theme(s) ` +
          `(${result.rejected.length} rejected, ${result.spliceLog.length} spliced)`,
        costUsd: result.costUsd,
      };
    });
    await persistThemes(runId, themes, sourceIdMap);
    console.log(`${LOG_PREFIX} persisted ${themes.length} Theme row(s)`);

    // ============================================================
    // STAGE 3 — SYNTHESIZING
    // ============================================================
    await updateRunStatus(runId, 'SYNTHESIZING');
    memo = await withAgentRun(runId, 'SYNTHESIZER', async () => {
      const agent = new SynthesizerAgent({
        onUpdate: (u) =>
          console.log(`${LOG_PREFIX} synthesizer.${u.stage}: ${u.message}`),
      });
      const result = await agent.synthesize({
        companyName,
        companyUrl: run.url,
        themes,
        sources,
      });
      return {
        result: result.memo,
        message:
          `Synthesized memo (retries=${result.retryCount}, ` +
          `spliced=${result.spliceLog.length}, ` +
          `falsifiability=${result.memo.dominantPattern.falsifiabilityCheck})`,
        costUsd: result.totalCostUsd,
      };
    });
    const memoRow = await persistMemo(runId, memo);
    memoRowId = memoRow.id;
    console.log(`${LOG_PREFIX} persisted Memo ${memoRowId} (renderedMarkdown empty)`);

    // ============================================================
    // STAGE 4 — RENDERING
    // ============================================================
    await updateRunStatus(runId, 'RENDERING');
    const renderedMarkdown = await withAgentRun(runId, 'RENDERER', async () => {
      const rendered = renderMemo(memo!, { sources });
      if (!rendered.renderedMarkdown.trim()) {
        throw new Error('Renderer produced empty markdown');
      }
      return {
        result: rendered.renderedMarkdown,
        message: `Rendered ${rendered.renderedMarkdown.length} chars of markdown`,
        costUsd: 0,
      };
    });
    await prisma.memo.update({
      where: { id: memoRowId },
      data: { renderedMarkdown },
    });
    console.log(`${LOG_PREFIX} updated Memo.renderedMarkdown (${renderedMarkdown.length} chars)`);

    // ============================================================
    // FINALIZE
    // ============================================================
    const totals = await aggregateCostsAndLatencies(runId);
    await prisma.run.update({
      where: { id: runId },
      data: {
        status: 'COMPLETE',
        completedAt: new Date(),
        totalCostUsd: totals.totalCostUsd,
        totalLatencyMs: totals.totalLatencyMs,
      },
    });
    console.log(
      `${LOG_PREFIX} run ${runId} COMPLETE | ` +
        `cost $${totals.totalCostUsd.toFixed(4)} | ${totals.totalLatencyMs}ms`,
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`${LOG_PREFIX} run ${runId} FAILED: ${message}`);

    // Still aggregate whatever AgentRun rows we managed to persist before the
    // failure — the failure attribution is on the FAILED AgentRun, not the
    // Run row, but partial totals are still useful for debugging.
    const totals = await aggregateCostsAndLatencies(runId).catch(() => ({
      totalCostUsd: 0,
      totalLatencyMs: 0,
    }));
    await prisma.run.update({
      where: { id: runId },
      data: {
        status: 'FAILED',
        completedAt: new Date(),
        error: message,
        totalCostUsd: totals.totalCostUsd,
        totalLatencyMs: totals.totalLatencyMs,
      },
    });
  }
}

// ============================================================
// AgentRun lifecycle helper
// ============================================================

async function withAgentRun<T>(
  runId: string,
  agentName: AgentName,
  fn: () => Promise<{ result: T; message: string; costUsd: number }>,
): Promise<T> {
  const agentRun = await prisma.agentRun.create({
    data: {
      runId,
      agentName,
      state: 'RUNNING',
      startedAt: new Date(),
    },
  });
  const startedAt = Date.now();
  try {
    const { result, message, costUsd } = await fn();
    await prisma.agentRun.update({
      where: { id: agentRun.id },
      data: {
        state: 'COMPLETE',
        completedAt: new Date(),
        latencyMs: Date.now() - startedAt,
        costUsd,
        message,
      },
    });
    return result;
  } catch (err) {
    const errorDetail =
      err instanceof Error ? (err.stack ?? err.message) : String(err);
    await prisma.agentRun.update({
      where: { id: agentRun.id },
      data: {
        state: 'FAILED',
        completedAt: new Date(),
        latencyMs: Date.now() - startedAt,
        errorDetail,
        message: err instanceof Error ? err.message : 'unknown error',
      },
    });
    throw err;
  }
}

// ============================================================
// Persistence helpers
// ============================================================

async function updateRunStatus(runId: string, status: RunStatus): Promise<void> {
  await prisma.run.update({
    where: { id: runId },
    data: { status },
  });
}

async function persistSources(
  runId: string,
  sources: SourceDTO[],
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  for (const dto of sources) {
    const row = await prisma.source.create({
      data: {
        runId,
        type: dto.type,
        url: dto.url,
        title: dto.title,
        author: dto.author,
        authorContext: dto.authorContext,
        publishedAt: dto.publishedAt,
        rawText: dto.rawText,
        reliability: dto.reliability,
        // SourceMetadata is a tagged union; Prisma's Json input accepts any
        // serializable object. The cast is safe because we just persist and
        // re-read by the same code that produced it.
        metadata: dto.metadata as unknown as Prisma.InputJsonValue,
      },
      select: { id: true },
    });
    map.set(dto.temporaryRef, row.id);
  }
  return map;
}

async function persistThemes(
  runId: string,
  themes: ThemeDTO[],
  sourceIdMap: Map<string, string>,
): Promise<void> {
  for (const theme of themes) {
    const quoteRows = theme.verbatimQuotes.map((q) => {
      const sourceId = sourceIdMap.get(q.sourceTemporaryRef);
      if (!sourceId) {
        throw new Error(
          `persistThemes: no Source row found for temporaryRef "${q.sourceTemporaryRef}"`,
        );
      }
      return {
        sourceId,
        text: q.text,
        sourceUrl: q.sourceUrl,
        sourceReliability: q.sourceReliability,
      };
    });
    await prisma.theme.create({
      data: {
        runId,
        category: theme.category,
        statement: theme.statement,
        sourceCount: theme.sourceCount,
        weightedConfidence: theme.weightedConfidence,
        verbatimQuotes: { create: quoteRows },
      },
    });
  }
}

async function persistMemo(
  runId: string,
  memo: MemoDTO,
): Promise<{ id: string }> {
  // contentJson holds every memo field EXCEPT renderedMarkdown (which has its
  // own column). Avoids duplicating the rendered output and keeps the JSON
  // payload focused on the structured content.
  const { renderedMarkdown: _ignored, ...contentForJson } = memo;
  return prisma.memo.create({
    data: {
      runId,
      companyName: memo.companyName,
      generatedAt: memo.generatedAt,
      promptVersion: memo.promptVersion,
      contentJson: contentForJson as unknown as Prisma.InputJsonValue,
      renderedMarkdown: '',
    },
    select: { id: true },
  });
}

async function aggregateCostsAndLatencies(
  runId: string,
): Promise<{ totalCostUsd: number; totalLatencyMs: number }> {
  const agentRuns = await prisma.agentRun.findMany({
    where: { runId },
    select: { costUsd: true, latencyMs: true },
  });
  let totalCostUsd = 0;
  let totalLatencyMs = 0;
  for (const a of agentRuns) {
    totalCostUsd += a.costUsd;
    totalLatencyMs += a.latencyMs;
  }
  return { totalCostUsd, totalLatencyMs };
}

// ============================================================
// Small derivations from companyDomain
// ============================================================

function deriveCompanyName(domain: string): string {
  const seg = domain.split('.')[0] ?? domain;
  if (!seg) return domain;
  return seg.charAt(0).toUpperCase() + seg.slice(1);
}

function companyDomainSlug(domain: string): string {
  const seg = domain.split('.')[0] ?? 'co';
  return seg.toLowerCase().replace(/[^a-z0-9]/g, '') || 'co';
}
