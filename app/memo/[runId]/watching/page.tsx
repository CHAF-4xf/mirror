"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { use, useEffect, useMemo, useState } from "react";
import { LANDING_COLORS as COLORS, eyebrowStyle } from "@/lib/landing-theme";

type PageProps = {
  params: Promise<{ runId: string }>;
};

type RunStatus =
  | "PENDING"
  | "SCRAPING"
  | "EXTRACTING"
  | "SYNTHESIZING"
  | "RENDERING"
  | "COMPLETE"
  | "FAILED";

type AgentState = "PENDING" | "RUNNING" | "COMPLETE" | "FAILED" | "SKIPPED";
type AgentName = "SCRAPER" | "EXTRACTOR" | "SYNTHESIZER" | "RENDERER";

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

const DEFAULT_AGENTS: StreamPayload["agents"] = [
  { name: "SCRAPER", state: "PENDING", message: "", latencyMs: 0, costUsd: 0 },
  { name: "EXTRACTOR", state: "PENDING", message: "", latencyMs: 0, costUsd: 0 },
  { name: "SYNTHESIZER", state: "PENDING", message: "", latencyMs: 0, costUsd: 0 },
  { name: "RENDERER", state: "PENDING", message: "", latencyMs: 0, costUsd: 0 },
];

const INITIAL_PAYLOAD: StreamPayload = {
  runStatus: "PENDING",
  agents: DEFAULT_AGENTS,
  totalCostUsd: 0,
  totalLatencyMs: 0,
  error: null,
};

const STATE_STYLES: Record<
  AgentState,
  { color: string; background: string; pulse?: boolean }
> = {
  PENDING: { color: COLORS.textMuted, background: "rgba(156, 163, 175, 0.1)" },
  RUNNING: { color: COLORS.amber, background: COLORS.amberBg, pulse: true },
  COMPLETE: { color: COLORS.green, background: COLORS.greenBg },
  FAILED: { color: "#dc2626", background: "rgba(220, 38, 38, 0.1)" },
  SKIPPED: { color: COLORS.textMuted, background: "rgba(156, 163, 175, 0.1)" },
};

const STAGE_TEXT: Record<RunStatus, string> = {
  PENDING: "Preparing pipeline...",
  SCRAPING: "Stage 1 of 4: Scraping public customer voice...",
  EXTRACTING: "Stage 2 of 4: Extracting themes...",
  SYNTHESIZING: "Stage 3 of 4: Synthesizing memo structure...",
  RENDERING: "Stage 4 of 4: Rendering memo...",
  COMPLETE: "Complete. Opening memo...",
  FAILED: "Pipeline failed.",
};

type RunDetailResponse = {
  run?: { companyDomain?: string | null };
};

