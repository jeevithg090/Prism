import { ImageResponse } from "next/og";

// The social preview card for every page: the Keystone mark, name and promise on warm paper.
// Colours are the light theme's paper, ink, ink-3 and coral signal from app/tokens.css, in hex because
// ImageResponse cannot read CSS variables.
export const alt = "Keystone: your degree is the foundation. Keystone builds the bridge to industry.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: "80px",
        background: "#f8f4f1",
        color: "#1d1614",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "24px" }}>
        <svg width="96" height="96" viewBox="0 0 32 32">
          <rect width="32" height="32" rx="7" fill="#b0451a" />
          <g fill="#fdfbf9">
            <g opacity="0.6">
              <path d="M4 19A12 12 0 0 1 5.99 12.38L10.58 15.41A6.5 6.5 0 0 0 9.5 19Z" />
              <path d="M6.61 11.53A12 12 0 0 1 11.8 7.76L13.72 12.91A6.5 6.5 0 0 0 10.91 14.95Z" />
              <path d="M20.2 7.76A12 12 0 0 1 25.39 11.53L21.09 14.95A6.5 6.5 0 0 0 18.28 12.91Z" />
              <path d="M26.01 12.38A12 12 0 0 1 28 19L22.5 19A6.5 6.5 0 0 0 21.42 15.41Z" />
              <path d="M4 20.5h5.5V28H4zM22.5 20.5H28V28h-5.5z" />
            </g>
            <path d="M12.79 7.44A12 12 0 0 1 19.21 7.44L17.74 12.74A6.5 6.5 0 0 0 14.26 12.74Z" />
          </g>
        </svg>
        <div style={{ fontSize: 64, fontWeight: 700 }}>Keystone</div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
        <div style={{ fontSize: 60, fontWeight: 700, lineHeight: 1.15, maxWidth: "980px" }}>
          Your degree is the foundation. Keystone builds the bridge to industry.
        </div>
        <div style={{ fontSize: 32, color: "#615955", maxWidth: "980px", lineHeight: 1.35 }}>
          A degree-aware roadmap, a real team project and verified proof of skill.
        </div>
      </div>
      <div style={{ display: "flex", height: "10px", width: "160px", background: "#b0451a", borderRadius: "5px" }} />
    </div>,
    size,
  );
}
