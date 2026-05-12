import 'dotenv/config';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { MemoVerificationError, SynthesizerAgent } from '@/lib/agents/synthesizer';
import type { SourceDTO, ThemeDTO } from '@/types';

const TMP_DIR = path.resolve(process.cwd(), 'tmp');
const STORIES_FILE = path.join(TMP_DIR, 'rewst-stories.json');
const REDDIT_FILE = path.join(TMP_DIR, 'rewst-reddit.json');
const THIRD_PARTY_FILE = path.join(TMP_DIR, 'rewst-third-party.json');
const THEMES_FILE = path.join(TMP_DIR, 'rewst-themes.json');
const OUT_FILE = path.join(TMP_DIR, 'rewst-memo.json');

const COMPANY_NAME = 'Rewst';
const COMPANY_URL = 'https://rewst.io';

async function main(): Promise<void> {
  const [stories, reddit, thirdParty, themes] = await Promise.all([
    readJson<SourceDTO[]>(STORIES_FILE),
    readJson<SourceDTO[]>(REDDIT_FILE),
    readJson<SourceDTO[]>(THIRD_PARTY_FILE),
    readJson<ThemeDTO[]>(THEMES_FILE),
  ]);

  const sources: SourceDTO[] = [...stories, ...reddit, ...thirdParty];
  console.log(
    `Loaded ${sources.length} sources ` +
      `(${stories.length} HIGH stories, ${reddit.length} LOW reddit, ${thirdParty.length} MEDIUM reviews)`,
  );
  console.log(`Loaded ${themes.length} extracted themes`);
  console.log('');

  const agent = new SynthesizerAgent({
    onUpdate: (u) => console.log(`  <update> ${u.stage}: ${u.message}`),
  });

  let result: Awaited<ReturnType<SynthesizerAgent['synthesize']>>;
  try {
    result = await agent.synthesize({
      companyName: COMPANY_NAME,
      companyUrl: COMPANY_URL,
      themes,
      sources,
    });
  } catch (err) {
    if (err instanceof MemoVerificationError) {
      console.error('');
      console.error(`Synthesis hard-aborted: ${err.message}`);
      for (const f of err.failures) {
        const truncated =
          f.quoteText.length > 200
            ? `${f.quoteText.slice(0, 200)}...`
            : f.quoteText;
        console.error(
          `  - ${f.location} (claimed=${f.claimedSourceRef}): ${f.reason}`,
        );
        console.error(`    quote: "${truncated.replace(/\s+/g, ' ').trim()}"`);
      }
      process.exit(1);
    }
    throw err;
  }

  const { memo } = result;
  await mkdir(TMP_DIR, { recursive: true });
  await writeFile(OUT_FILE, JSON.stringify(memo, null, 2), 'utf8');

  console.log('');
  console.log('=== Synthesis summary ===');
  console.log(`Wrote ${OUT_FILE}`);
  console.log('');
  console.log(`Company:               ${memo.companyName}`);
  console.log(`Prompt version:        ${memo.promptVersion}`);
  console.log(`Generated at:          ${memo.generatedAt.toISOString()}`);
  console.log(`Retries:               ${result.retryCount}`);
  console.log(
    `Falsifiability check:  ${memo.dominantPattern.falsifiabilityCheck}` +
      `${result.falsifiabilityWarning ? '  [WARN: self-flagged GENERIC]' : ''}`,
  );
  console.log(`Coverage grade:        ${memo.sourceCoverage.coverageGrade}`);
  console.log('');
  console.log(
    `Coverage breakdown: total=${memo.sourceCoverage.totalSources} ` +
      `stories=${memo.sourceCoverage.customerStories} ` +
      `reddit=${memo.sourceCoverage.redditPosts} ` +
      `x=${memo.sourceCoverage.xMentions} ` +
      `reviews=${memo.sourceCoverage.reviews}`,
  );
  console.log('');
  console.log('=== Section theme counts ===');
  console.log(`whatTheyLove:    ${memo.whatTheyLove.themes.length}`);
  console.log(`whatFrustrates:  ${memo.whatFrustrates.themes.length}`);
  console.log(`whatTheyWish:    ${memo.whatTheyWish.themes.length}`);
  console.log(`contradictions:  ${memo.contradictions.themes.length}`);

  if (result.spliceLog.length > 0) {
    console.log('');
    console.log(`=== Splice recoveries (${result.spliceLog.length}) ===`);
    for (const r of result.spliceLog) {
      console.log(
        `  ${r.location}: ${r.subSpanCount} sub-spans from ${r.sourceTemporaryRef}`,
      );
    }
  } else {
    console.log('');
    console.log('No splice recoveries fired.');
  }

  if (memo.sourceCoverage.limitations.length > 0) {
    console.log('');
    console.log('=== Coverage limitations (per model) ===');
    for (const l of memo.sourceCoverage.limitations) {
      console.log(`  - ${l}`);
    }
  }

  console.log('');
  console.log('=== Job To Be Done ===');
  console.log(`Statement:`);
  console.log(`  ${memo.jobToBeDone.statement}`);
  console.log(`Rationale:`);
  console.log(`  ${memo.jobToBeDone.rationale}`);
  console.log(
    `Supporting quotes (${memo.jobToBeDone.supportingQuotes.length}):`,
  );
  for (const q of memo.jobToBeDone.supportingQuotes) {
    console.log(`  > [${q.sourceTemporaryRef} ${q.sourceReliability}]`);
    console.log(`    "${truncate(q.text, 220)}"`);
  }

  console.log('');
  console.log('=== Dominant Pattern ===');
  console.log(`Statement:`);
  console.log(`  ${memo.dominantPattern.statement}`);
  console.log(`Elaboration:`);
  console.log(`  ${memo.dominantPattern.elaboration}`);
  console.log(`Falsifiability:`);
  console.log(`  ${memo.dominantPattern.falsifiability}`);
  console.log(`Self-flagged: ${memo.dominantPattern.falsifiabilityCheck}`);

  for (const [name, section] of [
    ['What They Love', memo.whatTheyLove],
    ['What Frustrates', memo.whatFrustrates],
    ['What They Wish', memo.whatTheyWish],
    ['Contradictions', memo.contradictions],
  ] as const) {
    console.log('');
    console.log(`=== ${name} ===`);
    console.log(`Summary: ${section.summary}`);
    for (const [i, t] of section.themes.entries()) {
      console.log(
        `  ${i + 1}. [${t.category}] sourceCount=${t.sourceCount} ` +
          `weightedConf=${t.weightedConfidence.toFixed(2)}`,
      );
      console.log(`     ${truncate(t.statement, 200)}`);
    }
  }

  console.log('');
  console.log('=== Cost & Latency ===');
  console.log(`Cost:    $${result.totalCostUsd.toFixed(4)}`);
  console.log(`Latency: ${result.totalLatencyMs}ms`);
  console.log(
    `Tokens:  ${result.totalInputTokens} in / ${result.totalOutputTokens} out`,
  );
}

function truncate(s: string, n: number): string {
  const oneLine = s.replace(/\s+/g, ' ').trim();
  return oneLine.length > n ? `${oneLine.slice(0, n)}...` : oneLine;
}

async function readJson<T>(filePath: string): Promise<T> {
  const text = await readFile(filePath, 'utf8');
  return JSON.parse(text) as T;
}

main().catch((err: unknown) => {
  console.error('Fatal:', err);
  process.exit(1);
});
