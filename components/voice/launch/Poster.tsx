// A campaign poster for /launch, set in real text (never an image of text).
// Plain component with no hooks, so it renders in server and client trees.

export type PosterTone = "indigo" | "paper" | "amber";

export type PosterProps = {
  headline: string;
  subline: string;
  tone: PosterTone;
  /** Short line printed at the top of the poster. */
  kicker?: string;
};

// Fixed print colours (posters look the same in light and dark mode).
// Every pair below is >= 7:1 contrast.
const TONES: Record<PosterTone, { surface: string; ink: string; soft: string; mark: string; qr: string }> = {
  indigo: {
    surface: "bg-[#1e1b4b]",
    ink: "text-white",
    soft: "text-indigo-100",
    mark: "bg-amber-300",
    qr: "bg-white text-[#1e1b4b]",
  },
  paper: {
    surface: "bg-[#f5f3ee]",
    ink: "text-[#1e1b4b]",
    soft: "text-[#312e81]",
    mark: "bg-[#4338ca]",
    qr: "bg-white text-[#1e1b4b]",
  },
  amber: {
    surface: "bg-amber-300",
    ink: "text-[#1e1b4b]",
    soft: "text-[#1e1b4b]",
    mark: "bg-[#1e1b4b]",
    qr: "bg-white text-[#1e1b4b]",
  },
};

/** QR placeholder: three finder squares and an empty middle, so nobody mistakes it for a real code. */
function QrPlaceholder({ className }: { className: string }) {
  return (
    <div className={`grid size-[22cqw] shrink-0 place-items-center rounded-md p-[1.6cqw] ${className}`}>
      <svg viewBox="0 0 42 42" className="size-full" aria-hidden="true" focusable="false">
        {[
          [0, 0],
          [28, 0],
          [0, 28],
        ].map(([x, y]) => (
          <g key={`${x}-${y}`} fill="currentColor">
            <path fillRule="evenodd" d={`M${x} ${y}h14v14h-14z M${x + 2.5} ${y + 2.5}v9h9v-9z`} />
            <rect x={x + 4.5} y={y + 4.5} width="5" height="5" />
          </g>
        ))}
        <text x="31" y="38" textAnchor="middle" fontSize="7" fontWeight="700" fill="currentColor">
          QR
        </text>
      </svg>
    </div>
  );
}

export function Poster({ headline, subline, tone, kicker = "Bridge Week · Keystone" }: PosterProps) {
  const t = TONES[tone];
  // Type, padding and the QR are sized in cqw (a share of the poster's own width), so the
  // whole poster scales like a print and keeps its 3:4 shape at every card width. Short
  // slogans get set bigger, like a real poster would.
  const size = headline.length <= 20 ? "text-[15cqw]" : "text-[10.5cqw]";
  return (
    // The wrapper is the size container; the article measures its cqw against it.
    <div className="@container w-full">
      <article
        className={`group relative flex aspect-[3/4] w-full flex-col justify-between gap-[5cqw] rounded-2xl p-[7cqw] ${t.surface} ${t.ink} motion-safe:transition-transform motion-safe:duration-200 motion-safe:ease-out motion-safe:hover:-translate-y-1`}
      >
        <div className="flex items-center gap-3">
          <span className={`block h-3 w-8 rounded-sm ${t.mark}`} aria-hidden="true" />
          <p className={`text-sm font-semibold ${t.soft}`}>{kicker}</p>
        </div>

        <div className="space-y-[4cqw]">
          <h3 className={`${size} font-extrabold leading-[0.95] tracking-tight text-balance`}>{headline}</h3>
          <p className={`max-w-[32ch] text-[clamp(1rem,4.6cqw,1.25rem)] leading-snug font-medium ${t.soft}`}>
            {subline}
          </p>
        </div>

        <div className="flex items-end justify-between gap-4">
          <p className={`max-w-[14ch] text-sm font-semibold leading-tight ${t.soft}`}>Scan to join · keystone landing</p>
          <QrPlaceholder className={t.qr} />
        </div>
      </article>
    </div>
  );
}
