import type {
  SourceDTO,
  ThemeCategory,
  ThemeDTO,
  VerbatimQuoteDTO,
} from '@/types';
import { computeWeightedConfidence } from '@/types';
import {
  EXTRACTION_PROMPT_VERSION,
  EXTRACTION_SYSTEM_PROMPT,
} from './prompts/extraction';
import { BaseAgent, type AgentStatusCallback, type ModelPricing } from './base';
import {
  normalizeForQuoteMatch,
  quoteAppearsIn,
  trySpliceRecovery,
} from './quote-verification';

const MODEL = 'claude-sonnet-4-6';
const PRICING: ModelPricing = { inputPerMTok: 3, outputPerMTok: 15 };

// Sonnet 4.6 has a 1M context window; we warn (don't fail) above 100k input
// tokens to keep cost and latency in a reasonable envelope. Approximation:
// ~4 chars per token works for English prose with mixed code/URLs in it.
const TOKEN_WARN_THRESHOLD = 100_000;
const APPROX_CHARS_PER_TOKEN = 4;

const MAX_OUTPUT_TOKENS = 16_384;

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

interface SubmitThemesToolInput {
  themes: ThemeDTO[];
}

export interface RejectedThemeDiagnostics {
  failingQuoteText: string;
  claimedSourceRef: string;
  claimedSourceFound: boolean;
  claimedSourceRawTextPreview: string;
  wordOverlapWithClaimedSource: number;
  foundInOtherSourceRefs: string[];
}

export interface RejectedTheme {
  category: string;
  statement: string;
  reason: string;
  diagnostics: RejectedThemeDiagnostics | null;
}

export interface SpliceRecord {
  themeStatement: string;
  sourceTemporaryRef: string;
  subSpanCount: number;
}

export interface ExtractionResult {
  themes: ThemeDTO[];
  rejected: RejectedTheme[];
  spliceLog: SpliceRecord[];
  costUsd: number;
  latencyMs: number;
  inputTokens: number;
  outputTokens: number;
  promptVersion: string;
}

export class ExtractorAgent extends BaseAgent {
  protected readonly logPrefix = '[agent:extractor]';

  constructor(opts: { onUpdate?: AgentStatusCallback } = {}) {
    super(opts);
  }

  async extract(sources: SourceDTO[]): Promise<ExtractionResult> {
    if (sources.length === 0) {
      this.emit({ stage: 'empty', message: 'No sources provided; returning empty themes.' });
      return emptyResult();
    }

    this.emit({
      stage: 'start',
      message: `Extracting themes from ${sources.length} source(s)`,
    });

    const userMessage = buildUserMessage(sources);
    const approxInputTokens = Math.ceil(userMessage.length / APPROX_CHARS_PER_TOKEN);
    if (approxInputTokens > TOKEN_WARN_THRESHOLD) {
      this.emit({
        stage: 'token_warning',
        message:
          `Estimated ~${approxInputTokens} input tokens, above ${TOKEN_WARN_THRESHOLD} ` +
          `threshold. Continuing — Sonnet 4.6 supports 1M context.`,
      });
    }

    const result = await this.callWithTool<SubmitThemesToolInput>({
      model: MODEL,
      systemPrompt: EXTRACTION_SYSTEM_PROMPT,
      userMessage,
      pricing: PRICING,
      maxTokens: MAX_OUTPUT_TOKENS,
      tool: {
        name: 'submit_themes',
        description:
          'Submit the extracted themes for the provided source material. Each theme must ' +
          'cite at least two verbatim quotes from at least two different sources.',
        inputSchema: buildSubmitThemesSchema(),
      },
    });

    const rawThemes = Array.isArray(result.output?.themes) ? result.output.themes : [];
    this.emit({
      stage: 'verify',
      message: `Verifying ${rawThemes.length} theme(s) against source rawText...`,
    });

    const verification = verifyAndNormalize(rawThemes, sources);

    for (const record of verification.spliceLog) {
      this.emit({
        stage: 'splice_recovery',
        message:
          `Theme "${record.themeStatement.slice(0, 60)}...": ` +
          `quote split into ${record.subSpanCount} contiguous sub-spans from source ${record.sourceTemporaryRef}`,
      });
    }

    this.emit({
      stage: 'complete',
      message:
        `${verification.accepted.length} accepted, ` +
        `${verification.rejected.length} rejected | ` +
        `cost $${result.costUsd.toFixed(4)} | ${result.latencyMs}ms`,
    });

    return {
      themes: verification.accepted,
      rejected: verification.rejected,
      spliceLog: verification.spliceLog,
      costUsd: result.costUsd,
      latencyMs: result.latencyMs,
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
      promptVersion: EXTRACTION_PROMPT_VERSION,
    };
  }
}

