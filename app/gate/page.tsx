"use client";

import { useRouter } from "next/navigation";
import type { FormEvent } from "react";
import { useCallback, useState } from "react";
import { LANDING_COLORS as COLORS, eyebrowStyle } from "@/lib/landing-theme";

type AuthResponse = { ok: true } | { error: string };

export default function GatePage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      setError(null);
      setLoading(true);

      try {
        const res = await fetch("/api/auth", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ password }),
        });

        let data: AuthResponse | null = null;
        try {
          data = (await res.json()) as AuthResponse;
        } catch {
          // Keep the user-facing error simple.
        }

        if (!res.ok) {
          setError(
            data && "error" in data && typeof data.error === "string"
              ? data.error
              : "Incorrect password",
          );
          return;
        }

        router.push("/");
        router.refresh();
      } catch {
        setError("Incorrect password");
      } finally {
        setLoading(false);
      }
    },
    [password, router],
  );

  return (
    <main
      style={{
        maxWidth: 720,
        margin: "0 auto",
        padding: "64px 48px",
        color: COLORS.text,
      }}
    >
      <section style={{ maxWidth: 420 }}>
        <p style={eyebrowStyle}>CUSTOMER VOICE MIRROR</p>
        <h1
          style={{
            fontSize: 36,
            fontWeight: 500,
            color: COLORS.text,
            lineHeight: 1.2,
            letterSpacing: "-0.02em",
            margin: 0,
            marginBottom: 16,
          }}
        >
          Enter demo password.
        </h1>
        <p
          style={{
            fontSize: 16,
            color: COLORS.textMuted,
            lineHeight: 1.6,
            margin: "0 0 28px",
          }}
        >
          This demo is password-protected before public deployment.
        </p>

        <form onSubmit={onSubmit}>
          <div
            style={{
              display: "flex",
              gap: 8,
              marginBottom: error ? 8 : 12,
            }}
          >
            <input
              type="password"
              className="mirror-input"
              placeholder="Password"
              value={password}
              disabled={loading}
              onChange={(event) => {
                setPassword(event.target.value);
                setError(null);
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
              type="submit"
              disabled={loading}
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
              {loading ? "Checking..." : "Submit"}
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
        </form>
      </section>
    </main>
  );
}
