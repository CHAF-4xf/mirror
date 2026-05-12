import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { renderMemo } from '@/lib/agents/renderer';
import type { MemoDTO, SourceDTO } from '@/types';

const TMP_DIR = path.resolve(process.cwd(), 'tmp');
const MEMO_FILE = path.join(TMP_DIR, 'rewst-memo.json');
const STORIES_FILE = path.join(TMP_DIR, 'rewst-stories.json');
const REDDIT_FILE = path.join(TMP_DIR, 'rewst-reddit.json');
const THIRD_PARTY_FILE = path.join(TMP_DIR, 'rewst-third-party.json');
const OUT_FILE = path.join(TMP_DIR, 'rewst-memo.md');

const PREVIEW_LINES = 100;

async function main(): Promise<void> {
  const memo = await readJson<MemoDTO>(MEMO_FILE);
  const [stories, reddit, thirdParty] = await Promise.all([
    readJson<SourceDTO[]>(STORIES_FILE),
    readJson<SourceDTO[]>(REDDIT_FILE),
    readJson<SourceDTO[]>(THIRD_PARTY_FILE),
  ]);
  const sources: SourceDTO[] = [...stories, ...reddit, ...thirdParty];

  console.log(
    `Loaded memo for ${memo.companyName} (${sources.length} sources for attribution lookup)`,
  );

  const rendered = renderMemo(memo, { sources });

  await mkdir(TMP_DIR, { recursive: true });
  await writeFile(OUT_FILE, rendered.renderedMarkdown, 'utf8');

  const totalLines = rendered.renderedMarkdown.split('\n').length;
  console.log(`Wrote ${OUT_FILE}`);
  console.log(`Markdown: ${rendered.renderedMarkdown.length} chars, ${totalLines} lines`);
  console.log('');
  console.log(`=== First ${PREVIEW_LINES} lines ===`);
  const lines = rendered.renderedMarkdown.split('\n').slice(0, PREVIEW_LINES);
  console.log(lines.join('\n'));
  if (totalLines > PREVIEW_LINES) {
    console.log('');
    console.log(`... (${totalLines - PREVIEW_LINES} more lines in ${OUT_FILE})`);
  }
}

async function readJson<T>(filePath: string): Promise<T> {
  const text = await readFile(filePath, 'utf8');
  return JSON.parse(text) as T;
}

main().catch((err: unknown) => {
  console.error('Fatal:', err);
  process.exit(1);
});
