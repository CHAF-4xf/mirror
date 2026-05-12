import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';

// Prisma 7 requires an explicit driver adapter at runtime (DATABASE_URL is no
// longer auto-wired through the client). We use @prisma/adapter-pg against
// the pooled Supabase connection URL.
function createPrismaClient(): PrismaClient {
  const connectionString = process.env['DATABASE_URL'];
  if (!connectionString) {
    throw new Error(
      'lib/prisma: DATABASE_URL is not set — required to construct PrismaPg adapter',
    );
  }
  const adapter = new PrismaPg({ connectionString });
  return new PrismaClient({ adapter });
}

// Singleton pattern: in dev / scripts, hot reload or repeated imports must not
// create new clients (each new client opens its own pool). In production we
// still want a single client per process.
const globalForPrisma = globalThis as unknown as { __prisma?: PrismaClient };

export const prisma: PrismaClient = globalForPrisma.__prisma ?? createPrismaClient();

if (process.env['NODE_ENV'] !== 'production') {
  globalForPrisma.__prisma = prisma;
}
