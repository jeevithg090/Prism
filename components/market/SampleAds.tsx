"use client";
// Industry Radar: a few real ads behind the numbers, plus who's hiring most.
import { ArrowUpRight } from "lucide-react";
import type { RoleDemand } from "@/lib/types";

export function SampleAds({ demand }: { demand: RoleDemand }) {
  const cached = demand.source === "cache";
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
      <div>
        <h3 className="mb-2 text-base font-semibold">Example ads</h3>
        <ul className="divide-y">
          {demand.sampleAds.map((a) => (
            <li key={`${a.title}|${a.company}`}>
              <a href={a.url} target="_blank" rel="noopener noreferrer" className="group flex items-center justify-between gap-3 rounded-lg py-3 outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <span className="min-w-0">
                  <span className="block font-medium group-hover:underline">{a.title}</span>
                  <span className="block text-sm text-muted-foreground">{a.company}</span>
                </span>
                <ArrowUpRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                <span className="sr-only">{cached ? "(opens a job search for this role in a new tab)" : "(opens in a new tab)"}</span>
              </a>
            </li>
          ))}
        </ul>
        {cached && <p className="mt-2 text-sm text-muted-foreground">From the saved snapshot: each link opens a live Adzuna search for that role.</p>}
      </div>
      <div>
        <h3 className="mb-2 text-base font-semibold">Hiring most</h3>
        <ol className="divide-y">
          {demand.topCompanies.map((c) => (
            <li key={c.name} className="flex items-center justify-between gap-3 py-3">
              <span className="font-medium">{c.name}</span>
              <span className="text-sm tabular-nums text-muted-foreground">{c.count} ads</span>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
