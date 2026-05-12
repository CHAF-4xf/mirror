import type {
  SourceDTO,
  SourceMetadata,
  SourceReliability,
  SourceType,
} from '@/types';

const LOG_PREFIX = '[scrape:third-party]';
const BRAVE_ENDPOINT = 'https://api.search.brave.com/res/v1/web/search';

const COUNT_PER_QUERY = 20;
const QUERY_DELAY_MS = 1_100; // Brave free tier: 1 req/sec, add headroom
const MIN_SNIPPET_LENGTH = 100;
const MAX_RESULTS = 25;
const REQUEST_TIMEOUT_MS = 15_000;
const MAX_RETRIES_ON_429 = 2;
const RETRY_BACKOFF_MS = 5_000;

// Design pattern: scrape-time filtering vs extract-time filtering.
//
// This blacklist is intentionally limited to domains that, by category, CANNOT
// produce customer voice for a B2B SaaS company. Two kinds:
//
//   1. Already-covered or wrong-medium hosts (reddit, social, video).
//   2. Employer review sites (glassdoor, indeed, inhersight, comparably) —
//      reviews of working AT the company, not customers reviewing the product.
//   3. Business-intelligence profiles (crunchbase, cbinsights, getlatka, growjo,
//      pitchbook) — funding figures and company demographics, not sentiment.
//
// We do NOT filter for "snippet must mention the company name" or anything else
// that requires editorial judgment. Wrong-company hits (e.g. "Rewst" the Twitter
// scheduler vs "Rewst" the MSP automation platform) and other content that
// MIGHT be signal-with-judgment are left to the extractor agent, which has the
// specificity tests and full context to make those calls.
const BLACKLIST_HOST_SUFFIXES = [
  // Already covered by other scrapers / not text reviews
  'reddit.com',
  'youtube.com',
  'youtu.be',
  'facebook.com',
  'twitter.com',
  'x.com',
  'linkedin.com',
  'instagram.com',
  'tiktok.com',
  'pinterest.com',
  // Employer review sites
  'glassdoor.com',
  'indeed.com',
  'inhersight.com',
  'comparably.com',
  // Business-intelligence / company profile sites
  'crunchbase.com',
  'cbinsights.com',
  'getlatka.com',
  'growjo.com',
  'pitchbook.com',
];

// Known review aggregators -> OTHER_REVIEW with MEDIUM reliability.
const AGGREGATOR_HOSTS: Record<string, string> = {
  'g2.com': 'G2',
  'capterra.com': 'Capterra',
  'softwareadvice.com': 'Software Advice',
  'getapp.com': 'GetApp',
  'trustradius.com': 'TrustRadius',
  'trustpilot.com': 'Trustpilot',
  'producthunt.com': 'Product Hunt',
  'gartner.com': 'Gartner',
  'crozdesk.com': 'Crozdesk',
  'saasworthy.com': 'SaaSworthy',
  'stackshare.io': 'Stackshare',
  'sourceforge.net': 'SourceForge',
  'slashdot.org': 'Slashdot',
  'serchen.com': 'Serchen',
  'goodfirms.co': 'GoodFirms',
};

// Free-blog hosts: third-party content with weaker accountability -> LOW reliability.
const ANONYMOUS_BLOG_HOSTS = new Set([
  'medium.com',
  'wordpress.com',
  'blogspot.com',
  'substack.com',
  'hashnode.dev',
  'dev.to',
]);

interface BraveSearchResponse {
  web?: {
    results?: BraveSearchResult[];
  };
}

interface BraveSearchResult {
  title?: string;
  url?: string;
  description?: string;
  meta_url?: {
    hostname?: string;
    favicon?: string;
  };
  page_age?: string;
}

export async function scrapeThirdPartyReviews(
  companyName: string,
  temporaryRefPrefix: string,
): Promise<SourceDTO[]> {
  const company = companyName.trim();
  if (!company) {
    console.warn(`${LOG_PREFIX} empty companyName`);
    return [];
  }

  const apiKey = process.env.BRAVE_SEARCH_API_KEY?.trim();
  if (!apiKey) {
    console.error(`${LOG_PREFIX} BRAVE_SEARCH_API_KEY is not set`);
    return [];
  }

  const queries = [
    `"${company}" reviews`,
    `"${company}" alternatives`,
    `"${company}" vs`,
  ];

  const dedupKeys = new Set<string>();
  const sources: Array<Omit<SourceDTO, 'temporaryRef'>> = [];
  const companyToken = company.toLowerCase();

  for (let i = 0; i < queries.length; i += 1) {
    if (i > 0) await sleep(QUERY_DELAY_MS);
    const query = queries[i];
    let response: BraveSearchResponse | null = null;
    try {
      response = await braveSearch(query, apiKey);
    } catch (err) {
      console.warn(`${LOG_PREFIX} query "${query}" failed: ${(err as Error).message}`);
      continue;
    }

    const results = response?.web?.results ?? [];
    console.log(`${LOG_PREFIX} query "${query}" -> ${results.length} raw result(s)`);

    for (const r of results) {
      if (sources.length >= MAX_RESULTS) break;
      const dto = resultToSource(r, companyToken, dedupKeys);
      if (dto) sources.push(dto);
    }
    if (sources.length >= MAX_RESULTS) break;
  }

  console.log(
    `${LOG_PREFIX} produced ${sources.length} source(s) ` +
      `(${sources.filter((s: Omit<SourceDTO, 'temporaryRef'>) => s.type === 'OTHER_REVIEW').length} aggregator, ` +
      `${sources.filter((s: Omit<SourceDTO, 'temporaryRef'>) => s.type === 'THIRD_PARTY_REVIEW').length} third-party)`,
  );

  return sources.map<SourceDTO>((s, i) => ({
    ...s,
    temporaryRef: `${temporaryRefPrefix}_${i + 1}`,
  }));
}

