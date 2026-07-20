/**
 * User-facing DB failure message. Never includes connection strings or secrets.
 */
export function databaseUnavailableMessage(err: unknown): string {
  const hasDatabaseUrl = Boolean(process.env.DATABASE_URL?.trim());
  const hasDirectUrl = Boolean(process.env.DIRECT_URL?.trim());

  if (!hasDatabaseUrl || !hasDirectUrl) {
    const missing = [
      !hasDatabaseUrl ? 'DATABASE_URL' : null,
      !hasDirectUrl ? 'DIRECT_URL' : null,
    ].filter(Boolean);
    return `Database not configured. Missing env: ${missing.join(', ')}. Set them in Vercel and redeploy.`;
  }

  const code =
    err && typeof err === 'object' && 'code' in err
      ? String((err as { code: unknown }).code)
      : '';

  // Prisma common codes: https://www.prisma.io/docs/orm/reference/error-reference
  if (code === 'P1001') {
    return 'Database unreachable (P1001). The host in DATABASE_URL may be wrong, paused, or blocking connections.';
  }
  if (code === 'P1000') {
    return 'Database auth failed (P1000). Password or username in DATABASE_URL/DIRECT_URL is wrong — reset the DB password and update both env vars, then redeploy.';
  }
  if (code === 'P1017') {
    return 'Database server closed the connection (P1017). Check the provider dashboard and connection limits.';
  }
  if (code === 'P2021' || code === 'P2022') {
    return `Database schema mismatch (${code}). Run prisma migrations against this database.`;
  }

  const name =
    err && typeof err === 'object' && 'name' in err
      ? String((err as { name: unknown }).name)
      : '';
  if (name === 'PrismaClientInitializationError') {
    return 'Database failed to initialize. DATABASE_URL/DIRECT_URL are set but Prisma cannot connect — check the provider (Neon/etc.) is active and the URLs are current.';
  }

  return `Database unavailable (${code || name || 'unknown'}). Vars are set; connection is failing. Check Vercel Runtime Logs and your Postgres provider.`;
}
