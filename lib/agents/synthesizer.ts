import type {
  CoverageGrade,
  MemoDTO,
  SourceDTO,
  ThemeCategory,
  ThemeDTO,
  VerbatimQuoteDTO,
  SplitFinding,
} from '@/types';
import { gradeCoverage } from '@/types';
import {
  SYNTHESIS_PROMPT_VERSION,
  SYNTHESIS_SYSTEM_PROMPT,
} from './prompts/synthesis';
import { BaseAgent, type AgentStatusCallback, type ModelPricing } from './base';
import {
  verifyQuoteAgainst,
  type QuoteVerdict,
} from './quote-verification';

const MODEL = 'claude-opus-4-7';
const PRICING: ModelPricing = { inputPerMTok: 5, outputPerMTok: 25 };
const MAX_OUTPUT_TOKENS = 16_384;
const MAX_VERIFICATION_RETRIES = 2;

const THEME_CATEGORIES: ThemeCategory[] = [
  'JOB_TO_BE_DONE',
  'LOVE',
  'FRUSTRATION',
  'WISH',
  'CHURN_RISK',
  'COMPETITIVE_REFERENCE',
  'CONTRADICTION',
];

const RELIABILITY_VALUES = ['HIGH', 'MEDIUM', 'LOW'] as const;
const COVERAGE_GRADES: CoverageGrade[] = ['STRONG', 'MODERATE', 'THIN'];

// The fields we ask the model to produce. We inject generatedAt, promptVersion,
// and renderedMarkdown server-side (renderedMarkdown is the Renderer agent's
// job; we leave it empty here so consumers can detect the unrendered state).
type MemoModelOutput = Omit<MemoDTO, 'generatedAt' | 'promptVersion' | 'renderedMarkdown'>;

export interface CoverageStats {
  totalSources: number;
  customerStories: number;
  redditPosts: number;
  xMentions: number;
  reviews: number;
  externalSources: number;
  coverageGrade: CoverageGrade;
}

export interface SynthesisFailure {
  location: string;
  quoteText: string;
  claimedSourceRef: string;
  reason: string;
}

export interface SynthesisSpliceRecord {
  location: string;
  sourceTemporaryRef: string;
  subSpanCount: number;
}

export interface SynthesisResult {
  memo: MemoDTO;
  spliceLog: SynthesisSpliceRecord[];
  retryCount: number;
  totalCostUsd: number;
  totalLatencyMs: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  promptVersion: string;
  falsifiabilityWarning: boolean;
}

export interface SynthesizeInput {
  companyName: string;
  companyUrl: string;
  themes: ThemeDTO[];
  sources: SourceDTO[];
}

export class SynthesizerAgent extends BaseAgent {
  protected readonly logPrefix = '[agent:synthesizer]';

  constructor(opts: { onUpdate?: AgentStatusCallback } = {}) {
    super(opts);
  }

