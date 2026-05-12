/**
 * Backfill demoSlug on the latest COMPLETE Run per OpenView demo company.
 * One-off: `npx tsx scripts/backfill-demo-slugs.ts`
 */
import 'dotenv/config';
import { prisma } from '../lib/prisma';

const MAPPING = [
  { companyDomain: 'rewst.io', demoSlug: 'rewst-demo' },
  { companyDomain: 'mangomint.com', demoSlug: 'mangomint-demo' },
  { companyDomain: 'deputy.com', demoSlug: 'deputy-demo' },
] as const;

async function main(): Promise<void> {
  console.log('Backfilling demoSlug on latest COMPLETE Run per domain...\n');

  for (const { companyDomain, demoSlug } of MAPPING) {
    const run = await prisma.run.findFirst({
      where: { companyDomain, status: 'COMPLETE' },
      orderBy: { createdAt: 'desc' },
      select: { id: true, createdAt: true, companyName: true },
    });

    if (!run) {
      console.warn(`No COMPLETE run found for ${companyDomain} — skipped.`);
      continue;
    }

    await prisma.run.update({
      where: { id: run.id },
      data: { demoSlug },
    });

    console.log(
      `  ${run.id}  ${companyDomain}  (${run.companyName ?? 'no name'})  →  demoSlug=${demoSlug}`,
    );
  }

  const tagged = await prisma.run.findMany({
    where: { demoSlug: { not: null } },
    select: { id: true, demoSlug: true, companyDomain: true },
    orderBy: { demoSlug: 'asc' },
  });

  console.log(`\nRuns with demoSlug set (${tagged.length}):`);
  for (const r of tagged) {
    console.log(`  ${r.id}  ${r.companyDomain}  ${r.demoSlug}`);
  }
}

main()
  .catch((e: unknown) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
