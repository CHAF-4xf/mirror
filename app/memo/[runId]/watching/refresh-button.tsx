"use client";

import { useRouter } from "next/navigation";

/** Revalidates server components for this route segment without a full reload. */
export function RefreshButton() {
  const router = useRouter();
  return (
    <button
      type="button"
      onClick={() => router.refresh()}
      style={{
        marginTop: 16,
        background: "#ffffff",
        color: "#0a0a0a",
        padding: "10px 20px",
        borderRadius: 8,
        fontSize: 14,
        fontWeight: 500,
        border: "none",
        cursor: "pointer",
        fontFamily: "inherit",
      }}
    >
      Refresh status
    </button>
  );
}
