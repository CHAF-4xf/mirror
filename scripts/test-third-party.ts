import 'dotenv/config';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { scrapeThirdPartyReviews } from '@/lib/scraper/third-party-reviews';

const COMPANY = 'Rewst';
const PREFIX = 'rewst_review';
const OUT_DIR = path.resolve(process.cwd(), 'tmp');
const OUT_FILE = path.join(OUT_DIR, 'rewst-third-party.json');

async function main(): Promise<void> {
  console.log(`Searching third-party reviews for "${COMPANY}"...`);
  const startedAt = Date.now();
  const results = await scrapeThirdPartyReviews(COMPANY, PREFIX);
  const elapsedMs = Date.now() - startedAt;

  console.log(`Got ${results.length} sources in ${elapsedMs}ms`);

  const counts = results.reduce<Record<string, number>>((acc, s) => {
    acc[s.type] = (acc[s.type] ?? 0) + 1;
    return acc;
  }, {});
  console.log('Counts by type:', counts);

  const reliabilityCounts = results.reduce<Record<string, number>>((acc, s) => {
    acc[s.reliability] = (acc[s.reliability] ?? 0) + 1;
    return acc;
  }, {});
  console.log('Counts by reliability:', reliabilityCounts);

  if (results.length > 0) {
    console.log('First result:');
    console.log(JSON.stringify(results[0], null, 2));
  }

  await mkdir(OUT_DIR, { recursive: true });
  await writeFile(OUT_FILE, JSON.stringify(results, null, 2), 'utf8');
  console.log(`Wrote ${OUT_FILE}`);
}

main().catch((err: unknown) => {
  console.error('Fatal:', err);
  process.exit(1);
});
