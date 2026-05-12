"use client";

import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import {
  LANDING_COLORS as COLORS,
  betaBadge,
  eyebrowStyle,
} from "@/lib/landing-theme";
import { COMPANY_URL_VALIDATION_ERROR } from "@/lib/run-url";

type PostRunsResponse =
  | { runId: string; status: string }
  | { error: string };

export function BetaAnalyzeSection() {
  const router = useRouter();
  const [urlInput, setUrlInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onAnalyze = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/runs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: urlInput }),
      });

      let data: PostRunsResponse;
      try {
        data = (await res.json()) as PostRunsResponse;
      } catch {
        setError("Something went wrong. Try again.");
        return;
      }

      if (!res.ok) {
        const serverError =
          data &&
          typeof data === "object" &&
          "error" in data &&
          typeof (data as { error: unknown }).error === "string"
            ? (data as { error: string }).error
            : null;
        setError(
          serverError ??
            (res.status === 400
              ? COMPANY_URL_VALIDATION_ERROR
              : "Request failed. Try again."),
        );
        return;
      }

      if (!("runId" in data) || typeof data.runId !== "string") {
        setError("Unexpected response from server.");
        return;
      }

      router.push(`/memo/${data.runId}/watching`);
    } catch {
      setError("Network error. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }, [router, urlInput]);

  return (
    <section
      style={{
        borderTop: `0.5px solid ${COLORS.border}`,
        paddingTop: 32,
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 12,
        }}
      >
        <p style={{ ...eyebrowStyle, marginBottom: 0 }}>
          TRY IT ON ANY B2B SAAS
        </p>
        <span style={betaBadge}>BETA</span>
      </div>
      <div
        style={{
          display: "flex",
          gap: 8,
          marginBottom: error ? 8 : 12,
          alignItems: "flex-start",
        }}
      >
        <input
          type="text"
          className="mirror-input"
          placeholder="https://company.com"
          value={urlInput}
          disabled={loading}
          onChange={(e) => {
            setUrlInput(e.target.value);
            setError(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !loading) {
              void onAnalyze();
            }
          }}
          style={{
            background: COLORS.card,
            border: `0.5px solid ${COLORS.border}`,
            color: COLORS.text,
            padding: "10px 14px",
            borderRadius: 8,
            fontSize: 14,
            flex: 1,
            fontFamily: "inherit",
          }}
        />
        <button
          type="button"
          disabled={loading}
          onClick={() => {
            void onAnalyze();
          }}
          style={{
            background: "#ffffff",
            color: COLORS.background,
            padding: "10px 20px",
            borderRadius: 8,
            fontSize: 14,
            fontWeight: 500,
            border: "none",
            cursor: loading ? "wait" : "pointer",
            opacity: loading ? 0.8 : 1,
            fontFamily: "inherit",
            whiteSpace: "nowrap",
          }}
        >
          {loading ? "Starting..." : "Analyze"}
        </button>
      </div>
      {error ? (
        <p
          role="alert"
          style={{
            fontSize: 13,
            color: "#fca5a5",
            margin: "0 0 12px",
            lineHeight: 1.5,
          }}
        >
          {error}
        </p>
      ) : null}
      <p
        style={{
          fontSize: 12,
          color: COLORS.textFaint,
          lineHeight: 1.5,
          margin: 0,
        }}
      >
        Live runs take 3–5 minutes. Best results on companies with a public
        customer-stories page and an active Reddit community.
      </p>
    </section>
  );
}
