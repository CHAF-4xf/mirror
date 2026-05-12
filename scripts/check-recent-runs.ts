import 'dotenv/config';
import { prisma } from '../lib/prisma';

async function main() {
  const recent = await prisma.run.findMany({
    orderBy: { createdAt: 'desc' },
    take: 5,
    select: {
      id: true,
      url: true,
      companyDomain: true,
      status: true,
      createdAt: true
    }
  });
  console.log(JSON.stringify(recent, null, 2));
}

main().then(() => process.exit(0)).catch((err) => {
  console.error(err);
  process.exit(1);
});