  async synthesize(input: SynthesizeInput): Promise<SynthesisResult> {
    const { companyName, companyUrl, themes, sources } = input;
    if (sources.length === 0) {
      throw new Error('Cannot synthesize a memo with zero sources');
    }
    if (themes.length === 0) {
      throw new Error('Cannot synthesize a memo with zero extracted themes');
    }

    this.emit({
      stage: 'start',
      message:
        `Synthesizing memo for ${companyName} ` +
        `from ${themes.length} theme(s) and ${sources.length} source(s)`,
    });

    const coverage = computeSourceCoverage(sources);
    this.emit({
      stage: 'coverage',
      message:
        `${coverage.totalSources} sources ` +
        `(${coverage.customerStories} customer stories, ` +
        `${coverage.redditPosts} reddit, ` +
        `${coverage.xMentions} x, ` +
        `${coverage.reviews} reviews) ` +
        `-> ${coverage.coverageGrade}`,
    });

    const byRef = new Map<string, SourceDTO>();
    for (const s of sources) byRef.set(s.temporaryRef, s);

    const baseUserMessage = buildUserMessage({ companyName, companyUrl, themes, sources, coverage });

    let totalCostUsd = 0;
    let totalLatencyMs = 0;
    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let lastFailures: SynthesisFailure[] = [];
    let attempt = 0;

    while (true) {
      const userMessage =
        attempt === 0
          ? baseUserMessage
          : `${baseUserMessage}\n\n${formatRetryFeedback(lastFailures)}`;

      this.emit({
        stage: attempt === 0 ? 'call' : 'retry',
        message:
          attempt === 0
            ? `Attempt ${attempt + 1} / ${MAX_VERIFICATION_RETRIES + 1}`
            : `Retry attempt ${attempt + 1} / ${MAX_VERIFICATION_RETRIES + 1} ` +
              `with feedback on ${lastFailures.length} unverified quote(s)`,
      });

      const result = await this.callWithTool<MemoModelOutput>({
        model: MODEL,
        systemPrompt: SYNTHESIS_SYSTEM_PROMPT,
        userMessage,
        pricing: PRICING,
        maxTokens: MAX_OUTPUT_TOKENS,
        tool: {
          name: 'submit_memo',
          description:
            'Submit the final customer voice memo for the company. Every verbatim ' +
            'quote must be exact text from one of the provided sources. The ' +
            'sourceTemporaryRef on each quote must match an existing source.',
          inputSchema: buildSubmitMemoSchema(),
        },
      });

      totalCostUsd += result.costUsd;
      totalLatencyMs += result.latencyMs;
      totalInputTokens += result.inputTokens;
      totalOutputTokens += result.outputTokens;

      const verification = verifyMemoQuotes(result.output, byRef);
      this.emit({
        stage: 'verify',
        message:
          `Attempt ${attempt + 1}: ${verification.spliceLog.length} spliced, ` +
          `${verification.failures.length} unverified`,
      });

      if (verification.failures.length === 0) {
        const memo = finalizeMemo({
          modelOutput: verification.processedOutput,
          companyName,
          coverage,
        });
        const falsifiabilityWarning = memo.dominantPattern.falsifiabilityCheck === 'GENERIC';
        if (falsifiabilityWarning) {
          this.emit({
            stage: 'falsifiability_warning',
            message:
              'Model self-flagged dominantPattern as GENERIC; accepting memo but logging warning',
          });
        }
        for (const r of verification.spliceLog) {
          this.emit({
            stage: 'splice_recovery',
            message:
              `${r.location}: quote split into ${r.subSpanCount} contiguous sub-spans ` +
              `from source ${r.sourceTemporaryRef}`,
          });
        }
        this.emit({
          stage: 'complete',
          message:
            `Memo accepted on attempt ${attempt + 1} | ` +
            `cost $${totalCostUsd.toFixed(4)} | ${totalLatencyMs}ms`,
        });
        return {
          memo,
          spliceLog: verification.spliceLog,
          retryCount: attempt,
          totalCostUsd,
          totalLatencyMs,
          totalInputTokens,
          totalOutputTokens,
          promptVersion: SYNTHESIS_PROMPT_VERSION,
          falsifiabilityWarning,
        };
      }

      lastFailures = verification.failures;
      attempt += 1;
      if (attempt > MAX_VERIFICATION_RETRIES) {
        throw new MemoVerificationError(
          `Memo verification failed after ${MAX_VERIFICATION_RETRIES + 1} attempts. ` +
            `${lastFailures.length} quote(s) could not be verified against any source.`,
          lastFailures,
        );
      }
    }
  }
}

export class MemoVerificationError extends Error {
  readonly failures: SynthesisFailure[];
  constructor(message: string, failures: SynthesisFailure[]) {
    super(message);
    this.name = 'MemoVerificationError';
    this.failures = failures;
  }
}

// ============================================================
// Source coverage computation
// ============================================================

export function computeSourceCoverage(sources: SourceDTO[]): CoverageStats {
  let customerStories = 0;
  let redditPosts = 0;
  let xMentions = 0;
  let reviews = 0;

  for (const s of sources) {
    switch (s.type) {
      case 'CUSTOMER_STORY':
        customerStories += 1;
        break;
      case 'REDDIT_POST':
      case 'REDDIT_COMMENT':
        redditPosts += 1;
        break;
      case 'X_MENTION':
        xMentions += 1;
        break;
      case 'TRUSTPILOT_REVIEW':
      case 'OTHER_REVIEW':
      case 'THIRD_PARTY_REVIEW':
        reviews += 1;
        break;
    }
  }
  const totalSources = sources.length;
  const externalSources = totalSources - customerStories;
  const coverageGrade = gradeCoverage({ totalSources, customerStories, externalSources });
  return {
    totalSources,
    customerStories,
    redditPosts,
    xMentions,
    reviews,
    externalSources,
    coverageGrade,
  };
}

