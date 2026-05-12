import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { scrapeReddit } from '@/lib/scraper/reddit';

const COMPANY = 'Rewst';
const PREFIX = 'rewst_reddit';
const OUT_DIR = path.resolve(process.cwd(), 'tmp');
const OUT_FILE = path.join(OUT_DIR, 'rewst-reddit.json');

async function main(): Promise<void> {
  console.log(`Searching Reddit for "${COMPANY}"...`);
  const startedAt = Date.now();
  const results = await scrapeReddit(COMPANY, PREFIX);
  const elapsedMs = Date.now() - startedAt;

  console.log(`Got ${results.length} sources in ${elapsedMs}ms`);

  const counts = results.reduce<Record<string, number>>((acc, s) => {
    acc[s.type] = (acc[s.type] ?? 0) + 1;
    return acc;
  }, {});
  console.log('Counts by type:', counts);

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