function emptyResult(): ExtractionResult {
  return {
    themes: [],
    rejected: [],
    spliceLog: [],
    costUsd: 0,
    latencyMs: 0,
    inputTokens: 0,
    outputTokens: 0,
    promptVersion: EXTRACTION_PROMPT_VERSION,
  };
}

function buildUserMessage(sources: SourceDTO[]): string {
  const lines: string[] = [];
  lines.push(`# Source Material (${sources.length} sources)`);
  lines.push('');
  for (const s of sources) {
    lines.push(`## Source ${s.temporaryRef}`);
    lines.push(`Type: ${s.type}`);
    lines.push(`Reliability: ${s.reliability}`);
    lines.push(`URL: ${s.url}`);
    if (s.title) lines.push(`Title: ${s.title}`);
    if (s.author) {
      const ctx = s.authorContext ? ` (${s.authorContext})` : '';
      lines.push(`Author: ${s.author}${ctx}`);
    }
    lines.push('');
    lines.push('---');
    lines.push(s.rawText);
    lines.push('---');
    lines.push('');
  }
  lines.push('# Task');
  lines.push(
    'Group the above sources into themes per the system instructions. ' +
      'Submit themes using the submit_themes tool. Do not include any text outside the tool call.',
  );
  return lines.join('\n');
}

function buildSubmitThemesSchema(): Record<string, unknown> {
  return {
    type: 'object',
    properties: {
      themes: {
        type: 'array',
        description: 'Extracted themes with verbatim quotes.',
        items: {
          type: 'object',
          properties: {
            category: {
              type: 'string',
              enum: THEME_CATEGORIES,
              description: 'Theme category.',
            },
            statement: {
              type: 'string',
              description:
                'Specific theme statement that passes the different-company test. ' +
                'Must name the specific product, customer type, workflow, or context.',
            },
            verbatimQuotes: {
              type: 'array',
              minItems: 2,
              description:
                'At least two quotes from at least two different sources. ' +
                'Each quote.text must be exact substring of the cited source.rawText.',
              items: {
                type: 'object',
                properties: {
                  text: {
                    type: 'string',
                    description: 'Exact verbatim text from the cited source.',
                  },
                  sourceTemporaryRef: {
                    type: 'string',
                    description: 'The temporaryRef of the cited source.',
                  },
                  sourceUrl: { type: 'string' },
                  sourceReliability: {
                    type: 'string',
                    enum: RELIABILITY_VALUES,
                  },
                },
                required: [
                  'text',
                  'sourceTemporaryRef',
                  'sourceUrl',
                  'sourceReliability',
                ],
              },
            },
            sourceCount: {
              type: 'integer',
              minimum: 2,
              description:
                'Count of distinct sources backing this theme. Will be recomputed on the server side from verbatimQuotes.',
            },
            weightedConfidence: {
              type: 'number',
              minimum: 0,
              maximum: 1,
              description:
                'Placeholder; will be recomputed on the server side from quote reliability tiers.',
            },
          },
          required: [
            'category',
            'statement',
            'verbatimQuotes',
            'sourceCount',
            'weightedConfidence',
          ],
        },
      },
    },
    required: ['themes'],
  };
}

interface VerificationOutcome {
  accepted: ThemeDTO[];
  rejected: RejectedTheme[];
  spliceLog: SpliceRecord[];
}

function verifyAndNormalize(
  themes: ThemeDTO[],
  sources: SourceDTO[],
): VerificationOutcome {
  const byRef = new Map<string, SourceDTO>();
  for (const s of sources) byRef.set(s.temporaryRef, s);

  const accepted: ThemeDTO[] = [];
  const rejected: RejectedTheme[] = [];
  const spliceLog: SpliceRecord[] = [];

  for (const t of themes) {
    const verdict = inspectTheme(t, byRef, sources);
    if (verdict.kind === 'reject') {
      rejected.push({
        category: t.category,
        statement: t.statement,
        reason: verdict.reason,
        diagnostics: verdict.diagnostics,
      });
      continue;
    }
    for (const record of verdict.spliceRecords) {
      spliceLog.push({
        themeStatement: t.statement,
        sourceTemporaryRef: record.sourceTemporaryRef,
        subSpanCount: record.subSpanCount,
      });
    }
    // Recompute server-canonical fields. The model's own values for sourceCount
    // and weightedConfidence are advisory only; we always overwrite to prevent
    // drift between claimed and actual numbers.
    //
    // NOTE: sourceCount is "number of distinct sources backing the theme", NOT
    // "number of quote rows". Splice recovery may turn one spliced quote into
    // N rows from the same source — sourceCount must not inflate.
    const uniqueRefs = new Set(
      verdict.quotes.map((q) => q.sourceTemporaryRef),
    );
    accepted.push({
      category: t.category,
      statement: t.statement,
      verbatimQuotes: verdict.quotes,
      sourceCount: uniqueRefs.size,
      weightedConfidence: computeWeightedConfidence(verdict.quotes),
    });
  }

  return { accepted, rejected, spliceLog };
}

