// DESIGN.md §3: status colours as *text* on their own tint are below 4.5:1 in light mode (axe color-contrast),
// so a tinted status pill uses text-foreground and puts the status colour on its icon and border.
// Source guard: no class string in P5 UI pairs a text-sized `text-status-*` with a `bg-status-*/NN` tint.
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = path.resolve(__dirname, "..");
const DIRS = ["components/pods", "components/community", "components/trajectories", "components/lecturer", "components/momentum", "app/(app)"];
// components/keystone (StatusBadge, StatCard delta) is the shared barrel the shell agent is restyling: reported, not edited here.

function files(dir: string): string[] {
  const abs = path.join(ROOT, dir);
  if (!fs.existsSync(abs)) return [];
  return fs.readdirSync(abs, { withFileTypes: true }).flatMap((e) => {
    const rel = path.join(dir, e.name);
    if (e.isDirectory()) return files(rel);
    return /\.tsx$/.test(e.name) && !/\.test\.tsx$/.test(e.name) ? [rel] : [];
  });
}

/** Class strings ("…" or `…`) that put status-coloured, text-sized type on a status tint. */
export function offending(source: string): string[] {
  const strings = source.match(/"[^"\n]*"|`[^`\n]*`/g) ?? [];
  return strings.filter((s) =>
    /\bbg-status-[a-z]+\/\d+/.test(s) &&
    /\btext-status-[a-z]+\b/.test(s) &&
    /\b(text-(xs|sm|base|lg|\[\d+px\])|font-(medium|semibold|bold))\b/.test(s));
}

describe("status colours are never text on their own tint", () => {
  it("the detector flags text pills and ignores icon-only tints", () => {
    expect(offending(`<span className="bg-status-proven/10 text-xs font-medium text-status-proven">Merged</span>`)).toHaveLength(1);
    expect(offending(`<span className="bg-status-proven/10 text-xs font-medium text-foreground"><Icon className="text-status-proven" /></span>`)).toHaveLength(0);
    expect(offending(`<span className="flex size-7 rounded-lg bg-status-rising/10 text-status-rising"><Lightbulb /></span>`)).toHaveLength(0);
  });

  it.each(DIRS.flatMap(files))("%s", (file) => {
    expect(offending(fs.readFileSync(path.join(ROOT, file), "utf8"))).toEqual([]);
  });
});
