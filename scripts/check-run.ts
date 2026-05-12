import 'dotenv/config';
import { prisma } from '../lib/prisma';

async function main() {
  const run = await prisma.run.findUnique({
    where: { id: 'cmp1zmd5k00003pa7oy0cokih' },
    select: {
      id: true,
      companyDomain: true,
      status: true,
      totalCostUsd: true,
      error: true,
      agentRuns: {
        select: { agentName: true, state: true, message: true }
      }
    }
  });
  console.log(JSON.stringify(run, null, 2));
}

main().then(() => process.exit(0));