// ============================================================
// User message construction
// ============================================================

function buildUserMessage(args: {
  companyName: string;
  companyUrl: string;
  themes: ThemeDTO[];
  sources: SourceDTO[];
  coverage: CoverageStats;
}): string {
  const { companyName, companyUrl, themes, sources, coverage } = args;
  const lines: string[] = [];

  lines.push('# Company');
  lines.push(`Name: ${companyName}`);
  lines.push(`URL: ${companyUrl}`);
  lines.push('');

  lines.push('# Source Coverage Statistics');
  lines.push(`Total sources: ${coverage.totalSources}`);
  lines.push(`Customer stories (HIGH reliability): ${coverage.customerStories}`);
  lines.push(`Reddit posts and comments (LOW reliability): ${coverage.redditPosts}`);
  lines.push(`X mentions (LOW reliability): ${coverage.xMentions}`);
  lines.push(`Third-party reviews (MEDIUM reliability): ${coverage.reviews}`);
  lines.push(`Coverage grade: ${coverage.coverageGrade}`);
  lines.push('');

  lines.push(`# Extracted Themes (${themes.length})`);
  lines.push('');
  for (const [i, t] of themes.entries()) {
    lines.push(`## Theme ${i + 1} — ${t.category}`);
    lines.push(
      `sourceCount: ${t.sourceCount} | weightedConfidence: ${t.weightedConfidence.toFixed(2)}`,
    );
    lines.push(`Statement: ${t.statement}`);
    lines.push('Quotes:');
    for (const q of t.verbatimQuotes) {
      const single = q.text.replace(/\s+/g, ' ').trim();
      lines.push(
        `  - [${q.sourceTemporaryRef} ${q.sourceReliability}] "${single}"`,
      );
    }
    lines.push('');
  }

  lines.push(`# Source Material (${sources.length})`);
  lines.push('');
  for (const s of sources) {
    lines.push(`## Source ${s.temporaryRef} (${s.type}, ${s.reliability})`);
    lines.push(`URL: ${s.url}`);
    if (s.title) lines.push(`Title: ${s.title}`);
    if (s.author) {
      const ctx = s.authorContext ? ` (${s.authorContext})` : '';
      lines.push(`Author: ${s.author}${ctx}`);
    }
    lines.push('---');
    lines.push(s.rawText);
    lines.push('---');
    lines.push('');
  }

  lines.push('# Task');
  lines.push(
    `Produce the customer voice memo for ${companyName} per the system ` +
      'instructions. Use the submit_memo tool. Every quote you include in ' +
      'the memo must be exact verbatim text from one of the sources above ' +
      '(no paraphrasing, no stitching across paragraphs).',
  );

  return lines.join('\n');
}

function formatRetryFeedback(failures: SynthesisFailure[]): string {
  const lines: string[] = [];
  lines.push('# Verification feedback from previous attempt');
  lines.push(
    'Your previous output contained quotes that could not be verified against ' +
      'any source rawText. They are listed below. Please regenerate the memo ' +
      'and ensure every verbatim quote is an exact, contiguous substring of ' +
      'the cited source. Do not stitch sentences from different paragraphs.',
  );
  lines.push('');
  for (const [i, f] of failures.entries()) {
    const truncated = f.quoteText.length > 200
      ? `${f.quoteText.slice(0, 200)}...`
      : f.quoteText;
    lines.push(`${i + 1}. location=${f.location} claimedSource=${f.claimedSourceRef}`);
    lines.push(`   quote: "${truncated.replace(/\s+/g, ' ').trim()}"`);
    lines.push(`   reason: ${f.reason}`);
  }
  return lines.join('\n');
}

// ============================================================
// Tool schema
// ============================================================

