"use client";
// Last resort: the root layout itself failed, so this renders its own document without the app's CSS.
// Inline styles use the light theme's paper, ink and ink-3 values from app/tokens.css.
export default function GlobalError({ retry }: { error: unknown; retry: () => void }) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100dvh",
          display: "grid",
          placeItems: "center",
          background: "#f8f4f1",
          color: "#1d1614",
          fontFamily: "system-ui, sans-serif",
          padding: "16px",
          textAlign: "center",
        }}
      >
        <title>Keystone didn&apos;t load</title>
        <main>
          <h1 style={{ fontSize: "2rem", margin: "0 0 12px" }}>Keystone didn&apos;t load</h1>
          <p style={{ color: "#615955", fontSize: "1.0625rem", margin: "0 0 24px" }}>That&apos;s on us, not you. Please try again.</p>
          <button
            type="button"
            onClick={() => retry()}
            style={{
              height: "44px",
              padding: "0 20px",
              borderRadius: "8px",
              border: 0,
              background: "#1d1614",
              color: "#f8f4f1",
              fontSize: "1rem",
              cursor: "pointer",
            }}
          >
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
