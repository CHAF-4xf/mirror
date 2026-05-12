import 'dotenv/config';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { ExtractorAgent } from '@/lib/agents/extractor';
import type { SourceDTO } from '@/types';

const TMP_DIR = path.resolve(process.cwd(), 'tmp');
const STORIES_FILE = path.join(TMP_DIR, 'rewst-stories.json');
const REDDIT_FILE = path.join(TMP_DIR, 'rewst-reddit.json');
const THIRD_PARTY_FILE = path.join(TMP_DIR, 'rewst-third-party.json');
const OUT_FILE = path.join(TMP_DIR, 'rewst-themes.json');

async function main(): Promise<void> {
  const [stories, reddit, thirdParty] = await Promise.all([
    readSources(STORIES_FILE),
    readSources(REDDIT_FILE),
    readSources(THIRD_PARTY_FILE),
  ]);

  const sources: SourceDTO[] = [...stories, ...reddit, ...thirdParty];
  console.log(
    `Loaded ${sources.length} sources: ${stories.length} HIGH (customer stories), ` +
      `${reddit.length} LOW (Reddit), ${thirdParty.length} MEDIUM (third-party reviews)`,
  );

  const agent = new ExtractorAgent({
    onUpdate: (u) => console.log(`  <update> ${u.stage}: ${u.message}`),
  });

  const result = await agent.extract(sources);

  await mkdir(TMP_DIR, { recursive: true });
  await writeFile(OUT_FILE, JSON.stringify(result.themes, null, 2), 'utf8');

  console.log('');
  console.log('=== Extraction summary ===');
  console.log(`Wrote ${OUT_FILE}`);
  console.log(
    `${result.themes.length} themes accepted, ` +
      `${result.rejected.length} themes rejected due to quote verification failure`,
  );

  for (const [i, r] of result.rejected.entries()) {
    console.log('');
    console.log(`--- Rejected theme ${i + 1} ---`);
    console.log(`Category:  ${r.category}`);
    console.log(`Statement: ${r.statement}`);
    console.log(`Reason:    ${r.reason}`);
    if (r.diagnostics) {
      const d = r.diagnostics;
      console.log(`Failing quote (Claude's exact output):`);
      console.log(`  > ${d.failingQuoteText.replace(/\n/g, ' ')}`);
      console.log(`Claimed sourceTemporaryRef: ${d.claimedSourceRef} (found: ${d.claimedSourceFound})`);
      console.log(`Claimed source rawText (first 200 chars):`);
      console.log(`  > ${d.claimedSourceRawTextPreview}`);
      console.log(
        `Word-overlap score vs claimed source: ${(d.wordOverlapWithClaimedSource * 100).toFixed(1)}%`,
      );
      if (d.foundInOtherSourceRefs.length > 0) {
        console.log(
          `*** Quote FOUND as exact substring in other source(s): ${d.foundInOtherSourceRefs.join(', ')} (cross-attribution bug?)`,
        );
      } else {
        console.log(`Quote not found in any other source either.`);
      }
    }
  }

  const byCategory = result.themes.reduce<Record<string, number>>((acc, t) => {
    acc[t.category] = (acc[t.category] ?? 0) + 1;
    return acc;
  }, {});
  console.log('');
  console.log('Themes by category:');
  for (const cat of [
    'JOB_TO_BE_DONE',
    'LOVE',
    'FRUSTRATION',
    'WISH',
    'CHURN_RISK',
    'COMPETITIVE_REFERENCE',
    'CONTRADICTION',
  ]) {
    const n = byCategory[cat] ?? 0;
    if (n > 0) console.log(`  ${cat}: ${n}`);
  }

  if (result.spliceLog.length > 0) {
    const avgSubSpans =
      result.spliceLog.reduce<number>(
        (acc: number, r: { subSpanCount: number }) => acc + r.subSpanCount,
        0,
      ) /
      result.spliceLog.length;
    console.log('');
    console.log(
      `Splice recovery fired on ${result.spliceLog.length} quote(s), ` +
        `avg ${avgSubSpans.toFixed(1)} sub-spans per spliced quote`,
    );
    for (const r of result.spliceLog) {
      console.log(
        `  spliced -> ${r.subSpanCount} sub-spans from ${r.sourceTemporaryRef} ` +
          `(theme: "${r.themeStatement.slice(0, 60)}...")`,
      );
    }
  } else {
    console.log('');
    console.log('Splice recovery: did not fire (no spliced quotes detected).');
  }

  console.log('');
  console.log(`Cost: $${result.costUsd.toFixed(4)}`);
  console.log(`Latency: ${result.latencyMs}ms`);
  console.log(`Tokens: ${result.inputTokens} in / ${result.outputTokens} out`);
  console.log(`Prompt version: ${result.promptVersion}`);

  if (result.themes.length > 0) {
    console.log('');
    console.log('=== First theme (full) ===');
    console.log(JSON.stringify(result.themes[0], null, 2));
  }
}

async function readSources(filePath: string): Promise<SourceDTO[]> {
  const text = await readFile(filePath, 'utf8');
  return JSON.parse(text) as SourceDTO[];
}

main().catch((err: unknown) => {
  console.error('Fatal:', err);
  process.exit(1);
});
