// IMPORTANT: type-only import. Playwright reads PLAYWRIGHT_BROWSERS_PATH in an
// IIFE at first module load (see playwright-core/lib/server/registry/index.js),
// so we must neutralize that env var BEFORE importing `playwright` at runtime.
// The actual runtime import happens via dynamic import() inside
// scrapeCustomerStories() below, after neutralizeSandboxPlaywrightPath() runs.
import type { Browser, Page } from 'playwright';
import type { SourceDTO, SourceMetadata } from '@/types';

const CANDIDATE_PATHS = [
  '/customers',
  '/customer-stories',
  '/case-studies',
  '/stories',
  '/customers/stories',
  '/success-stories',
  '/customer-success',
  '/testimonials',
] as const;

const NETWORK_IDLE_TIMEOUT_MS = 8_000;

const PAGE_TIMEOUT_MS = 30_000;
const MAX_STORY_PAGES_TO_FOLLOW = 12;
const MIN_QUOTE_LENGTH = 40;
const LOG_PREFIX = '[scrape:customer-stories]';
const DESKTOP_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 13_6) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/124.0 Safari/537.36';

interface RawTestimonial {
  quote: string;
  customerName: string | null;
  customerCompany: string | null;
  customerRole: string | null;
  storyUrl: string | null;
}

export async function scrapeCustomerStories(
  companyUrl: string,
  temporaryRefPrefix: string,
): Promise<SourceDTO[]> {
  const base = normalizeBaseUrl(companyUrl);
  if (!base) {
    console.error(`${LOG_PREFIX} invalid companyUrl: ${companyUrl}`);
    return [];
  }

  neutralizeSandboxPlaywrightPath();

  // Deferred dynamic import: see note at top of file. Loading playwright here
  // (after the env mutation) ensures registryDirectory resolves to the real
  // user-level cache, not the sandbox cache.
  const { chromium } = await import('playwright');

  let browser: Browser | null = null;
  try {
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ userAgent: DESKTOP_UA });
    // Polyfill esbuild's __name helper inside the page so functions passed to
    // page.evaluate (which tsx compiles with --keep-names) don't ReferenceError.
    // String form skips tsx/esbuild transformation entirely.
    await context.addInitScript(
      'globalThis.__name = globalThis.__name || function (fn) { return fn; };',
    );
    const page = await context.newPage();
    page.setDefaultTimeout(PAGE_TIMEOUT_MS);
    page.setDefaultNavigationTimeout(PAGE_TIMEOUT_MS);

    const landed = await findCustomersPage(page, base);
    if (!landed) {
      console.warn(`${LOG_PREFIX} no candidate path returned 200 for ${base}`);
      return [];
    }
    console.log(`${LOG_PREFIX} landed on ${landed.url}`);

    await waitForRenderedContent(page);
    let testimonials = dedupeByQuote(await extractTestimonials(page, landed.url));
    console.log(
      `${LOG_PREFIX} extracted ${testimonials.length} testimonial(s) from index page`,
    );

    const storyLinksFromIndex = await collectStoryLinksFromIndex(page, base, landed.url);
    const storyLinksFromTestimonials = collectStoryUrlsToFollow(testimonials, base);
    const linkedToFollow = Array.from(
      new Set([...storyLinksFromTestimonials, ...storyLinksFromIndex]),
    ).slice(0, MAX_STORY_PAGES_TO_FOLLOW);

    if (linkedToFollow.length > 0) {
      console.log(
        `${LOG_PREFIX} following ${linkedToFollow.length} story page(s) for full text`,
      );
    }
    for (const storyUrl of linkedToFollow) {
      try {
        const resp = await page.goto(storyUrl, { waitUntil: 'domcontentloaded' });
        if (!resp || resp.status() >= 400) continue;
        await waitForRenderedContent(page);
        const finalUrl = page.url();
        const detail = (await extractTestimonials(page, finalUrl)).map(
          (t: RawTestimonial) => ({
            ...t,
            // Detail-page testimonials reference the detail page itself unless they
            // explicitly carry their own deeper link.
            storyUrl: t.storyUrl ?? finalUrl,
          }),
        );
        testimonials = dedupeByQuote([...testimonials, ...detail]);
      } catch (err) {
        console.warn(
          `${LOG_PREFIX} failed to load story ${storyUrl}: ${(err as Error).message}`,
        );
      }
    }

    return testimonials.map<SourceDTO>((t: RawTestimonial, i: number) =>
      toSourceDTO(t, i + 1, temporaryRefPrefix, landed.url),
    );
  } catch (err) {
    console.error(`${LOG_PREFIX} fatal: ${(err as Error).message}`);
    return [];
  } finally {
    if (browser) {
      try {
        await browser.close();
      } catch (err) {
        console.warn(`${LOG_PREFIX} browser.close failed: ${(err as Error).message}`);
      }
    }
  }
}