function buildSubmitMemoSchema(): Record<string, unknown> {
  return {
    type: 'object',
    properties: {
      companyName: { type: 'string' },
      jobToBeDone: {
        type: 'object',
        description:
          'The customer-grounded job to be done. Must be specific to this product and pass the different-company test.',
        properties: {
          statement: { type: 'string' },
          rationale: {
            type: 'string',
            description:
              'Why the data supports this JTBD framing. Names the recurring customer language patterns.',
          },
          supportingQuotes: {
            type: 'array',
            minItems: 2,
            items: quoteSchema(),
          },
        },
        required: ['statement', 'rationale', 'supportingQuotes'],
      },
      whatTheyLove: sectionSchema(),
      whatFrustrates: sectionSchema(),
      whatTheyWish: sectionSchema(),
      contradictions: sectionSchema(),
      dominantPattern: {
        type: 'object',
        description: 'The most-cited observable pattern across themes.',
        properties: {
          statement: { type: 'string' },
          elaboration: { type: 'string' },
          falsifiability: {
            type: 'string',
            description: 'What evidence would refute this pattern.',
          },
          falsifiabilityCheck: {
            type: 'string',
            enum: ['SPECIFIC', 'GENERIC'],
            description:
              'SPECIFIC if the pattern names something falsifiable; GENERIC if it could apply to any SaaS.',
          },
        },
        required: ['statement', 'elaboration', 'falsifiability', 'falsifiabilityCheck'],
      },
      splitFindings: {
        type: 'array',
        description:
          'Split findings for themes with material counter-signal meeting the threshold. Empty array when no split qualifies.',
        items: splitFindingSchema(),
      },
      sourceCoverage: {
        type: 'object',
        description:
          'Source coverage stats. Will be overwritten server-side from the actual sources passed in.',
        properties: {
          totalSources: { type: 'integer' },
          customerStories: { type: 'integer' },
          redditPosts: { type: 'integer' },
          xMentions: { type: 'integer' },
          reviews: { type: 'integer' },
          coverageGrade: { type: 'string', enum: COVERAGE_GRADES },
          limitations: {
            type: 'array',
            description:
              'Honest notes about what the coverage cannot determine (e.g. "no enterprise-tier customers represented", "all signal from MSP segment only").',
            items: { type: 'string' },
          },
        },
        required: [
          'totalSources',
          'customerStories',
          'redditPosts',
          'xMentions',
          'reviews',
          'coverageGrade',
          'limitations',
        ],
      },
    },
    required: [
      'companyName',
      'jobToBeDone',
      'whatTheyLove',
      'whatFrustrates',
      'whatTheyWish',
      'contradictions',
      'dominantPattern',
      'splitFindings',
      'sourceCoverage',
    ],
  };
}

function splitFindingSchema(): Record<string, unknown> {
  return {
    type: 'object',
    description:
      'A materially unresolved customer-voice split. Use only when both sides are supported by verbatim quotes and the counter-signal threshold is met.',
    properties: {
      theme: {
        type: 'string',
        description: 'The theme where customer voice materially splits.',
      },
      pattern_a: splitPatternSchema(),
      pattern_b: splitPatternSchema(),
      why_unresolved: {
        type: 'string',
        description:
          'Max 30 words. Must name the specific, resolvable question that would let one side win.',
      },
      tier_note: {
        anyOf: [{ type: 'string' }, { type: 'null' }],
        description:
          'Use only to acknowledge relevant LOW-tier dissent; LOW-tier dissent alone must not trigger a split.',
      },
    },
    required: ['theme', 'pattern_a', 'pattern_b', 'why_unresolved', 'tier_note'],
  };
}

function splitPatternSchema(): Record<string, unknown> {
  return {
    type: 'object',
    properties: {
      claim: { type: 'string' },
      supporting_quotes: {
        type: 'array',
        minItems: 2,
        items: quoteSchema(),
      },
    },
    required: ['claim', 'supporting_quotes'],
  };
}

function sectionSchema(): Record<string, unknown> {
  return {
    type: 'object',
    description:
      'A memo section: zero or more themes (drawn from the extracted ThemeDTO[]) plus a narrative summary.',
    properties: {
      themes: {
        type: 'array',
        items: themeSchema(),
      },
      summary: {
        type: 'string',
        description:
          'A 1-3 sentence synthesis of this section. Must pass the different-company test.',
      },
    },
    required: ['themes', 'summary'],
  };
}

function themeSchema(): Record<string, unknown> {
  return {
    type: 'object',
    properties: {
      category: { type: 'string', enum: THEME_CATEGORIES },
      statement: { type: 'string' },
      verbatimQuotes: {
        type: 'array',
        minItems: 2,
        items: quoteSchema(),
      },
      sourceCount: { type: 'integer', minimum: 2 },
      weightedConfidence: { type: 'number', minimum: 0, maximum: 1 },
    },
    required: ['category', 'statement', 'verbatimQuotes', 'sourceCount', 'weightedConfidence'],
  };
}

