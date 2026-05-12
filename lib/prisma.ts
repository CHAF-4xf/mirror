import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as { __prisma?: PrismaClient };

export const prisma: PrismaClient =
  globalForPrisma.__prisma ??
  new PrismaClient({
    log: process.env['NODE_ENV'] === 'production' ? ['error'] : ['error', 'warn'],
  });

if (process.env['NODE_ENV'] !== 'production') {
  globalForPrisma.__prisma = prisma;
}
