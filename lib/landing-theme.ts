import type { CSSProperties } from "react";

/** Shared palette for landing + beta analyze client section */
export const LANDING_COLORS = {
  background: "var(--paper)",
  text: "var(--ink)",
  textMuted: "var(--ink-2)",
  textFaint: "var(--muted)",
  card: "var(--paper-2)",
  border: "var(--line)",
  borderStrong: "var(--line-2)",
  green: "var(--accent-2)",
  greenBg: "color-mix(in oklch, var(--accent-2) 10%, transparent)",
  amber: "var(--warn)",
  amberBg: "color-mix(in oklch, var(--warn) 14%, transparent)",
} as const;

export const eyebrowStyle: CSSProperties = {
  fontSize: 13,
  textTransform: "uppercase",
  letterSpacing: "0.05em",
  color: "var(--muted)",
  fontWeight: 500,
  margin: 0,
  marginBottom: 16,
};

/** BETA pill on landing analyze section */
export const betaBadge: CSSProperties = {
  padding: "3px 8px",
  borderRadius: 4,
  fontSize: 11,
  letterSpacing: "0.03em",
  fontWeight: 500,
  color: LANDING_COLORS.amber,
  background: LANDING_COLORS.amberBg,
};
