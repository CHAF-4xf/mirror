import { NextResponse } from 'next/server';
import type { MemoDTO } from '@/types';
import {
  type DemoRunListRow,
  headlineFindingFromJTBD,
  listDemoRuns,
} from '@/lib/demo-runs';
import { runPipeline } from '@/lib/orchestrator';
import { prisma } from '@/lib/prisma';
import { databaseUnavailableMessage } from '@/lib/db-error';
import {
  COMPANY_URL_VALIDATION_ERROR,
  normalizeRunUrlInput,
} from '@/lib/run-url';

export async function GET() {
  try {
    const rows = await listDemoRuns();

    const runs = rows.map((r: DemoRunListRow) => {
      const memoJson = r.memo?.contentJson as Partial<MemoDTO> | undefined;
      const headlineFinding = headlineFindingFromJTBD(
        memoJson?.jobToBeDone?.statement,
      );
      const coverageGrade =
        memoJson?.sourceCoverage?.coverageGrade ?? ('THIN' as const);

      return {
        id: r.id,
        demoSlug: r.demoSlug,
        companyName: r.companyName,
        sourceCount: r._count.sources,
        themeCount: r._count.themes,
        coverageGrade,
        headlineFinding,
      };
    });

    return NextResponse.json({ runs });
  } catch (err) {
    console.error('[GET /api/runs] failed:', err);
    return NextResponse.json(
      { error: databaseUnavailableMessage(err) },
      { status: 503 },
    );
  }
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: 'Request body must be valid JSON.' },
      { status: 400 },
    );
  }

  const urlRaw =
    body &&
    typeof body === 'object' &&
    typeof (body as { url?: unknown }).url === 'string'
      ? (body as { url: string }).url
      : null;

  if (urlRaw == null) {
    return NextResponse.json(
      { error: 'Body must include a string "url" field.' },
      { status: 400 },
    );
  }

  const parsed = normalizeRunUrlInput(urlRaw);
  if (!parsed) {
    return NextResponse.json({ error: COMPANY_URL_VALIDATION_ERROR }, { status: 400 });
  }

  let run: { id: string; status: string };
  try {
    run = await prisma.run.create({
      data: {
        url: parsed.url,
        companyDomain: parsed.companyDomain,
        companyName: null,
        status: 'PENDING',
      },
      select: { id: true, status: true },
    });
  } catch (err) {
    console.error('[POST /api/runs] create failed:', err);
    return NextResponse.json(
      { error: databaseUnavailableMessage(err) },
      { status: 503 },
    );
  }

  void runPipeline(run.id).catch((err) => {
    console.error(`[POST /api/runs] runPipeline(${run.id}) failed:`, err);
  });

  return NextResponse.json(
    { runId: run.id, status: run.status },
    { status: 201 },
  );
}
