"use client";

import { useQuery } from "@tanstack/react-query";
import { useMemo, useState, useSyncExternalStore } from "react";
import { toast } from "sonner";
import { MarketView } from "@/components/market/MarketView";
import { RoleTabs } from "@/components/market/RoleTabs";
import { PageHeader } from "@/components/keystone";
import { apiGet } from "@/lib/fetcher";
import type { BridgeMap, Role, RoleDemand, Skill, SkillId, SkillStatus, TrendSeries } from "@/lib/types";

const FALLBACK_ROLES: Role[] = [
  { id: "ml-engineer", name: "ML engineer" },
  { id: "software-engineer", name: "Software engineer" },
  { id: "data-analyst", name: "Data analyst" },
];
const START_PICKED: SkillId[] = ["llm-evaluation", "docker", "python"];
const MAX_PICKED = 4;
const subscribeNever = () => () => {};
const getClientUserId = () => document.cookie.match(/(?:^|;\s*)ks_uid=([^;]+)/)?.[1] ?? "aisha";

export default function MarketPage() {
  const [roleId, setRoleId] = useState(FALLBACK_ROLES[0].id);
  const userId = useSyncExternalStore(subscribeNever, getClientUserId, () => "aisha");
  // Each skill keeps its colour slot while picked, so removing one never repaints the others.
  const [slots, setSlots] = useState<(SkillId | null)[]>([...START_PICKED, null]);

  const roles = useQuery({ queryKey: ["roles"], queryFn: () => apiGet<Role[]>("/api/roles") });
  const market = useQuery({
    queryKey: ["market", roleId],
    queryFn: () => apiGet<RoleDemand>(`/api/market/${roleId}`),
  });
  const trends = useQuery({ queryKey: ["trends"], queryFn: () => apiGet<TrendSeries[]>("/api/trends") });
  const skills = useQuery({ queryKey: ["skills"], queryFn: () => apiGet<Skill[]>("/api/skills") });
  const graph = useQuery({
    queryKey: ["graph", userId, roleId],
    queryFn: () => apiGet<BridgeMap>(`/api/graph/${userId}?roleId=${roleId}`),
    retry: false,
  });

  const statusBySkill = useMemo(() => {
    const entries = graph.data?.nodes.map((n): [SkillId, SkillStatus] => [n.skillId, n.status]) ?? [];
    return Object.fromEntries(entries);
  }, [graph.data]);
  const names = useMemo(
    () => Object.fromEntries((skills.data ?? []).map((s) => [s.id, s.name])),
    [skills.data],
  );

  const addSkill = (id: SkillId) =>
    setSlots((current) => {
      const free = current.indexOf(null);
      if (current.includes(id) || free === -1) return current;
      return current.map((s, i) => (i === free ? id : s));
    });
  const removeSkill = (id: SkillId) => setSlots((current) => current.map((s) => (s === id ? null : s)));

  const refresh = async () => {
    await apiGet<RoleDemand>(`/api/market/${roleId}?refresh=1`);
    await market.refetch();
    toast.success("Updated with today's ads");
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Industry Radar"
        subtitle="What UK employers are hiring for right now, and where it's heading."
        actions={
          <button type="button" onClick={refresh} className="rounded-xl border border-border bg-card px-4 py-2 text-sm font-medium">
            Refresh
          </button>
        }
      />
      <RoleTabs roles={roles.data ?? FALLBACK_ROLES} value={roleId} onChange={setRoleId} />
      <MarketView
        market={market.data}
        trends={trends.data ?? []}
        slots={slots}
        maxPicked={MAX_PICKED}
        names={names}
        statusBySkill={statusBySkill}
        isLoading={market.isLoading}
        isError={market.isError}
        refetch={() => market.refetch()}
        onPick={addSkill}
        onRemove={removeSkill}
      />
    </div>
  );
}
