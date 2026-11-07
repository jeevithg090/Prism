// "EU AI Act: Keystone is decision support" (three plain sentences, no legal advice).
import { GraduationCap, ScrollText, UserCheck, type LucideIcon } from "lucide-react";

const POINTS: { icon: LucideIcon; text: string }[] = [
  { icon: GraduationCap, text: "We never grade you for credit." },
  { icon: UserCheck, text: "People approve every consequential step." },
  { icon: ScrollText, text: "Every recommendation is explained, and every agent step is logged." },
];

export function AiActPanel() {
  return (
    <section aria-labelledby="ai-act-title" className="rounded-2xl border border-primary/20 bg-primary/5 p-6 shadow-sm">
      <h2 id="ai-act-title" className="text-xl font-semibold">EU AI Act: Keystone is decision support</h2>
      <ul className="mt-4 grid gap-3 md:grid-cols-3">
        {POINTS.map(({ icon: Icon, text }) => (
          <li key={text} className="flex items-start gap-3 rounded-xl bg-card p-4">
            <span className="rounded-full bg-primary/10 p-2 text-primary"><Icon className="size-5" aria-hidden /></span>
            <span className="pt-1 font-medium">{text}</span>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-[13px] text-muted-foreground">How we design Keystone, not legal advice.</p>
    </section>
  );
}
