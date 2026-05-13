import type { SourceDTO, SourceMetadata } from '@/types';

const LOG_PREFIX = '[scrape:reddit]';
const USER_AGENT =
  'customer-voice-mirror/0.1 (research-bot; +https://github.com/customer-voice-mirror)';

// Sourcing mix: aim for ~12 posts and ~18 comments. Long comment threads under
// MSP/B2B posts carry the richest frustration/churn signal; the synthesis prompt
// weights LOW-reliability sources more heavily for those categories, so leaning
// into comments is intentional.
//
// Voice contamination (e.g. company employees/founders replying in their own
// product's subreddit) is deliberately NOT filtered here. We let those sources
// through as LOW-reliability rows and rely on the extractor agent to recognize
// self-identifying employee comments ("I work at <company>", "Speaking as the
// CEO", etc.) and weight or label them accordingly. A scraper-side blocklist
// would be fragile, ages poorly, and would also strip legitimate
// CEO/founder commentary that is useful market context.
const SEARCH_LIMIT = 20;
const POST_OUTPUT_CAP = 12;
const TOP_POSTS_FOR_COMMENTS = 6;
const COMMENTS_PER_POST = 3;
const TARGET_TOTAL = 30;

const POLITE_DELAY_MS = 250;
const MAX_RETRIES_ON_429 = 2;
const RETRY_BACKOFF_MS = 5_000;
const REQUEST_TIMEOUT_MS = 15_000;

interface RedditListing<T> {
  kind: 'Listing';
  data: {
    children: Array<{ kind: string; data: T }>;
    after: string | null;
    before: string | null;
  };
}

interface RawPostData {
  id?: string;
  name?: string;
  title?: string;
  selftext?: string;
  author?: string;
  subreddit?: string;
  score?: number;
  num_comments?: number;
  permalink?: string;
  created_utc?: number;
}

interface RawCommentData {
  id?: string;
  body?: string;
  author?: string;
  subreddit?: string;
  score?: number;
  permalink?: string;
  link_id?: string;
  created_utc?: number;
}

interface NormalizedPost {
  id: string;
  name: string;
  title: string;
  selftext: string;
  author: string;
  subreddit: string;
  score: number;
  numComments: number;
  permalink: string;
  createdUtc: number;
}

interface NormalizedComment {
  id: string;
  body: string;
  author: string;
  subreddit: string;
  score: number;
  permalink: string;
  createdUtc: number;
}

export async function scrapeReddit(
  companyName: string,
  temporaryRefPrefix: string,
): Promise<SourceDTO[]> {
  const trimmed = companyName.trim();
  if (!trimmed) {
    console.warn(`${LOG_PREFIX} empty companyName`);
    return [];
  }

  let posts: NormalizedPost[] = [];
  try {
    const queries = [
      `"${trimmed}" SaaS`,
      `"${trimmed}" software review`,
    ];
    posts = await searchPosts(queries);
    console.log(
      `${LOG_PREFIX} search returned ${posts.length} post(s) for "${trimmed}" ` +
        `across ${queries.length} disambiguated query(s)`,
    );
  } catch (err) {
    console.error(`${LOG_PREFIX} search failed: ${(err as Error).message}`);
  }

  const sources: Array<Omit<SourceDTO, 'temporaryRef'>> = [];
  let postsAdded = 0;
  for (const p of posts) {
    if (postsAdded >= POST_OUTPUT_CAP) break;
    if (sources.length >= TARGET_TOTAL) break;
    const dto = postToSource(p);
    if (dto) {
      sources.push(dto);
      postsAdded += 1;
    }
  }

  const topForComments = posts.slice(0, TOP_POSTS_FOR_COMMENTS);
  for (const p of topForComments) {
    if (sources.length >= TARGET_TOTAL) break;
    try {
      const comments = await fetchTopComments(p, COMMENTS_PER_POST);
      for (const c of comments) {
        if (sources.length >= TARGET_TOTAL) break;
        const dto = commentToSource(c, p);
        if (dto) sources.push(dto);
      }
    } catch (err) {
      console.warn(
        `${LOG_PREFIX} comments fetch for ${p.id} failed: ${(err as Error).message}`,
      );
    }
  }

  console.log(
    `${LOG_PREFIX} produced ${sources.length} source(s) ` +
      `(${sources.filter((s: Omit<SourceDTO, 'temporaryRef'>) => s.type === 'REDDIT_POST').length} posts, ` +
      `${sources.filter((s: Omit<SourceDTO, 'temporaryRef'>) => s.type === 'REDDIT_COMMENT').length} comments)`,
  );

  return sources.map<SourceDTO>((s, i) => ({
    ...s,
    temporaryRef: `${temporaryRefPrefix}_${i + 1}`,
  }));
}

async function searchPosts(queries: string[]): Promise<NormalizedPost[]> {
  const seen = new Set<string>();
  const posts: NormalizedPost[] = [];

  for (const query of queries) {
    const results = await searchPostsForQuery(query);
    for (const post of results) {
      const key = post.permalink.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      posts.push(post);
      if (posts.length >= SEARCH_LIMIT) return posts;
    }
  }

  return posts;
}

