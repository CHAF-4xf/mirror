import Link from "next/link";

export default function MemoNotFound() {
  return (
    <div
      style={{
        background: "#0a0a0a",
        minHeight: "100vh",
        color: "#ffffff",
        fontFamily: "inherit",
      }}
    >
      <main
        style={{
          maxWidth: 720,
          margin: "0 auto",
          padding: "64px 48px",
        }}
      >
        <p style={{ fontSize: 16, margin: "0 0 16px" }}>Memo not found</p>
        <Link
          href="/"
          style={{
            fontSize: 14,
            fontWeight: 500,
            color: "#9ca3af",
            textDecoration: "none",
          }}
        >
          ← Back to all memos
        </Link>
      </main>
    </div>
  );
}