// Cursor's agent sandbox injects PLAYWRIGHT_BROWSERS_PATH pointing at a per-run
// cache directory that doesn't contain Chromium. When we run outside the sandbox
// (required_permissions: ["all"]), that env var survives and breaks
// chromium.launch(). Detect the sandbox-cache fingerprint and unset the var so
// Playwright falls back to its platform-default cache
// (~/Library/Caches/ms-playwright on macOS, ~/.cache/ms-playwright on Linux).
function neutralizeSandboxPlaywrightPath(): void {
  const current = process.env['PLAYWRIGHT_BROWSERS_PATH'];
  if (!current) return;
  if (
    current.includes('cursor-sandbox-cache') ||
    current.includes('sandbox-cache')
  ) {
    console.warn(
      `${LOG_PREFIX} PLAYWRIGHT_BROWSERS_PATH points at sandbox cache ` +
        `(${current}); unsetting so Playwright uses the user-level cache`,
    );
    delete process.env['PLAYWRIGHT_BROWSERS_PATH'];
  }
}

function normalizeBaseUrl(input: string): string | null {
  try {
    const u = new URL(input);
    return `${u.protocol}//${u.host}`;
  } catch {
    return null;
  }
}

async function findCustomersPage(
  page: Page,
  base: string,
): Promise<{ url: string } | null> {
  for (const path of CANDIDATE_PATHS) {
    const url = `${base}${path}`;
    try {
      const resp = await page.goto(url, { waitUntil: 'domcontentloaded' });
      if (resp && resp.status() === 200) {
        return { url: page.url() };
      }
    } catch (err) {
      console.warn(`${LOG_PREFIX} goto ${url} failed: ${(err as Error).message}`);
    }
  }
  return null;
}

async function waitForRenderedContent(page: Page): Promise<void> {
  await page
    .waitForLoadState('networkidle', { timeout: NETWORK_IDLE_TIMEOUT_MS })
    .catch(() => undefined);
}

