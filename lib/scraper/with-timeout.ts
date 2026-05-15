/**
 * Runs `fn()` but resolves with `fallback` if it does not complete within `ms`.
 * Does not abort the underlying work — callers should rely on inner timeouts /
 * teardown (e.g. Playwright finally) where possible.
 */
export async function withTimeout<T>(
  fn: () => Promise<T>,
  ms: number,
  fallback: T,
  logPrefix: string,
  label: string,
): Promise<T> {
  return Promise.race([
    fn(),
    new Promise<T>((resolve) => {
      setTimeout(() => {
        console.warn(
          `${logPrefix} ${label} exceeded ${ms}ms — using fallback`,
        );
        resolve(fallback);
      }, ms);
    }),
  ]);
}
