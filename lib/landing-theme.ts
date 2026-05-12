import type { CSSProperties } from "react";

/** Shared palette for landing + beta analyze client section */
export const LANDING_COLORS = {
  background: "#0a0a0a",
  text: "#ffffff",
  textMuted: "#9ca3af",
  textFaint: "#6b7280",
  card: "#141414",
  border: "#2a2a2a",
  green: "#1d9e75",
  greenBg: "rgba(29, 158, 117, 0.1)",
  amber: "#ba7517",
  amberBg: "rgba(186, 117, 23, 0.1)",
} as const;

export const eyebrowStyle: CSSProperties = {
  fontSize: 13,
  textTransform: "uppercase",
  letterSpacing: "0.05em",
  color: LANDING_COLORS.textFaint,
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
