import type { AgentName, AgentState, RunStatus } from '@/types';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

const AGENT_ORDER: AgentName[] = [
  'SCRAPER',
  'EXTRACTOR',
  'SYNTHESIZER',
  'RENDERER',
];

const POLL_INTERVAL_MS = 2_000;
const MAX_DURATION_MS = 600_000;
const TERMINAL_RUN_STATUSES = new Set<RunStatus>(['COMPLETE', 'FAILED']);

type StreamPayload = {
  runStatus: RunStatus;
  agents: Array<{
    name: AgentName;
    state: AgentState;
    message: string;
    latencyMs: number;
    costUsd: number;
  }>;
  totalCostUsd: number;
  totalLatencyMs: number;
  error: string | null;
};

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(request: Request, context: RouteContext) {
  const { id } = await context.params;
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      let interval: ReturnType<typeof setInterval> | undefined;
      let timeout: ReturnType<typeof setTimeout> | undefined;

      const close = () => {
        if (closed) return;
        closed = true;
        if (interval) clearInterval(interval);
        if (timeout) clearTimeout(timeout);
        request.signal.removeEventListener('abort', close);
        controller.close();
      };

      const send = (payload: StreamPayload) => {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify(payload)}\n\n`),
        );
      };

      const poll = async () => {
        if (closed) return;

        try {
          const run = await prisma.run.findUnique({
            where: { id },
            select: {
              status: true,
              totalCostUsd: true,
              totalLatencyMs: true,
              error: true,
              agentRuns: {
                orderBy: { startedAt: 'asc' },
                select: {
                  agentName: true,
                  state: true,
                  message: true,
                  latencyMs: true,
                  costUsd: true,
                },
              },
            },
          });

          if (!run) {
            send({
              runStatus: 'FAILED',
              agents: buildAgentStates([]),
              totalCostUsd: 0,
              totalLatencyMs: 0,
              error: 'Run not found',
            });
            close();
            return;
          }

          const agentCostUsd = run.agentRuns.reduce(
            (sum: number, row) => sum + row.costUsd,
            0,
          );
          const agentLatencyMs = run.agentRuns.reduce(
            (sum: number, row) => sum + row.latencyMs,
            0,
          );

          const payload: StreamPayload = {
            runStatus: run.status,
            agents: buildAgentStates(run.agentRuns),
            totalCostUsd: Math.max(run.totalCostUsd, agentCostUsd),
            totalLatencyMs: Math.max(run.totalLatencyMs, agentLatencyMs),
            error: run.error,
          };

          send(payload);

          if (TERMINAL_RUN_STATUSES.has(run.status)) {
            close();
          }
        } catch (err) {
          send({
            runStatus: 'FAILED',
            agents: buildAgentStates([]),
            totalCostUsd: 0,
            totalLatencyMs: 0,
            error: err instanceof Error ? err.message : 'Stream polling failed',
          });
          close();
        }
      };

      request.signal.addEventListener('abort', close);
      timeout = setTimeout(close, MAX_DURATION_MS);
      void poll();
      interval = setInterval(() => {
        void poll();
      }, POLL_INTERVAL_MS);
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-store',
      Connection: 'keep-alive',
    },
  });
}

function buildAgentStates(
  rows: Array<{
    agentName: AgentName;
    state: AgentState;
    message: string;
    latencyMs: number;
    costUsd: number;
  }>,
): StreamPayload['agents'] {
  const latestByAgent = new Map<AgentName, (typeof rows)[number]>();
  for (const row of rows) {
    latestByAgent.set(row.agentName, row);
  }

  return AGENT_ORDER.map((name) => {
    const row = latestByAgent.get(name);
    return {
      name,
      state: row?.state ?? 'PENDING',
      message: row?.message ?? '',
      latencyMs: row?.latencyMs ?? 0,
      costUsd: row?.costUsd ?? 0,
    };
  });
}
