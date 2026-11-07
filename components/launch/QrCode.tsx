// Inline SVG QR code (components/launch/qr.ts): always dark on white so phones can scan it in either theme.
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
      className={cn("block rounded-xl bg-white", className)}
      data-qr-value={value}
    >
      <title>{label}</title>
      <rect width={n} height={n} fill="#FFFFFF" />
      <path d={qrPath(m)} fill="#0F172A" />
    </svg>
  );
}
