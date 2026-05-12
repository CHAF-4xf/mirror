/**
 * One-off checks for company URL normalization + hostname rules.
 * `npx tsx scripts/verify-company-url-validation.ts`
 */
import {
  COMPANY_URL_VALIDATION_ERROR,
  isValidCompanyRunHostname,
  normalizeRunUrlInput,
} from '../lib/run-url';

function main(): void {
  const normalizeCases: Array<{
    label: string;
    input: string;
    expectOk: boolean;
  }> = [
    { label: 'foo', input: 'foo', expectOk: false },
    { label: 'https://foo', input: 'https://foo', expectOk: false },
    { label: 'localhost:3000', input: 'localhost:3000', expectOk: false },
    { label: 'example.com', input: 'example.com', expectOk: false },
    {
      label: 'https://highspot.com',
      input: 'https://highspot.com',
      expectOk: true,
    },
    { label: 'highspot.com (auto https)', input: 'highspot.com', expectOk: true },
    { label: 'empty string', input: '', expectOk: false },
    { label: 'IPv4', input: 'https://127.0.0.1', expectOk: false },
    { label: 'IPv4 public', input: 'https://8.8.8.8', expectOk: false },
    { label: 'TLD length 1', input: 'https://foo.c', expectOk: false },
  ];

  const hostnameCases: Array<{ hostname: string; ok: boolean }> = [
    { hostname: 'highspot.com', ok: true },
    { hostname: 'ab', ok: false },
    { hostname: 'foobar', ok: false },
    { hostname: '::1', ok: false },
    { hostname: '127.0.0.1', ok: false },
  ];

  let failed = 0;

  console.log(`API message (exact): ${JSON.stringify(COMPANY_URL_VALIDATION_ERROR)}\n`);

  for (const c of normalizeCases) {
    const got = normalizeRunUrlInput(c.input);
    const ok = got !== null;
    const pass = ok === c.expectOk;
    const status = pass ? 'PASS' : 'FAIL';
    if (!pass) failed += 1;
    console.log(
      `[${status}] normalize ${JSON.stringify(c.label)} input=${JSON.stringify(c.input)} → expected ${c.expectOk ? 'OK' : 'reject'}, got ${ok ? 'OK' : 'reject'}`,
    );
    if (ok && got) {
      console.log(`        companyDomain=${got.companyDomain} url=${got.url}`);
    }
  }

  for (const h of hostnameCases) {
    const ok = isValidCompanyRunHostname(h.hostname);
    const pass = ok === h.ok;
    const status = pass ? 'PASS' : 'FAIL';
    if (!pass) failed += 1;
    console.log(
      `[${status}] isValidCompanyRunHostname(${JSON.stringify(h.hostname)}) → expected ${h.ok}, got ${ok}`,
    );
  }

  if (failed > 0) {
    console.error(`\n${failed} assertion(s) failed.`);
    process.exit(1);
  }
  console.log('\nAll checks passed.');
}

main();
