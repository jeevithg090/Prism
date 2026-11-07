import fs from "node:fs/promises";
import path from "node:path";
import { getSkills, matchSkills } from "@/lib/agents/skillmap";
import { buildSeries } from "@/lib/agents/trends";
import { mapLimit } from "@/lib/concurrency";
import { getComments, listWhoIsHiring } from "@/lib/connectors/hn";
import type { TrendPoint } from "@/lib/types";

const MONTHS = 36;
const KEEP_SKILLS = 40;
const ALWAYS_KEEP = ["docker", "python", "sql", "llm-apps", "llm-evaluation", "vector-databases", "rag", "mlops", "kubernetes", "aws"];

async function main() {
  const threads = await listWhoIsHiring(MONTHS);
  console.log(`Found ${threads.length} monthly threads`);

  const counted = await mapLimit(threads, 3, async ({ id, month }) => {
    const comments = await getComments(id);
    const counts = new Map<string, number>();
    for (const comment of comments) {
      for (const { skillId } of matchSkills(comment)) counts.set(skillId, (counts.get(skillId) ?? 0) + 1);
    }
    console.log(`${month}: ${comments.length} comments`);
    return { month, total: comments.length, counts };
  });

  const usable = counted.filter((c) => c.total > 0);
  const latest = usable.slice(-6);
  const recentShare = (id: string) =>
    latest.reduce((sum, m) => sum + (m.counts.get(id) ?? 0) / m.total, 0) / latest.length;
  const ranked = getSkills().map((s) => s.id).sort((a, b) => recentShare(b) - recentShare(a));
  const keep = [...new Set([...ALWAYS_KEEP, ...ranked.slice(0, KEEP_SKILLS)])];

  const raw: Record<string, TrendPoint[]> = {};
  for (const id of keep) {
    raw[id] = usable.map((m) => ({ month: m.month, share: Math.round(((m.counts.get(id) ?? 0) / m.total) * 1e4) / 1e4 }));
  }

  const dir = path.join(process.cwd(), "data/cache");
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, "trends-raw.json"), JSON.stringify(raw, null, 2));
  await fs.writeFile(path.join(dir, "trends.json"), JSON.stringify(buildSeries(raw), null, 2));
  console.log(`Wrote ${keep.length} skills over ${usable.length} months`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
