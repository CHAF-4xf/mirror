import type { VerbatimQuoteDTO } from '@/types';

// Renders verbatim quotes with available attribution from MemoDTO quote records.
export function QuoteStack({ quotes }: { quotes: VerbatimQuoteDTO[] }) {
  if (!quotes || quotes.length === 0) return null;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, margin: '20px 0' }}>
      {quotes.map((q: VerbatimQuoteDTO, i: number) => (
        <div key={`${q.sourceTemporaryRef}-${i}`} style={{
          paddingLeft: 20,
          borderLeft: '2px solid var(--line-2)',
        }}>
          <div className="serif" style={{
            fontSize: 17,
            lineHeight: 1.5,
            fontStyle: 'italic',
            color: 'var(--ink)',
            marginBottom: 8,
          }}>
            &ldquo;{q.text}&rdquo;
          </div>
          <div className="mono" style={{
            fontSize: 11,
            color: 'var(--muted)',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            flexWrap: 'wrap',
          }}>
            <span style={{ color: 'var(--ink-2)' }}>{q.sourceReliability}</span>
            {q.sourceUrl ? (
              <>
                <span>·</span>
                <a href={q.sourceUrl} target="_blank" rel="noopener" style={{ color: 'var(--info)' }}>
                  source
                </a>
              </>
            ) : null}
          </div>
        </div>
      ))}
    </div>
  );
}
