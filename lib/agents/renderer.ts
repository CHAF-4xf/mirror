import type {
  MemoDTO,
  MemoSection,
  SourceDTO,
  SourceReliability,
  SplitFinding,
  VerbatimQuoteDTO,
} from '@/types';

// Mapping from MemoDTO field -> rendered section heading. Kept here so the
// section order is the single source of truth.
const SECTION_ORDER: Array<{
  heading: string;
  field: 'whatTheyLove' | 'whatFrustrates' | 'whatTheyWish' | 'contradictions';
}> = [
  { heading: 'What They Love', field: 'whatTheyLove' },
  { heading: 'What Frustrates Them', field: 'whatFrustrates' },
  { heading: 'What They Wish You Did', field: 'whatTheyWish' },
  { heading: 'Where Customer Voice Contradicts', field: 'contradictions' },
];

// Known review aggregators we display by their proper noun rather than host.
const AGGREGATOR_HOST_DISPLAY: Record<string, string> = {
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
};

export interface RenderOptions {
  /**
   * Original sources. When provided, the renderer produces rich attribution
   * ("Mike Pearlstein, CEO at Fusion Computing", "u/joeMSP on r/msp"). When
   * omitted, falls back to URL-derived attribution that still produces a
   * readable label but with less detail.
   */
  sources?: SourceDTO[];
}

/**
 * Pure function. Takes a MemoDTO, returns a copy with renderedMarkdown
 * populated. No I/O, no LLM calls, no async.
 *
 * Throws a clear error if required memo fields are missing — does not
 * silently render a broken memo.
 */
export function renderMemo(memo: MemoDTO, options: RenderOptions = {}): MemoDTO {
  validateMemo(memo);

  const byRef = new Map<string, SourceDTO>();
  for (const s of options.sources ?? []) byRef.set(s.temporaryRef, s);

  const markdown = buildMarkdown(memo, byRef);
  return { ...memo, renderedMarkdown: markdown };
}

// ============================================================
// Validation
// ============================================================

function validateMemo(memo: MemoDTO): void {
  if (!memo) throw new Error('renderMemo: memo is required');
  if (!memo.companyName) {
    throw new Error('renderMemo: memo.companyName is required');
  }
  if (!memo.generatedAt) {
    throw new Error('renderMemo: memo.generatedAt is required');
  }
  if (!memo.jobToBeDone?.statement) {
    throw new Error('renderMemo: memo.jobToBeDone.statement is required');
  }
  if (!Array.isArray(memo.jobToBeDone.supportingQuotes)) {
    throw new Error('renderMemo: memo.jobToBeDone.supportingQuotes must be an array');
  }
  if (!memo.dominantPattern?.statement) {
    throw new Error('renderMemo: memo.dominantPattern.statement is required');
  }
  if (!memo.dominantPattern.falsifiability) {
    throw new Error('renderMemo: memo.dominantPattern.falsifiability is required');
  }
  if (!memo.sourceCoverage) {
    throw new Error('renderMemo: memo.sourceCoverage is required');
  }
  for (const { field } of SECTION_ORDER) {
    const section = memo[field] as MemoSection | undefined;
    if (!section || !Array.isArray(section.themes)) {
      throw new Error(`renderMemo: memo.${field} must be a MemoSection with themes array`);
    }
  }
}

// ============================================================
// Markdown construction
// ============================================================

function buildMarkdown(memo: MemoDTO, byRef: Map<string, SourceDTO>): string {
  const out: string[] = [];

  // Header
  out.push(`# Customer Voice Mirror: ${memo.companyName}`);
  out.push(
    `*Generated ${formatDate(memo.generatedAt)} • Coverage: ${memo.sourceCoverage.coverageGrade}*`,
  );
  out.push('');

  // JTBD
  out.push('## The Job Customers Hire You For');
  out.push('');
  out.push(memo.jobToBeDone.statement);
  out.push('');
  out.push(memo.jobToBeDone.rationale);
  out.push('');
  for (const q of memo.jobToBeDone.supportingQuotes) {
    out.push(renderQuote(q, byRef));
  }
  out.push('');

  // Four memo sections in fixed order; skip empty.
  for (const { heading, field } of SECTION_ORDER) {
    const section = memo[field] as MemoSection;
    if (section.themes.length === 0) continue;
    renderMemoSection(out, heading, section, byRef);
  }

  // Dominant Pattern
  out.push('## The Dominant Pattern');
  out.push('');
  out.push(memo.dominantPattern.statement);
  out.push('');
  out.push(memo.dominantPattern.elaboration);
  out.push('');
  out.push(`*This pattern would not hold if: ${memo.dominantPattern.falsifiability}*`);
  out.push('');

  // Split Findings
  for (const split of memo.splitFindings ?? []) {
    renderSplitFinding(out, split, byRef);
  }

  // Coverage
  out.push('## Coverage');
  out.push('');
  out.push(`- Total sources: ${memo.sourceCoverage.totalSources}`);
  out.push(`- Customer stories: ${memo.sourceCoverage.customerStories}`);
  out.push(`- Reddit posts: ${memo.sourceCoverage.redditPosts}`);
  out.push(`- X mentions: ${memo.sourceCoverage.xMentions}`);
  out.push(`- Reviews: ${memo.sourceCoverage.reviews}`);
  out.push('');
  if (memo.sourceCoverage.limitations.length > 0) {
    out.push('**Coverage limitations:**');
    out.push('');
    for (const l of memo.sourceCoverage.limitations) {
      out.push(`- ${l}`);
    }
    out.push('');
  }

  // Footer
  out.push('---');
  out.push(
    '*This memo summarizes patterns in public customer voice. It does not interpret strategic implications. The reader draws their own conclusions.*',
  );

  return out.join('\n');
}