interface SpliceDetail {
  sourceTemporaryRef: string;
  subSpanCount: number;
}

type ThemeVerdict =
  | {
      kind: 'accept';
      quotes: VerbatimQuoteDTO[];
      spliceRecords: SpliceDetail[];
    }
  | { kind: 'reject'; reason: string; diagnostics: RejectedThemeDiagnostics | null };

function inspectTheme(
  theme: ThemeDTO,
  byRef: Map<string, SourceDTO>,
  allSources: SourceDTO[],
): ThemeVerdict {
  if (!Array.isArray(theme.verbatimQuotes) || theme.verbatimQuotes.length < 2) {
    return { kind: 'reject', reason: 'theme has fewer than 2 quotes', diagnostics: null };
  }
  const distinctRefs = new Set(theme.verbatimQuotes.map((q) => q.sourceTemporaryRef));
  if (distinctRefs.size < 2) {
    return {
      kind: 'reject',
      reason: 'all quotes reference the same source',
      diagnostics: null,
    };
  }

  const acceptedQuotes: VerbatimQuoteDTO[] = [];
  const spliceRecords: SpliceDetail[] = [];

  for (const q of theme.verbatimQuotes) {
    const claimedSource = byRef.get(q.sourceTemporaryRef);
    if (!claimedSource) {
      return {
        kind: 'reject',
        reason: `quote references unknown sourceTemporaryRef "${q.sourceTemporaryRef}"`,
        diagnostics: buildDiagnostics(q, null, allSources),
      };
    }
    if (quoteAppearsIn(q, claimedSource)) {
      acceptedQuotes.push(q);
      continue;
    }
    // Splice recovery: maybe the model stitched 2+ non-contiguous spans from
    // this source into one apparent quote. If each span is itself a verbatim
    // substring of length >= MIN_SUB_SPAN_LEN, split into separate quote rows.
    const spans = trySpliceRecovery(q.text, claimedSource.rawText);
    if (spans !== null) {
      for (const span of spans) {
        acceptedQuotes.push({ ...q, text: span });
      }
      spliceRecords.push({
        sourceTemporaryRef: q.sourceTemporaryRef,
        subSpanCount: spans.length,
      });
      continue;
    }
    return {
      kind: 'reject',
      reason: `quote not found in source ${q.sourceTemporaryRef} rawText`,
      diagnostics: buildDiagnostics(q, claimedSource, allSources),
    };
  }

  // Splice recovery may have expanded one source's contribution into N rows
  // but cannot introduce a new source. Recheck distinct sources just to be
  // explicit about the invariant.
  const finalDistinctRefs = new Set(acceptedQuotes.map((q) => q.sourceTemporaryRef));
  if (finalDistinctRefs.size < 2) {
    return {
      kind: 'reject',
      reason: 'after verification, theme only has quotes from a single source',
      diagnostics: null,
    };
  }

  return { kind: 'accept', quotes: acceptedQuotes, spliceRecords };
}

function buildDiagnostics(
  q: VerbatimQuoteDTO,
  claimedSource: SourceDTO | null,
  allSources: SourceDTO[],
): RejectedThemeDiagnostics {
  const claimedPreview = claimedSource
    ? claimedSource.rawText.replace(/\s+/g, ' ').slice(0, 200)
    : '';
  const wordOverlap = claimedSource
    ? wordOverlapScore(q.text, claimedSource.rawText)
    : 0;
  const otherMatches: string[] = [];
  for (const s of allSources) {
    if (claimedSource && s.temporaryRef === claimedSource.temporaryRef) continue;
    if (quoteAppearsIn(q, s)) otherMatches.push(s.temporaryRef);
  }
  return {
    failingQuoteText: q.text,
    claimedSourceRef: q.sourceTemporaryRef,
    claimedSourceFound: claimedSource !== null,
    claimedSourceRawTextPreview: claimedPreview,
    wordOverlapWithClaimedSource: wordOverlap,
    foundInOtherSourceRefs: otherMatches,
  };
}

function wordOverlapScore(quote: string, sourceText: string): number {
  const quoteWords = tokenizeWords(quote);
  if (quoteWords.length === 0) return 0;
  const sourceWords = new Set(tokenizeWords(sourceText));
  const matched = quoteWords.filter((w) => sourceWords.has(w)).length;
  return matched / quoteWords.length;
}

function tokenizeWords(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]+/gu, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 2);
}