async function extractTestimonials(
  page: Page,
  pageUrl: string,
): Promise<RawTestimonial[]> {
  return page.evaluate(
    ({ pageUrlInner, MIN_LEN }) => {
      const clean = (s: string | null | undefined): string =>
        (s ?? '').replace(/\s+/g, ' ').trim();

      const absUrl = (href: string | null): string | null => {
        if (!href) return null;
        try {
          return new URL(href, pageUrlInner).toString();
        } catch {
          return null;
        }
      };

      function parseAttribution(s: string): {
        name: string | null;
        company: string | null;
        role: string | null;
      } {
        if (!s) return { name: null, company: null, role: null };
        const parts = s
          .split(/\s*[,|·•–—]\s*|\s+at\s+|\s+of\s+/i)
          .map((p: string) => p.trim())
          .filter((p: string) => Boolean(p));
        if (parts.length === 0) return { name: null, company: null, role: null };
        if (parts.length === 1) {
          const single = parts[0];
          const looksLikePerson = /^[A-Z][a-z]+\s+[A-Z][a-z]+/.test(single);
          return looksLikePerson
            ? { name: single, company: null, role: null }
            : { name: null, company: single, role: null };
        }
        if (parts.length >= 3) {
          return { name: parts[0], role: parts[1], company: parts.slice(2).join(' ') };
        }
        return { name: parts[0], role: null, company: parts[1] };
      }

      const results: Array<{
        quote: string;
        customerName: string | null;
        customerCompany: string | null;
        customerRole: string | null;
        storyUrl: string | null;
      }> = [];
      const seen = new Set<string>();

      const push = (
        quote: string,
        attribution: string,
        link: HTMLAnchorElement | null,
      ): void => {
        if (quote.length < MIN_LEN) return;
        const key = quote.toLowerCase().slice(0, 200);
        if (seen.has(key)) return;
        seen.add(key);
        const parsed = parseAttribution(clean(attribution));
        results.push({
          quote,
          customerName: parsed.name,
          customerCompany: parsed.company,
          customerRole: parsed.role,
          storyUrl: absUrl(link?.getAttribute('href') ?? null),
        });
      };

      const stripAttributionTail = (quote: string, attribution: string): string => {
        if (!attribution) return quote;
        const idx = quote.lastIndexOf(attribution);
        if (idx === -1) return quote;
        return quote.slice(0, idx).trim();
      };

      const stripQuoteMarks = (s: string): string =>
        s
          .replace(/^[“”"'«»\s—–-]+/, '')
          .replace(/[“”"'«»\s—–-]+$/, '')
          .trim();

      for (const bq of Array.from(document.querySelectorAll('blockquote'))) {
        const figure = bq.closest('figure');
        const attributionEl =
          bq.querySelector('cite') ??
          figure?.querySelector('figcaption') ??
          bq.querySelector('footer') ??
          bq.querySelector('strong:last-of-type') ??
          bq.querySelector('em:last-of-type') ??
          bq.querySelector('b:last-of-type') ??
          null;
        const attribution = clean(attributionEl?.textContent ?? '');
        const fullText = clean(bq.textContent);
        const quote = stripQuoteMarks(stripAttributionTail(fullText, attribution));
        const link =
          (bq.closest('a') as HTMLAnchorElement | null) ??
          (figure?.querySelector('a') as HTMLAnchorElement | null) ??
          null;
        push(quote, attribution, link);
      }

      const cardSelectors = [
        '[class*="testimonial" i]',
        '[class*="customer-story" i]',
        '[class*="case-study" i]',
        '[class*="quote" i]',
        '[class*="pull-quote" i]',
        '[data-testid*="testimonial" i]',
      ];
      const isQuotedString = (s: string): boolean => /^[“”"'«»]/.test(s);

      for (const sel of cardSelectors) {
        for (const node of Array.from(document.querySelectorAll(sel))) {
          if (node.querySelector('blockquote')) {
            // Will already be handled by blockquote pass above; skip to avoid dup work.
            continue;
          }
          const explicitQuoteEl =
            node.querySelector(
              'q, [class*="quote-text" i], [class*="quote-body" i], p[class*="quote" i]',
            ) ?? null;
          let quoteText = '';
          if (explicitQuoteEl) {
            quoteText = clean(explicitQuoteEl.textContent);
          } else {
            const ps = Array.from(node.querySelectorAll('p'));
            const quotedP = ps.find((p) =>
              isQuotedString(clean(p.textContent)),
            );
            if (quotedP) quoteText = clean(quotedP.textContent);
          }
          if (!quoteText) continue;

          const attribution = clean(
            node.querySelector(
              '[class*="author" i], [class*="attribution" i], [class*="byline" i], cite, figcaption',
            )?.textContent ?? '',
          );
          const cleanQuote = stripQuoteMarks(
            stripAttributionTail(quoteText, attribution),
          );
          const link = node.querySelector('a') as HTMLAnchorElement | null;
          push(cleanQuote, attribution, link);
        }
      }

      return results;
    },
    { pageUrlInner: pageUrl, MIN_LEN: MIN_QUOTE_LENGTH },
  );
}

function dedupeByQuote(testimonials: RawTestimonial[]): RawTestimonial[] {
  const out: RawTestimonial[] = [];
  const seen = new Set<string>();
  for (const t of testimonials) {
    const key = t.quote.replace(/\s+/g, ' ').trim().toLowerCase().slice(0, 200);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(t);
  }
  return out;
}

function collectStoryUrlsToFollow(
  testimonials: RawTestimonial[],
  base: string,
): string[] {
  const baseHost = new URL(base).host;
  const urls = new Set<string>();
  for (const t of testimonials) {
    if (!t.storyUrl) continue;
    try {
      const u = new URL(t.storyUrl);
      if (u.host === baseHost) urls.add(u.toString());
    } catch {
      // ignore unparseable URLs
    }
  }
  return Array.from(urls);
}

const STORY_PATH_KEYWORDS = [
  'success-stor',
  'customer-stor',
  'case-stud',
  '/stories/',
  '/customers/',
  'testimonial',
];

async function collectStoryLinksFromIndex(
  page: Page,
  base: string,
  indexUrl: string,
): Promise<string[]> {
  const baseHost = new URL(base).host;
  const indexPath = new URL(indexUrl).pathname.replace(/\/$/, '');
  const hrefs = await page.evaluate(() =>
    Array.from(document.querySelectorAll('a[href]'))
      .map((a: Element) => (a as HTMLAnchorElement).href)
      .filter((href: string) => typeof href === 'string' && href.length > 0),
  );
  const urls = new Set<string>();
  for (const href of hrefs) {
    let parsed: URL;
    try {
      parsed = new URL(href);
    } catch {
      continue;
    }
    if (parsed.host !== baseHost) continue;
    const path = parsed.pathname.replace(/\/$/, '');
    if (path === indexPath) continue;
    const lowerPath = path.toLowerCase();
    if (!STORY_PATH_KEYWORDS.some((k) => lowerPath.includes(k))) continue;
    parsed.hash = '';
    urls.add(parsed.toString());
  }
  return Array.from(urls);
}

function toSourceDTO(
  t: RawTestimonial,
  index: number,
  prefix: string,
  fallbackUrl: string,
): SourceDTO {
  const url = t.storyUrl ?? fallbackUrl;
  const storySlug = deriveSlug(url);
  const title = t.customerCompany
    ? `${t.customerCompany} case study`
    : 'Customer case study';
  const authorContext =
    t.customerRole && t.customerCompany
      ? `${t.customerRole}, ${t.customerCompany}`
      : t.customerRole ?? t.customerCompany ?? null;
  const metadata: SourceMetadata = {
    type: 'CUSTOMER_STORY',
    storySlug,
    customerCompany: t.customerCompany,
    customerRole: t.customerRole,
  };
  return {
    temporaryRef: `${prefix}_${index}`,
    type: 'CUSTOMER_STORY',
    url,
    title,
    author: t.customerName,
    authorContext,
    publishedAt: null,
    rawText: t.quote,
    reliability: 'HIGH',
    metadata,
  };
}

function deriveSlug(url: string): string {
  try {
    const u = new URL(url);
    const segments = u.pathname
      .split('/')
      .filter((segment: string) => Boolean(segment));
    return segments[segments.length - 1] ?? u.host;
  } catch {
    return 'unknown';
  }
}
