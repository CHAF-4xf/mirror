import type { SourceDTO, VerbatimQuoteDTO } from '@/types';

export const MIN_SUB_SPAN_CHARS = 40;

/**
 * Normalize text before substring comparison.
 *
 * Applied SYMMETRICALLY to the quote text and the source rawText. Symmetry
 * means even if a regex is imperfect (e.g. greedy on a markdown link with
 * parens-in-URL), it strips the same way on both sides, so substring match
 * still works.
 *
 * Wrappers handled:
 *   - Markdown bold/italic (`**X**`, `__X__`, `*X*`, `_X_`)
 *   - Markdown inline + reference links (`[label](url)`, `[label][ref]`)
 *   - Markdown bullets / numbered / heading line-starts
 *   - HTML entities (`&quot;`, `&amp;`, etc.)
 *   - Reddit-style backslash escapes (`automation\_engine`)
 *   - Smart quotes / dashes normalized to ASCII
 *   - Whitespace collapsed, lowercased
 */
export function normalizeForQuoteMatch(s: string): string {
  let result = s;

  result = decodeHtmlEntities(result);

  // Reddit backslash-escapes punctuation in markdown. Strip BEFORE the link
  // regex so that escaped brackets don't confuse it.
  result = result.replace(/\\([_*[\]()~`#+\-.!])/g, '$1');

  // Reference-style link definitions on their own line: "[1]: https://..."
  result = result.replace(/^\s*\[[^\]]+\]:\s*\S+.*$/gm, '');

  // Inline markdown links: "[label](url)" -> "label". Supports a single level
  // of balanced parens inside the URL (covers Wikipedia-style links).
  result = result.replace(
    /\[([^[\]\n]*)\]\(([^()\n]*(?:\([^()\n]*\)[^()\n]*)*)\)/g,
    '$1',
  );

  // Reference-style usage: "[label][ref]" -> "label"
  result = result.replace(/\[([^[\]\n]+)\]\[[^[\]\n]*\]/g, '$1');

  // Markdown bold/italic. Paired forms first, then orphan word-boundary forms.
  result = result.replace(/\*\*\*([\s\S]+?)\*\*\*/g, '$1');
  result = result.replace(/___([\s\S]+?)___/g, '$1');
  result = result.replace(/\*\*([\s\S]+?)\*\*/g, '$1');
  result = result.replace(/__([\s\S]+?)__/g, '$1');
  result = result.replace(/(?<!\w)\*([^*\n]+)\*(?!\w)/g, '$1');
  result = result.replace(/(?<!\w)_([^_\n]+)_(?!\w)/g, '$1');

  // Bullet list markers, numbered list markers, headings (line-start only).
  result = result.replace(/^\s*[*\-+]\s+/gm, '');
  result = result.replace(/^\s*\d+\.\s+/gm, '');
  result = result.replace(/^\s*#+\s+/gm, '');

  // Smart quotes/dashes -> ASCII equivalents.
  result = result.replace(/[\u201C\u201D\u00AB\u00BB]/g, '"');
  result = result.replace(/[\u2018\u2019\u2032]/g, "'");

  // Collapse whitespace and lowercase last.
  result = result.replace(/\s+/g, ' ').trim().toLowerCase();

  return result;
}

export function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&hellip;/g, '…')
    .replace(/&mdash;/g, '—')
    .replace(/&ndash;/g, '–')
    .replace(/&amp;/g, '&');
}

export function quoteAppearsIn(q: VerbatimQuoteDTO, src: SourceDTO): boolean {
  const haystack = normalizeForQuoteMatch(src.rawText);
  const needle = normalizeForQuoteMatch(q.text);
  if (!needle) return false;
  return haystack.includes(needle);
}

/**
 * Try to recover a spliced quote: a string the model formed by stitching N
 * non-contiguous spans from the same source, typically joined by `\s{2,}`
 * (the model's stand-in for a paragraph break that didn't actually exist
 * in its own output).
 *
 * Algorithm: split the quote on whitespace runs of 2+ chars / newlines, then
 * greedily extend each fragment with adjacent ones if the combined form is
 * still a contiguous substring of the source. Each final span must be at
 * least MIN_SUB_SPAN_CHARS chars after normalization to avoid accepting
 * accidental coincidences on short fragments.
 *
 * Returns the list of recovered spans (original text, not normalized), or
 * null if the quote cannot be decomposed.
 */
export function trySpliceRecovery(
  quoteText: string,
  sourceText: string,
): string[] | null {
  const fragments = quoteText
    .split(/\s{2,}|\n+/)
    .map((s: string) => s.trim())
    .filter((s: string) => s.length > 0);
  if (fragments.length < 2) return null;

  const normalizedSource = normalizeForQuoteMatch(sourceText);

  const spans: string[] = [];
  let i = 0;
  while (i < fragments.length) {
    let current = fragments[i];
    const currentNorm = normalizeForQuoteMatch(current);
    if (currentNorm.length < MIN_SUB_SPAN_CHARS) return null;
    if (!normalizedSource.includes(currentNorm)) return null;

    let j = i + 1;
    while (j < fragments.length) {
      const candidate = `${current} ${fragments[j]}`;
      if (normalizedSource.includes(normalizeForQuoteMatch(candidate))) {
        current = candidate;
        j += 1;
      } else {
        break;
      }
    }
    spans.push(current);
    i = j;
  }

  return spans.length >= 2 ? spans : null;
}

/**
 * Single-quote verification verdict. Used by extractor (theme-level) and
 * synthesizer (memo-section-level) to apply the same accept/splice/fail logic.
 */
export type QuoteVerdict =
  | { kind: 'ok' }
  | { kind: 'spliced'; subSpans: string[] }
  | { kind: 'fail'; reason: string };

export function verifyQuoteAgainst(
  q: VerbatimQuoteDTO,
  byRef: Map<string, SourceDTO>,
): QuoteVerdict {
  const src = byRef.get(q.sourceTemporaryRef);
  if (!src) {
    return {
      kind: 'fail',
      reason: `quote references unknown sourceTemporaryRef "${q.sourceTemporaryRef}"`,
    };
  }
  if (quoteAppearsIn(q, src)) return { kind: 'ok' };
  const spans = trySpliceRecovery(q.text, src.rawText);
  if (spans !== null) return { kind: 'spliced', subSpans: spans };
  return {
    kind: 'fail',
    reason: `quote text not found as contiguous span in source ${q.sourceTemporaryRef} rawText`,
  };
}
