// npm run seed: validates the P5 demo data and upserts it into the store
// (students → profiles, trajectories → trajectories, help → help), then logs counts.
//
// `@/lib/store` starts with `import "server-only"`. That package throws unless it is resolved under the
// `react-server` export condition (where it is a no-op), so this script re-runs itself once with
// `--conditions=react-server` before importing the store.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const CONDITION = "--conditions=react-server";
const REEXEC_FLAG = "KS_SEED_REEXEC";

function readJSON(rel: string): unknown {
  return JSON.parse(fs.readFileSync(path.join(process.cwd(), rel), "utf8"));
}

function reexecWithReactServerCondition(): never {
  const result = spawnSync(process.execPath, [...process.execArgv, CONDITION, ...process.argv.slice(1)], {
    stdio: "inherit",
    env: { ...process.env, [REEXEC_FLAG]: "1" },
  });
  if (result.error) console.error("seed: could not re-run with the react-server condition:", result.error.message);
  process.exit(result.status ?? 1);
}

async function main() {
  if (!process.execArgv.includes(CONDITION) && process.env[REEXEC_FLAG] !== "1") reexecWithReactServerCondition();

  const { getStore } = await import("@/lib/store");
  const { ProfileZ, TrajectoryZ, HelpRequestZ } = await import("@/lib/schemas/community");
  const store = getStore();

  const students = ProfileZ.array().parse(readJSON("data/seed/students.json"));
  const trajectories = TrajectoryZ.array().parse(readJSON("data/seed/trajectories.json"));
  const help = HelpRequestZ.array().parse(readJSON("data/fixtures/help.json"));

  for (const s of students) await store.upsert("profiles", s.id, s, s.id);
  for (const t of trajectories) await store.upsert("trajectories", t.id, t, t.userId);
  for (const h of help) await store.upsert("help", h.id, h, h.fromUserId);

  const [profiles, trajs, helps] = await Promise.all([
    store.list("profiles"),
    store.list("trajectories"),
    store.list("help"),
  ]);
  console.log(`seed: upserted ${students.length} students, ${trajectories.length} trajectories, ${help.length} help requests`);
  console.log(`seed: store now has profiles=${profiles.length} trajectories=${trajs.length} help=${helps.length}`);
}

main().catch((err) => {
  console.error("seed failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