function quoteSchema(): Record<string, unknown> {
  return {
    type: 'object',
    properties: {
      text: {
        type: 'string',
        description: 'Exact verbatim text from the cited source rawText.',
      },
      sourceTemporaryRef: {
        type: 'string',
        description: 'temporaryRef of the source this quote comes from.',
      },
      sourceUrl: { type: 'string' },
      sourceReliability: { type: 'string', enum: RELIABILITY_VALUES },
    },
    required: ['text', 'sourceTemporaryRef', 'sourceUrl', 'sourceReliability'],
  };
}

// ============================================================
// Memo-level verification (across all quote-bearing fields)
// ============================================================

interface MemoVerificationOutcome {
  processedOutput: MemoModelOutput;
  failures: SynthesisFailure[];
  spliceLog: SynthesisSpliceRecord[];
}

function verifyMemoQuotes(
  modelOutput: MemoModelOutput,
  byRef: Map<string, SourceDTO>,
): MemoVerificationOutcome {
  const failures: SynthesisFailure[] = [];
  const spliceLog: SynthesisSpliceRecord[] = [];

  // jobToBeDone.supportingQuotes
  const processedJtbdQuotes = processQuoteList(
    modelOutput.jobToBeDone.supportingQuotes,
    byRef,
    'jobToBeDone.supportingQuotes',
    failures,
    spliceLog,
  );

  const processedSections: Record<
    'whatTheyLove' | 'whatFrustrates' | 'whatTheyWish' | 'contradictions',
    typeof modelOutput.whatTheyLove
  > = {
    whatTheyLove: processSection(modelOutput.whatTheyLove, 'whatTheyLove', byRef, failures, spliceLog),
    whatFrustrates: processSection(modelOutput.whatFrustrates, 'whatFrustrates', byRef, failures, spliceLog),
    whatTheyWish: processSection(modelOutput.whatTheyWish, 'whatTheyWish', byRef, failures, spliceLog),
    contradictions: processSection(modelOutput.contradictions, 'contradictions', byRef, failures, spliceLog),
  };

  const processedSplitFindings = processSplitFindings(
    modelOutput.splitFindings ?? [],
    byRef,
    failures,
    spliceLog,
  );

  const processedOutput: MemoModelOutput = {
    ...modelOutput,
    jobToBeDone: {
      ...modelOutput.jobToBeDone,
      supportingQuotes: processedJtbdQuotes,
    },
    whatTheyLove: processedSections.whatTheyLove,
    whatFrustrates: processedSections.whatFrustrates,
    whatTheyWish: processedSections.whatTheyWish,
    contradictions: processedSections.contradictions,
    splitFindings: processedSplitFindings,
  };

  return { processedOutput, failures, spliceLog };
}

function processSplitFindings(
  splitFindings: SplitFinding[],
  byRef: Map<string, SourceDTO>,
  failures: SynthesisFailure[],
  spliceLog: SynthesisSpliceRecord[],
): SplitFinding[] {
  const processed: SplitFinding[] = [];
  for (const [idx, split] of splitFindings.entries()) {
    const base = `splitFindings[${idx}](${split.theme})`;
    const next = {
      ...split,
      pattern_a: {
        ...split.pattern_a,
        supporting_quotes: processQuoteList(
          split.pattern_a.supporting_quotes,
          byRef,
          `${base}.pattern_a.supporting_quotes`,
          failures,
          spliceLog,
        ),
      },
      pattern_b: {
        ...split.pattern_b,
        supporting_quotes: processQuoteList(
          split.pattern_b.supporting_quotes,
          byRef,
          `${base}.pattern_b.supporting_quotes`,
          failures,
          spliceLog,
        ),
      },
    };

    if (isValidSplitFinding(next)) {
      processed.push(next);
    }
  }
  return processed;
}

function isValidSplitFinding(split: SplitFinding): boolean {
  if (countWords(split.why_unresolved) > 30) {
    return false;
  }
  if (isGenericWhyUnresolved(split.why_unresolved)) {
    return false;
  }
  return (
    hasEnoughMediumPlusSources(split.pattern_a.supporting_quotes) &&
    hasEnoughMediumPlusSources(split.pattern_b.supporting_quotes)
  );
}

