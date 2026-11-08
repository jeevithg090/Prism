"use client";
// Industry Radar: the 3 headline numbers, each with its context line, in one strip above the demand list and trends.
import { StatCard } from "@/components/keystone";
import type { RoleDemand } from "@/lib/types";
import { fmtSalary, monthLabel, roleInSentence } from "./summaries";

/** The three figures share one cotton card, split by hairlines: each StatCard drops its own card. */
const FLAT = "rounded-none border-0 bg-transparent shadow-none";

export function MarketStats({ demand }: { demand: RoleDemand }) {
  const role = roleInSentence(demand.roleName);
  const top = demand.topCompanies[0];
  const when = demand.snapshotAt ? `${new Date(demand.snapshotAt).getUTCDate()} ${monthLabel(demand.snapshotAt.slice(0, 7))}` : "";
  return (
    <div className="grid divide-y rounded-2xl border bg-card shadow-sm sm:grid-cols-3 sm:divide-x sm:divide-y-0">
      <div>
        <StatCard className={FLAT} label="Ads analysed" value={<span>{demand.adsAnalysed}</span>} hint={`${demand.roleName} ads in the ${demand.location}${when ? `, ${demand.source === "cache" ? "snapshot from" : "read on"} ${when}` : ""}`} />
      </div>
      <div>
        <StatCard
          className={FLAT}
          label="Median salary"
          value={demand.salary ? <span>{fmtSalary(demand.salary.median)}</span> : <span className="font-sans">None yet</span>}
          hint={demand.salary ? `Middle half of ${role} ads pay ${fmtSalary(demand.salary.p25)} to ${fmtSalary(demand.salary.p75)}` : "Too few ads list a salary to give a fair figure"}
        />
      </div>
      <div>
        <StatCard className={FLAT} label="Top hirer" value={<span className="font-sans">{top ? top.name : "None yet"}</span>} hint={top ? `${top.count} of ${demand.adsAnalysed} ads` : "No employer stands out yet"} />
      </div>
    </div>
  );
}
