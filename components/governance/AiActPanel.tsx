// "EU AI Act: Keystone is decision support" (three plain sentences, no legal advice).
import { GraduationCap, ScrollText, UserCheck, type LucideIcon } from "lucide-react";

const POINTS: { icon: LucideIcon; text: string }[] = [
  { icon: GraduationCap, text: "We never grade you for credit." },
  { icon: UserCheck, text: "People approve every consequential step." },
  { icon: ScrollText, text: "Every recommendation is explained, and every agent step is logged." },
];

export function AiActPanel() {
  return (
    <section aria-labelledby="ai-act-title" className="rounded-2xl border bg-card p-6 shadow-sm">
      <h2 id="ai-act-title" className="text-xl font-semibold text-balance text-foreground">EU AI Act: Keystone is decision support</h2>
      <ul className="mt-5 grid divide-y md:grid-cols-3 md:divide-x md:divide-y-0">
        {POINTS.map(({ icon: Icon, text }) => (
          <li key={text} className="flex items-start gap-3 py-3 first:pt-0 last:pb-0 md:px-6 md:py-0 md:first:pl-0 md:last:pr-0">
            <Icon className="mt-1 size-5 shrink-0 text-muted-foreground" aria-hidden />
            <span className="text-base font-medium text-pretty text-foreground md:text-lg">{text}</span>
          </li>
        ))}
      </ul>
      <p className="mt-5 border-t pt-4 text-sm text-muted-foreground">How we design Keystone, not legal advice.</p>
    </section>
  );
}
