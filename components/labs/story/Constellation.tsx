"use client";
// Story Mode: the connect-the-dots map. Every agent in the story sits on a ring; each beat lights the handoff
// from the agent that acted to the agent that uses its output. By the last beat the flywheel is closed.
import * as React from "react";
import { AGENT_META } from "@/components/keystone";
import type { StoryBeat } from "@/lib/labs/story/schema";
import type { AgentName } from "@/lib/types";
import { cn } from "@/lib/utils";

const SIZE = 320;
const R = 122;
const NODE = 19;

export function Constellation({ agents, beats, current }: { agents: AgentName[]; beats: StoryBeat[]; current: number }) {
  const [asList, setAsList] = React.useState(false);
  const pos = React.useMemo(() => {
    const m = new Map<AgentName, { x: number; y: number }>();
    agents.forEach((a, i) => {
      const t = (i / agents.length) * Math.PI * 2 - Math.PI / 2;
      m.set(a, { x: SIZE / 2 + R * Math.cos(t), y: SIZE / 2 + R * Math.sin(t) });
    });
    return m;
  }, [agents]);
  const beat = beats[current];
  const visited = beats.slice(0, current + 1);
  const lit = new Set(visited.flatMap((b) => [b.agent, ...b.with, b.handoff.toAgent]));
  const label = (a: AgentName) => AGENT_META[a]?.name ?? a;
  const summary = beat
    ? `${visited.length} of ${beats.length} handoffs lit. Now: ${label(beat.agent)} hands ${beat.handoff.carries} to ${label(beat.handoff.toAgent)}.`
    : "";

  return (
    <div className="space-y-3">
      {asList ? (
        <ol className="space-y-1.5 text-sm">
          {beats.map((b, i) => (
            <li key={b.id} className={cn("rounded-lg px-2 py-1", i === current && "bg-primary/10 font-medium", i > current && "text-muted-foreground")}>
              {label(b.agent)} to {label(b.handoff.toAgent)}: {b.handoff.carries}
            </li>
          ))}
        </ol>
      ) : (
        <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="mx-auto block w-full max-w-[280px]" role="img" aria-label={summary}>
          {beats.map((b, i) => {
            const from = pos.get(b.agent);
            const to = pos.get(b.handoff.toAgent);
            if (!from || !to || i > current) return null;
            const now = i === current;
            const mx = (from.x + to.x) / 2 + (SIZE / 2 - (from.x + to.x) / 2) * 0.35;
            const my = (from.y + to.y) / 2 + (SIZE / 2 - (from.y + to.y) / 2) * 0.35;
            return (
              <path
                key={b.id}
                d={`M ${from.x} ${from.y} Q ${mx} ${my} ${to.x} ${to.y}`}
                fill="none"
                strokeLinecap="round"
                className={cn(now ? "stroke-primary" : "stroke-primary/35")}
                strokeWidth={now ? 3.5 : 2}
              />
            );
          })}
          {agents.map((a) => {
            const p = pos.get(a)!;
            const Icon = AGENT_META[a]?.icon;
            const acting = beat?.agent === a;
            const receiving = beat?.handoff.toAgent === a;
            return (
              <g key={a}>
                <title>{label(a)}</title>
                <circle
                  cx={p.x} cy={p.y} r={NODE}
                  className={cn(
                    "stroke-2",
                    acting ? "fill-primary stroke-primary" : receiving ? "fill-primary/15 stroke-primary" : lit.has(a) ? "fill-card stroke-primary/50" : "fill-muted stroke-border",
                  )}
                />
                {Icon && (
                  <svg x={p.x - 9} y={p.y - 9} width={18} height={18} overflow="visible" aria-hidden className={cn(acting ? "text-primary-foreground" : lit.has(a) ? "text-foreground" : "text-muted-foreground")}>
                    <Icon className="size-full" aria-hidden />
                  </svg>
                )}
              </g>
            );
          })}
        </svg>
      )}
      <p className="text-sm text-muted-foreground">
        {beat && (
          <>
            <span className="font-medium text-foreground">{label(beat.agent)}</span> hands {beat.handoff.carries} to{" "}
            <span className="font-medium text-foreground">{label(beat.handoff.toAgent)}</span>.
          </>
        )}
      </p>
      <button
        type="button"
        onClick={() => setAsList((v) => !v)}
        className="rounded-md text-sm font-medium text-primary underline-offset-4 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
      >
        {asList ? "View as map" : "View as list"}
      </button>
    </div>
  );
}