function hasEnoughMediumPlusSources(quotes: VerbatimQuoteDTO[]): boolean {
  const mediumPlusSourceRefs = new Set<string>();
  for (const q of quotes) {
    if (q.sourceReliability === 'HIGH' || q.sourceReliability === 'MEDIUM') {
      mediumPlusSourceRefs.add(q.sourceTemporaryRef);
    }
  }
  return mediumPlusSourceRefs.size >= 2;
}

function countWords(s: string): number {
  return s.trim().split(/\s+/).filter((part: string) => part.length > 0).length;
}

function isGenericWhyUnresolved(s: string): boolean {
  const lower = s.toLowerCase();
  return (
    lower.includes('more research needed') ||
    lower.includes('more data needed') ||
    lower === 'whether onboarding helps'
  );
}

function processSection(
  section: { themes: ThemeDTO[]; summary: string },
  sectionName: string,
  byRef: Map<string, SourceDTO>,
  failures: SynthesisFailure[],
  spliceLog: SynthesisSpliceRecord[],
): { themes: ThemeDTO[]; summary: string } {
  const processedThemes: ThemeDTO[] = section.themes.map<ThemeDTO>(
    (theme: ThemeDTO, idx: number) => {
      const location = `${sectionName}.themes[${idx}](${theme.category})`;
      const processedQuotes = processQuoteList(
        theme.verbatimQuotes,
        byRef,
        location,
        failures,
        spliceLog,
      );
      return {
        ...theme,
        verbatimQuotes: processedQuotes,
      };
    },
  );
  return { themes: processedThemes, summary: section.summary };
}

function processQuoteList(
  quotes: VerbatimQuoteDTO[],
  byRef: Map<string, SourceDTO>,
  location: string,
  failures: SynthesisFailure[],
  spliceLog: SynthesisSpliceRecord[],
): VerbatimQuoteDTO[] {
  const out: VerbatimQuoteDTO[] = [];
  for (const q of quotes) {
    const verdict: QuoteVerdict = verifyQuoteAgainst(q, byRef);
    if (verdict.kind === 'ok') {
      out.push(q);
    } else if (verdict.kind === 'spliced') {
      for (const span of verdict.subSpans) {
        out.push({ ...q, text: span });
      }
      spliceLog.push({
        location,
        sourceTemporaryRef: q.sourceTemporaryRef,
        subSpanCount: verdict.subSpans.length,
      });
    } else {
      failures.push({
        location,
        quoteText: q.text,
        claimedSourceRef: q.sourceTemporaryRef,
        reason: verdict.reason,
      });
      // Keep the quote in `out` for the retry path so the model can see it
      // in context — we'll only finalize the memo if there are zero failures.
      out.push(q);
    }
  }
  return out;
}

// ============================================================
// Finalization (server-canonical overrides)
// ============================================================

function finalizeMemo(args: {
  modelOutput: MemoModelOutput;
  companyName: string;
  coverage: CoverageStats;
}): MemoDTO {
  const { modelOutput, companyName, coverage } = args;

  // Always trust our authoritative companyName and sourceCoverage over the
  // model's (the user message gives the model these numbers, but we still
  // overwrite in case it transcribed wrong).
  return {
    companyName,
    generatedAt: new Date(),
    promptVersion: SYNTHESIS_PROMPT_VERSION,
    jobToBeDone: modelOutput.jobToBeDone,
    whatTheyLove: modelOutput.whatTheyLove,
    whatFrustrates: modelOutput.whatFrustrates,
    whatTheyWish: modelOutput.whatTheyWish,
    contradictions: modelOutput.contradictions,
    dominantPattern: modelOutput.dominantPattern,
    splitFindings: Array.isArray(modelOutput.splitFindings)
      ? modelOutput.splitFindings
      : [],
    sourceCoverage: {
      totalSources: coverage.totalSources,
      customerStories: coverage.customerStories,
      redditPosts: coverage.redditPosts,
      xMentions: coverage.xMentions,
      reviews: coverage.reviews,
      coverageGrade: coverage.coverageGrade,
      // Model's `limitations` notes are kept; they are the only field in
      // sourceCoverage that requires editorial judgment.
      limitations: Array.isArray(modelOutput.sourceCoverage?.limitations)
        ? modelOutput.sourceCoverage.limitations
        : [],
    },
    // The Renderer agent will populate this. Leaving empty signals "unrendered".
    renderedMarkdown: '',
  };
}
