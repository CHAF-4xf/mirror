'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useState } from 'react';
import { COMPANY_URL_VALIDATION_ERROR } from '@/lib/run-url';

type PostRunsResponse =
  | { runId: string; status: string }
  | { error: string };

export function UrlInput() {
  const router = useRouter();
  const [urlInput, setUrlInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [focused, setFocused] = useState(false);

  const onAnalyze = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const res = await fetch('/api/runs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: urlInput }),
      });

      let data: PostRunsResponse;
      try {
        data = (await res.json()) as PostRunsResponse;
      } catch {
        setError('Something went wrong. Try again.');
        return;
      }

      if (!res.ok) {
        const serverError =
          data &&
          typeof data === 'object' &&
          'error' in data &&
          typeof (data as { error: unknown }).error === 'string'
            ? (data as { error: string }).error
            : null;
        setError(
          serverError ??
            (res.status === 400
              ? COMPANY_URL_VALIDATION_ERROR
              : 'Request failed. Try again.'),
        );
        return;
      }

      if (!('runId' in data) || typeof data.runId !== 'string') {
        setError('Unexpected response from server.');
        return;
      }

      router.push(`/memo/${data.runId}/watching`);
    } catch {
      setError('Network error. Check your connection and try again.');
    } finally {
      setLoading(false);
    }
  }, [router, urlInput]);

  return (
    <div style={{ maxWidth: 640 }}>
      <label
        className="small-caps"
        htmlFor="company-url"
        style={{ display: 'block', marginBottom: 8 }}
      >
        Company URL
      </label>
      <div
        onFocusCapture={() => setFocused(true)}
        onBlurCapture={() => setFocused(false)}
        style={{
          display: 'flex',
          alignItems: 'center',
          border: '1px solid var(--line-2)',
          borderRadius: 12,
          padding: 6,
          background: 'var(--paper)',
          boxShadow: focused ? '0 0 0 4px oklch(92% 0.02 70)' : 'none',
          transition: 'box-shadow 0.18s ease',
        }}
      >
        <span
          className="mono"
          style={{
            fontSize: 13,
            color: 'var(--muted)',
            padding: '0 10px 0 12px',
            whiteSpace: 'nowrap',
          }}
        >
          https://
        </span>
        <input
          id="company-url"
          type="text"
          placeholder="acme.com"
          value={urlInput}
          disabled={loading}
          onChange={(event) => {
            setUrlInput(event.target.value);
            setError(null);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !loading) {
              void onAnalyze();
            }
          }}
          style={{
            flex: 1,
            minWidth: 0,
            border: 0,
            outline: 0,
            background: 'transparent',
            padding: '14px 4px',
            fontSize: 17,
          }}
        />
        <button
          type="button"
          className="solid-btn"
          disabled={loading}
          onClick={() => {
            void onAnalyze();
          }}
          style={{
            padding: '10px 18px',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            whiteSpace: 'nowrap',
          }}
        >
          {loading ? 'Starting...' : 'Analyze'}
          <span aria-hidden>→</span>
        </button>
      </div>
      <div
        className="micro"
        style={{
          display: 'flex',
          gap: 8,
          alignItems: 'center',
          marginTop: 6,
        }}
      >
        <span>↵ to run</span>
        <span style={{ color: 'var(--muted-2)' }}>·</span>
        <span>~3–5 min · ~$0.50 / run</span>
      </div>
      {error ? (
        <p
          role="alert"
          style={{
            color: 'var(--accent)',
            fontSize: 13,
            lineHeight: 1.5,
            margin: '10px 0 0',
          }}
        >
          {error}
        </p>
      ) : null}
    </div>
  );
}