async function braveSearch(
  query: string,
  apiKey: string,
): Promise<BraveSearchResponse | null> {
  const url = new URL(BRAVE_ENDPOINT);
  url.searchParams.set('q', query);
  url.searchParams.set('count', String(COUNT_PER_QUERY));
  url.searchParams.set('safesearch', 'moderate');

  let lastErr: Error | null = null;
  for (let attempt = 0; attempt <= MAX_RETRIES_ON_429; attempt += 1) {
    if (attempt > 0) {
      const wait = RETRY_BACKOFF_MS * attempt;
      console.warn(`${LOG_PREFIX} backoff ${wait}ms before retry ${attempt}`);
      await sleep(wait);
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const resp = await fetch(url.toString(), {
        headers: {
          Accept: 'application/json',
          'X-Subscription-Token': apiKey,
        },
        signal: controller.signal,
      });
      if (resp.status === 429) {
        lastErr = new Error(`429 Too Many Requests for "${query}"`);
        continue;
      }
      if (!resp.ok) {
        throw new Error(`HTTP ${resp.status} from Brave for "${query}"`);
      }
      return (await resp.json()) as BraveSearchResponse;
    } catch (err) {
      lastErr = err as Error;
    } finally {
      clearTimeout(timer);
    }
  }
  if (lastErr) throw lastErr;
  return null;
}

function resultToSource(
  r: BraveSearchResult,
  companyToken: string,
  dedupKeys: Set<string>,
): Omit<SourceDTO, 'temporaryRef'> | null {
  const snippet = (r.description ?? '').replace(/<[^>]+>/g, '').trim();
  if (snippet.length < MIN_SNIPPET_LENGTH) return null;

  const rawUrl = r.url?.trim();
  if (!rawUrl) return null;

  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return null;
  }
  const host = parsed.host.toLowerCase().replace(/^www\./, '');

  if (BLACKLIST_HOST_SUFFIXES.some((suffix) => host === suffix || host.endsWith(`.${suffix}`))) {
    return null;
  }

  // Skip the company's own domain (best-effort: company name token in host).
  if (host.split('.').some((segment) => segment === companyToken)) {
    return null;
  }

  const dedupKey = canonicalUrl(parsed);
  if (dedupKeys.has(dedupKey)) return null;
  dedupKeys.add(dedupKey);

  const title = (r.title ?? '').replace(/<[^>]+>/g, '').trim() || null;
  const aggregatorName = AGGREGATOR_HOSTS[host];

  let type: SourceType;
  let metadata: SourceMetadata;
  let reliability: SourceReliability;

  if (aggregatorName) {
    type = 'OTHER_REVIEW';
    metadata = {
      type: 'OTHER_REVIEW',
      platform: aggregatorName,
      rating: null, // Star ratings aren't reliably in search snippets
    };
    reliability = 'MEDIUM';
  } else {
    const reviewerName = derivePublicationName(host);
    const reviewerUrl = `${parsed.protocol}//${parsed.host}`;
    type = 'THIRD_PARTY_REVIEW';
    metadata = {
      type: 'THIRD_PARTY_REVIEW',
      reviewerName,
      reviewerUrl,
    };
    reliability = ANONYMOUS_BLOG_HOSTS.has(host) ? 'LOW' : 'MEDIUM';
  }

  return {
    type,
    url: rawUrl,
    title,
    author: null, // Search snippets don't expose authors
    authorContext: null,
    publishedAt: null, // page_age is fuzzy ("1 week ago"); leave null
    rawText: snippet,
    reliability,
    metadata,
  };
}

function canonicalUrl(u: URL): string {
  const host = u.host.toLowerCase().replace(/^www\./, '');
  const path = u.pathname.replace(/\/$/, '');
  return `${host}${path}`;
}

function derivePublicationName(host: string): string {
  const stem = host.split('.')[0];
  if (!stem) return host;
  return stem
    .split('-')
    .filter((part: string) => Boolean(part))
    .map((part: string) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
