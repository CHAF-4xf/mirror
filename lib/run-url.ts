/**
 * Message returned by POST /api/runs when the URL fails company-site rules.
 * (Example hostname in the hint is illustrative; example.* domains are blocked.)
 */
export const COMPANY_URL_VALIDATION_ERROR =
  "Please enter a valid company URL (e.g., 'https://example.com')";

const BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "example.com",
  "example.org",
  "example.net",
]);

/**
 * Applies company-URL hostname rules after a successful URL parse and www strip.
 * Does not mutate the hostname.
 */
export function isValidCompanyRunHostname(hostname: string): boolean {
  const host = hostname.trim().toLowerCase();
  if (host.length < 4) {
    return false;
  }
  if (!host.includes(".")) {
    return false;
  }
  const tld = host.slice(host.lastIndexOf(".") + 1);
  if (tld.length < 2) {
    return false;
  }
  if (BLOCKED_HOSTNAMES.has(host)) {
    return false;
  }
  if (isProbablyIpv4Hostname(host)) {
    return false;
  }
  if (host.includes(":")) {
    // IPv6 literals (WHATWG URLs expose ::1-style hostnames without brackets)
    return false;
  }
  return true;
}

function isProbablyIpv4Hostname(hostname: string): boolean {
  const parts = hostname.split(".");
  if (parts.length !== 4) {
    return false;
  }
  return parts.every((part: string) => {
    if (!/^\d{1,3}$/.test(part)) {
      return false;
    }
    const n = Number(part);
    return n >= 0 && n <= 255;
  });
}

/**
 * Parse and normalize a submitted URL string for Run creation.
 * Returns null when the URL is not parseable or violates company-site rules.
 */
export function normalizeRunUrlInput(raw: string): {
  url: string;
  companyDomain: string;
} | null {
  const trimmed = raw.trim();
  if (!trimmed) {
    return null;
  }

  try {
    const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)
      ? trimmed
      : `https://${trimmed}`;
    const parsed = new URL(withScheme);
    let host = parsed.hostname.trim().toLowerCase();
    host = host.replace(/^www\./i, "");
    if (!host) {
      return null;
    }
    if (!isValidCompanyRunHostname(host)) {
      return null;
    }

    const url = `${parsed.origin}${parsed.pathname}${parsed.search}${parsed.hash}`;
    return {
      url: url.length > 2048 ? url.slice(0, 2048) : url,
      companyDomain: host,
    };
  } catch {
    return null;
  }
}
