// Inline SVG QR code (components/launch/qr.ts): always dark modules on a light ground so phones can scan it in either theme.
// Light theme: ink on cotton. Dark theme swaps the two tokens, so the code stays dark on light.
import { qrMatrix, qrPath } from "./qr";
import { cn } from "@/lib/utils";

export function QrCode({ value, label, className }: { value: string; label: string; className?: string }) {
  const m = qrMatrix(value);
  const n = m.length + 8;
  return (
    <svg
      viewBox={`0 0 ${n} ${n}`}
      role="img"
      aria-label={label}
      shapeRendering="crispEdges"
      className={cn("block rounded-xl bg-card dark:bg-foreground", className)}
      data-qr-value={value}
    >
      <title>{label}</title>
      <rect width={n} height={n} className="fill-card dark:fill-foreground" />
      <path d={qrPath(m)} className="fill-foreground dark:fill-card" />
    </svg>
  );
}