function renderSplitFinding(
  out: string[],
  split: SplitFinding,
  byRef: Map<string, SourceDTO>,
): void {
  out.push(`## Split Finding: ${split.theme}`);
  out.push('');
  out.push(`**Pattern A:** ${split.pattern_a.claim}`);
  out.push('');
  for (const q of split.pattern_a.supporting_quotes) {
    out.push(renderSplitQuote(q, byRef));
  }
  out.push('');
  out.push(`**Pattern B:** ${split.pattern_b.claim}`);
  out.push('');
  for (const q of split.pattern_b.supporting_quotes) {
    out.push(renderSplitQuote(q, byRef));
  }
  out.push('');
  out.push(`**Why this isn't resolved:** ${split.why_unresolved}`);
  if (split.tier_note?.trim()) {
    out.push('');
    out.push(`*${split.tier_note.trim()}*`);
  }
  out.push('');
}

function renderMemoSection(
  out: string[],
  heading: string,
  section: MemoSection,
  byRef: Map<string, SourceDTO>,
): void {
  out.push(`## ${heading}`);
  out.push('');
  if (section.summary?.trim()) {
    out.push(section.summary.trim());
    out.push('');
  }
  for (const theme of section.themes) {
    out.push(`### ${theme.statement}`);
    out.push('');
    for (const q of theme.verbatimQuotes) {
      out.push(renderQuote(q, byRef));
    }
    out.push('');
  }
}

function renderQuote(q: VerbatimQuoteDTO, byRef: Map<string, SourceDTO>): string {
  const source = byRef.get(q.sourceTemporaryRef);
  const attribution = deriveAttribution(q, source);
  const cleanText = q.text.replace(/\s+/g, ' ').trim();
  return `> "${cleanText}" — [${attribution.label}](${attribution.url})`;
}

function renderSplitQuote(q: VerbatimQuoteDTO, byRef: Map<string, SourceDTO>): string {
  const source = byRef.get(q.sourceTemporaryRef);
  const attribution = deriveAttribution(q, source);
  const cleanText = q.text.replace(/\s+/g, ' ').trim();
  return `> "${cleanText}" — [${attribution.label}](${attribution.url}), ${q.sourceReliability}`;
}

// ============================================================
// Source attribution
// ============================================================

interface Attribution {
  label: string;
  url: string;
}

function deriveAttribution(
  q: VerbatimQuoteDTO,
  source: SourceDTO | undefined,
): Attribution {
  if (source) {
    return attributionFromSource(source, q.sourceUrl);
  }
  return attributionFromUrl(q.sourceUrl, q.sourceReliability);
}

function attributionFromSource(source: SourceDTO, url: string): Attribution {
  const meta = source.metadata;
  switch (meta.type) {
    case 'CUSTOMER_STORY': {
      // Prefer "Name, Role at Company"; fall back through whatever pieces we have.
      const segments: string[] = [];
      if (source.author) segments.push(source.author);
      const tail: string[] = [];
      if (meta.customerRole) tail.push(meta.customerRole);
      if (meta.customerCompany) tail.push(`at ${meta.customerCompany}`);
      const tailText = tail.join(' ');
      if (segments.length > 0 && tailText) {
        return { label: `${segments[0]}, ${tailText}`, url };
      }
      if (segments.length > 0) {
        return { label: segments[0], url };
      }
      if (tailText) {
        return { label: tailText, url };
      }
      return { label: 'Customer story', url };
    }
    case 'REDDIT_POST':
    case 'REDDIT_COMMENT': {
      const subreddit = meta.subreddit;
      const username = source.author?.trim();
      if (username) {
        return { label: `u/${username} on r/${subreddit}`, url };
      }
      return { label: `Anonymous on r/${subreddit}`, url };
    }
    case 'OTHER_REVIEW': {
      return { label: meta.platform, url };
    }
    case 'THIRD_PARTY_REVIEW': {
      return { label: meta.reviewerName, url };
    }
    case 'TRUSTPILOT_REVIEW': {
      const author = source.author?.trim();
      return {
        label: author ? `${author} on Trustpilot` : 'Trustpilot review',
        url,
      };
    }
    case 'X_MENTION': {
      const author = source.author?.trim();
      return { label: author ? `@${author} on X` : 'X mention', url };
    }
  }
}

function attributionFromUrl(url: string, reliability: SourceReliability): Attribution {
  let host = '';
  try {
    host = new URL(url).host.toLowerCase().replace(/^www\./, '');
  } catch {
    return { label: reliabilityLabel(reliability), url };
  }

  if (host === 'reddit.com' || host.endsWith('.reddit.com')) {
    try {
      const path = new URL(url).pathname;
      const m = path.match(/\/r\/([^/]+)/);
      const subreddit = m ? m[1] : 'reddit';
      return { label: `Anonymous on r/${subreddit}`, url };
    } catch {
      return { label: 'Anonymous Reddit comment', url };
    }
  }

  const aggregator = AGGREGATOR_HOST_DISPLAY[host];
  if (aggregator) {
    return { label: `Review on ${aggregator}`, url };
  }

  return { label: `Third-party review (${host})`, url };
}

function reliabilityLabel(r: SourceReliability): string {
  switch (r) {
    case 'HIGH':
      return 'Customer story';
    case 'MEDIUM':
      return 'Third-party review';
    case 'LOW':
      return 'Anonymous source';
  }
}

// ============================================================
// Date formatting
// ============================================================

function formatDate(d: Date | string): string {
  const date = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`renderMemo: memo.generatedAt is not a valid date: ${String(d)}`);
  }
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}
