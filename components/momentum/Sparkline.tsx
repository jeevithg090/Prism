// Dependency-free area sparkline (full width × `height`px, primary colour, no axes).
// Recharts can't be used yet: its peer dependency `react-is` isn't installed in this repo.
export function Sparkline({ values, height = 64 }: { values: number[]; height?: number }) {
  const max = Math.max(1, ...values);
  const pad = 4;
  const pts = values.map((v, i) => [
    values.length === 1 ? 50 : (i / (values.length - 1)) * 100,
    pad + (1 - v / max) * (height - 2 * pad),
  ]);
  const line = pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(2)},${y.toFixed(2)}`).join(" ");
  return (
    <svg
      data-testid="momentum-sparkline"
      viewBox={`0 0 100 ${height}`}
      preserveAspectRatio="none"
      width="100%"
      height={height}
      aria-hidden="true"
      focusable="false"
      className="block overflow-visible"
    >
      {pts.length > 0 && (
        <>
          <path d={`${line} L100,${height} L0,${height} Z`} fill="var(--primary)" fillOpacity={0.12} />
          <path d={line} fill="none" stroke="var(--primary)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
        </>
      )}
    </svg>
  );
}
