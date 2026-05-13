"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { use, useEffect, useMemo, useState } from "react";

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

const STAGE_TEXT: Record<RunStatus, string> = {
  PENDING: "Preparing pipeline…",
  SCRAPING: "Stage 1 of 4: Scraping public customer voice…",
  EXTRACTING: "Stage 2 of 4: Extracting themes…",
  SYNTHESIZING: "Stage 3 of 4: Synthesizing memo structure…",
  RENDERING: "Stage 4 of 4: Rendering memo…",
  COMPLETE: "Complete. Opening memo…",
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
  const showConnectionLost =
    Boolean(streamError) &&
    payload.runStatus !== "COMPLETE" &&
    payload.runStatus !== "FAILED";
  const domainLabel = (companyDomain ?? runId).toUpperCase();

  return (
    <main
      style={{
        maxWidth: 720,
        margin: "0 auto",
        padding: "56px 32px 80px",
      }}
    >
      <div className="micro" style={{ marginBottom: 18 }}>
        ─── analyzing {domainLabel}
      </div>
      <h1
        style={{
          font: "500 44px/1.1 var(--sans)",
          letterSpacing: "-0.02em",
          margin: "0 0 12px",
        }}
      >
        Pipeline running
      </h1>
      <div
        style={{
          fontSize: 16,
          color: "var(--muted)",
          marginBottom: 48,
          lineHeight: 1.5,
        }}
      >
        {STAGE_TEXT[payload.runStatus]}
      </div>

      <div
        style={{
          borderTop: "1px solid var(--line)",
          borderBottom: "1px solid var(--line)",
        }}
      >
        {payload.agents.map(
          (agent: StreamPayload["agents"][number], index: number) => {
            return (
              <div
                key={agent.name}
                style={{
                  display: "grid",
                  gridTemplateColumns: "32px 1fr auto auto",
                  gap: 16,
                  alignItems: "center",
                  padding: "20px 0",
                  borderTop: index === 0 ? "none" : "1px solid var(--line)",
                }}
              >
                <div
                  className="mono"
                  style={{
                    fontSize: 11,
                    color: "var(--muted-2)",
                    fontWeight: 500,
                  }}
                >
                  {String(index + 1).padStart(2, "0")}
                </div>

                <div>
                  <div
                    style={{
                      fontSize: 15,
                      fontWeight: 500,
                      color: "var(--ink)",
                      marginBottom: 4,
                    }}
                  >
                    {formatAgentName(agent.name)}
                  </div>
                  <div
                    className="mono"
                    style={{
                      fontSize: 12,
                      color: "var(--muted)",
                      lineHeight: 1.4,
                    }}
                  >
                    {agent.message || defaultAgentMessage(agent.state)}
                  </div>
                </div>

                <div
                  className="mono"
                  style={{
                    fontSize: 11,
                    color: "var(--muted-2)",
                    minWidth: 80,
                    textAlign: "right",
                  }}
                >
                  {agent.state === "COMPLETE" ? (
                    <>
                      {(agent.latencyMs / 1_000).toFixed(1)}s · $
                      {agent.costUsd.toFixed(2)}
                    </>
                  ) : null}
                  {agent.state === "RUNNING" ? (
                    <span className="pulsing">running</span>
                  ) : null}
                </div>

                <StateBadge state={agent.state} />
              </div>
            );
          },
        )}
      </div>

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          marginTop: 32,
          padding: "0 4px",
          fontSize: 12,
          color: "var(--muted)",
        }}
      >
        <span className="mono">
          Running total: ${payload.totalCostUsd.toFixed(4)} ·{" "}
          {Math.round(payload.totalLatencyMs / 1_000)}s elapsed
        </span>
      </div>

      {showConnectionLost ? (
        <div style={{
          marginTop: 24,
          padding: "12px 16px",
          background: "oklch(95% 0.04 80 / 0.6)",
          border: "0.5px solid oklch(85% 0.06 80)",
          borderRadius: 8,
          fontSize: 13,
          color: "var(--ink-2)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
        }}>
          <span>
            Lost connection to live progress. Pipeline is still running.
          </span>
          <button onClick={() => window.location.reload()} className="ghost-btn" style={{ fontSize: 12 }}>
            Refresh to reconnect →
          </button>
        </div>
      ) : null}

      {payload.runStatus === "FAILED" ? (
        <div style={{
          marginTop: 32,
          padding: "24px 28px",
          background: "oklch(95% 0.06 30 / 0.4)",
          border: "1px solid oklch(85% 0.08 30)",
          borderRadius: 8,
        }}>
          <div className="small-caps" style={{
            color: "var(--accent)",
            marginBottom: 12,
          }}>
            analysis failed
          </div>
          <p style={{
            fontSize: 14,
            lineHeight: 1.5,
            color: "var(--ink-2)",
            margin: "0 0 16px",
          }}>
            {errorMessage || "The pipeline encountered an error during analysis."}
          </p>
          <Link href="/" className="solid-btn" style={{
            display: "inline-flex",
            textDecoration: "none",
          }}>
            New analysis
          </Link>
        </div>
      ) : null}
    </main>
  );
}

function StateBadge({ state }: { state: AgentState }) {
  const config = {
    PENDING: { color: "var(--muted-2)", bg: "var(--paper-2)", label: "pending" },
    RUNNING: {
      color: "var(--warn)",
      bg: "oklch(95% 0.05 80 / 0.5)",
      label: "running",
      pulse: true,
    },
    COMPLETE: {
      color: "var(--accent-2)",
      bg: "oklch(95% 0.04 145 / 0.5)",
      label: "done",
    },
    FAILED: {
      color: "var(--accent)",
      bg: "oklch(95% 0.05 30 / 0.5)",
      label: "failed",
    },
    SKIPPED: { color: "var(--muted-2)", bg: "var(--paper-2)", label: "skipped" },
  }[state];

  return (
    <span className={`mono ${config.pulse ? "pulsing" : ""}`} style={{
      display: "inline-flex",
      alignItems: "center",
      gap: 6,
      padding: "4px 10px",
      borderRadius: 999,
      background: config.bg,
      color: config.color,
      fontSize: 10.5,
      letterSpacing: "0.04em",
      fontWeight: 500,
      textTransform: "uppercase",
    }}>
      <span style={{
        width: 6,
        height: 6,
        borderRadius: "50%",
        background: config.color,
      }} />
      {config.label}
    </span>
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
      return "Working…";
    case "COMPLETE":
      return "Done.";
    case "FAILED":
      return "Failed.";
    case "SKIPPED":
      return "Skipped.";
  }
}