async function searchPostsForQuery(query: string): Promise<NormalizedPost[]> {
  const url = new URL('https://www.reddit.com/search.json');
  url.searchParams.set('q', query);
  url.searchParams.set('limit', String(SEARCH_LIMIT));
  url.searchParams.set('sort', 'relevance');
  url.searchParams.set('raw_json', '1');

  const data = await redditFetch<RedditListing<RawPostData>>(url.toString());
  if (!data) return [];

  const posts: NormalizedPost[] = [];
  for (const item of data.data?.children ?? []) {
    if (item.kind !== 't3') continue;
    const n = normalizePost(item.data);
    if (n) posts.push(n);
  }
  return posts;
}

async function fetchTopComments(
  post: NormalizedPost,
  limit: number,
): Promise<NormalizedComment[]> {
  // Reddit comment endpoint returns [postListing, commentsListing]
  const url = new URL(`https://www.reddit.com${post.permalink}.json`);
  url.searchParams.set('limit', String(limit * 4));
  url.searchParams.set('sort', 'top');
  url.searchParams.set('raw_json', '1');

  const data = await redditFetch<RedditListing<RawCommentData>[]>(url.toString());
  if (!Array.isArray(data) || data.length < 2) return [];
  const tree = data[1];

  const comments: NormalizedComment[] = [];
  for (const item of tree.data?.children ?? []) {
    if (comments.length >= limit) break;
    if (item.kind !== 't1') continue;
    const n = normalizeComment(item.data, post.subreddit);
    if (n) comments.push(n);
  }
  return comments;
}

function normalizePost(d: RawPostData): NormalizedPost | null {
  if (!d.id || !d.subreddit || !d.permalink) return null;
  const title = (d.title ?? '').trim();
  if (!title) return null;
  return {
    id: d.id,
    name: d.name ?? `t3_${d.id}`,
    title,
    selftext: (d.selftext ?? '').trim(),
    author: d.author ?? '[deleted]',
    subreddit: d.subreddit,
    score: typeof d.score === 'number' ? d.score : 0,
    numComments: typeof d.num_comments === 'number' ? d.num_comments : 0,
    permalink: d.permalink,
    createdUtc: typeof d.created_utc === 'number' ? d.created_utc : 0,
  };
}

function normalizeComment(
  d: RawCommentData,
  fallbackSubreddit: string,
): NormalizedComment | null {
  const body = (d.body ?? '').trim();
  if (!body || body === '[deleted]' || body === '[removed]') return null;
  const author = (d.author ?? '').trim();
  if (!author || author === '[deleted]' || author === 'AutoModerator') return null;
  if (!d.id || !d.permalink) return null;
  return {
    id: d.id,
    body,
    author,
    subreddit: d.subreddit ?? fallbackSubreddit,
    score: typeof d.score === 'number' ? d.score : 0,
    permalink: d.permalink,
    createdUtc: typeof d.created_utc === 'number' ? d.created_utc : 0,
  };
}

function postToSource(p: NormalizedPost): Omit<SourceDTO, 'temporaryRef'> | null {
  const rawText = p.selftext ? `${p.title}\n\n${p.selftext}` : p.title;
  if (!rawText.trim()) return null;
  const metadata: SourceMetadata = {
    type: 'REDDIT_POST',
    subreddit: p.subreddit,
    upvotes: p.score,
    numComments: p.numComments,
  };
  return {
    type: 'REDDIT_POST',
    url: `https://www.reddit.com${p.permalink}`,
    title: p.title,
    author: p.author === '[deleted]' ? null : p.author,
    authorContext: null,
    publishedAt: p.createdUtc > 0 ? new Date(p.createdUtc * 1000) : null,
    rawText,
    reliability: 'LOW',
    metadata,
  };
}

function commentToSource(
  c: NormalizedComment,
  parent: NormalizedPost,
): Omit<SourceDTO, 'temporaryRef'> | null {
  if (!c.body.trim()) return null;
  const postUrl = `https://www.reddit.com${parent.permalink}`;
  const metadata: SourceMetadata = {
    type: 'REDDIT_COMMENT',
    subreddit: c.subreddit,
    postUrl,
    upvotes: c.score,
  };
  return {
    type: 'REDDIT_COMMENT',
    url: `https://www.reddit.com${c.permalink}`,
    title: null,
    author: c.author,
    authorContext: null,
    publishedAt: c.createdUtc > 0 ? new Date(c.createdUtc * 1000) : null,
    rawText: c.body,
    reliability: 'LOW',
    metadata,
  };
}

async function redditFetch<T>(url: string): Promise<T | null> {
  let lastErr: Error | null = null;
  for (let attempt = 0; attempt <= MAX_RETRIES_ON_429; attempt++) {
    if (attempt > 0) {
      const wait = RETRY_BACKOFF_MS * attempt;
      console.warn(`${LOG_PREFIX} backoff ${wait}ms before retry ${attempt}`);
      await sleep(wait);
    } else {
      await sleep(POLITE_DELAY_MS);
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const resp = await fetch(url, {
        headers: {
          'User-Agent': USER_AGENT,
          Accept: 'application/json',
        },
        signal: controller.signal,
      });
      if (resp.status === 429) {
        lastErr = new Error(`429 Too Many Requests from ${url}`);
        continue;
      }
      if (!resp.ok) {
        throw new Error(`HTTP ${resp.status} from ${url}`);
      }
      const json = (await resp.json()) as T;
      return json;
    } catch (err) {
      lastErr = err as Error;
      // 429 already retried; other errors fall through and we try once more if attempts remain.
    } finally {
      clearTimeout(timer);
    }
  }
  if (lastErr) throw lastErr;
  return null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
