"use client";
// Industry Radar: the 3 headline numbers, each with its context line.
import { StatCard } from "@/components/keystone";
import type { RoleDemand } from "@/lib/types";
import { fmtSalary, monthLabel, roleInSentence } from "./summaries";

export function MarketStats({ demand }: { demand: RoleDemand }) {
  const role = roleInSentence(demand.roleName);
  const top = demand.topCompanies[0];
  const when = demand.snapshotAt ? `${new Date(demand.snapshotAt).getUTCDate()} ${monthLabel(demand.snapshotAt.slice(0, 7))}` : "";
  return (
    <div className="grid gap-4 md:grid-cols-3">
      <StatCard label="Ads analysed" value={<span className="font-mono">{demand.adsAnalysed}</span>} hint={`${demand.roleName} ads in the ${demand.location}${when ? ` · ${demand.source === "cache" ? "snapshot from" : "read on"} ${when}` : ""}`} />
      <StatCard
        label="Median salary"
        value={<span className="font-mono">{demand.salary ? fmtSalary(demand.salary.median) : "–"}</span>}
        hint={demand.salary ? `Middle half of ${role} ads pay ${fmtSalary(demand.salary.p25)}–${fmtSalary(demand.salary.p75)}` : "Too few ads list a salary to give a fair figure"}
      />
      <StatCard label="Top hirer" value={top ? top.name : "–"} hint={top ? `${top.count} of ${demand.adsAnalysed} ads` : "No employer stands out yet"} />
    </div>
  );
}