export default function WatchingPage(props: PageProps) {
  const router = useRouter();
  const { runId } = use(props.params);
  const [payload, setPayload] = useState<StreamPayload>(INITIAL_PAYLOAD);
  const [companyDomain, setCompanyDomain] = useState<string | null>(null);
  const [streamError, setStreamError] = useState<string | null>(null);

  const encodedRunId = useMemo(() => encodeURIComponent(runId), [runId]);

  useEffect(() => {
    let cancelled = false;

    async function loadRunDetail() {
      try {
        const res = await fetch(`/api/runs/${encodedRunId}`, { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as RunDetailResponse;
        if (!cancelled) {
          setCompanyDomain(data.run?.companyDomain ?? null);
        }
      } catch {
        // Streaming still works without this cosmetic label.
      }
    }

    void loadRunDetail();
    return () => {
      cancelled = true;
    };
  }, [encodedRunId]);

  useEffect(() => {
    const events = new EventSource(`/api/runs/${encodedRunId}/stream`);
    let redirectTimer: ReturnType<typeof setTimeout> | undefined;

    events.onmessage = (event) => {
      try {
        const next = JSON.parse(event.data) as StreamPayload;
        setPayload(next);
        setStreamError(null);

        if (next.runStatus === "COMPLETE") {
          events.close();
          redirectTimer = setTimeout(() => {
            router.push(`/memo/${runId}`);
          }, 1_500);
        } else if (next.runStatus === "FAILED") {
          events.close();
        }
      } catch {
        setStreamError("Could not parse pipeline progress update.");
      }
    };

    events.onerror = () => {
      setStreamError("Lost connection to live progress. Refresh to reconnect.");
      events.close();
    };

    return () => {
      events.close();
      if (redirectTimer) clearTimeout(redirectTimer);
    };
  }, [encodedRunId, router, runId]);

  const errorMessage =
    payload.runStatus === "FAILED"
      ? payload.error ?? "Pipeline failed. Check server logs for details."
      : streamError;

  return (
    <main
      style={{
        maxWidth: 720,
        margin: "0 auto",
        padding: "64px 48px",
        color: COLORS.text,
      }}
    >
      <style>{`
        @keyframes mirror-progress-pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.55; }
        }
      `}</style>
      <p
        style={{
          ...eyebrowStyle,
          marginBottom: 16,
        }}
      >
        ANALYZING {companyDomain ?? runId}
      </p>
      <h1
        style={{
          fontSize: 28,
          fontWeight: 500,
          letterSpacing: "-0.02em",
          margin: "0 0 16px",
          lineHeight: 1.25,
        }}
      >
        Pipeline running
      </h1>
      <p
        style={{
          fontSize: 15,
          color: COLORS.textMuted,
          lineHeight: 1.6,
          margin: "0 0 24px",
        }}
      >
        {STAGE_TEXT[payload.runStatus]}
      </p>

      <div
        style={{
          background: COLORS.card,
          border: `0.5px solid ${COLORS.border}`,
          borderRadius: 8,
          overflow: "hidden",
        }}
      >
        {payload.agents.map((agent, index) => {
          const badge = STATE_STYLES[agent.state];
          return (
            <div
              key={agent.name}
              style={{
                display: "grid",
                gridTemplateColumns: "140px 112px 1fr",
                gap: 16,
                alignItems: "center",
                padding: "16px 20px",
                borderTop:
                  index === 0 ? "none" : `0.5px solid ${COLORS.border}`,
              }}
            >
              <span
                style={{
                  fontSize: 14,
                  fontWeight: 500,
                  color: COLORS.text,
                }}
              >
                {formatAgentName(agent.name)}
              </span>
              <span
                style={{
                  justifySelf: "start",
                  padding: "3px 8px",
                  borderRadius: 4,
                  fontSize: 11,
                  letterSpacing: "0.03em",
                  fontWeight: 500,
                  color: badge.color,
                  background: badge.background,
                  animation: badge.pulse
                    ? "mirror-progress-pulse 1.4s ease-in-out infinite"
                    : undefined,
                }}
              >
                {agent.state}
              </span>
              <span
                style={{
                  fontSize: 13,
                  color: agent.message ? COLORS.textMuted : COLORS.textFaint,
                  lineHeight: 1.5,
                }}
              >
                {agent.message || defaultAgentMessage(agent.state)}
              </span>
            </div>
          );
        })}
      </div>

      <p
        style={{
          fontSize: 12,
          color: COLORS.textFaint,
          lineHeight: 1.5,
          margin: "16px 0 0",
        }}
      >
        Running total: ${payload.totalCostUsd.toFixed(4)} ·{" "}
        {formatLatency(payload.totalLatencyMs)}
      </p>

      {errorMessage ? (
        <div style={{ marginTop: 20 }}>
          <p
            role="alert"
            style={{
              fontSize: 13,
              color: "#fca5a5",
              margin: "0 0 12px",
              lineHeight: 1.5,
            }}
          >
            {errorMessage}
          </p>
          {payload.runStatus === "FAILED" ? (
            <Link
              href="/"
              style={{
                fontSize: 14,
                color: COLORS.text,
                textDecoration: "underline",
                textUnderlineOffset: 3,
              }}
            >
              Back to home
            </Link>
          ) : null}
        </div>
      ) : null}
    </main>
  );
}

function formatAgentName(name: AgentName): string {
  return name.charAt(0) + name.slice(1).toLowerCase();
}

function defaultAgentMessage(state: AgentState): string {
  switch (state) {
    case "PENDING":
      return "Waiting for previous stage.";
    case "RUNNING":
      return "Working...";
    case "COMPLETE":
      return "Done.";
    case "FAILED":
      return "Failed.";
    case "SKIPPED":
      return "Skipped.";
  }
}

function formatLatency(ms: number): string {
  if (ms < 1_000) return `${ms}ms latency`;
  return `${(ms / 1_000).toFixed(1)}s latency`;
}
