import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { scrapeCustomerStories } from '@/lib/scraper/customer-stories';

const TARGET_URL = 'https://rewst.io';
const PREFIX = 'rewst_story';
const OUT_DIR = path.resolve(process.cwd(), 'tmp');
const OUT_FILE = path.join(OUT_DIR, 'rewst-stories.json');

async function main(): Promise<void> {
  console.log(`Scraping ${TARGET_URL}...`);
  const startedAt = Date.now();
  const stories = await scrapeCustomerStories(TARGET_URL, PREFIX);
  const elapsedMs = Date.now() - startedAt;

  console.log(`Got ${stories.length} stories in ${elapsedMs}ms`);
  if (stories.length > 0) {
    console.log('First result:');
    console.log(JSON.stringify(stories[0], null, 2));
  }

  await mkdir(OUT_DIR, { recursive: true });
  await writeFile(OUT_FILE, JSON.stringify(stories, null, 2), 'utf8');
  console.log(`Wrote ${OUT_FILE}`);
}

main().catch((err: unknown) => {
  console.error('Fatal:', err);
  process.exit(1);
});
