import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { getRoleDemand, getRoles } from "@/lib/agents/market";
import { extractProgramme } from "@/lib/agents/syllabus";
import { getTrends } from "@/lib/agents/trends";

const UOM_URL = "https://www.manchester.ac.uk/study/undergraduate/courses/2027/00560/bsc-computer-science/";

const save = async (key: string, value: unknown) => {
  const dir = path.join(process.cwd(), "data/cache");
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, `${key}.json`), JSON.stringify(value, null, 2));
  console.log(`Saved ${key}.json`);
};

/** Each step is independent: one failure leaves the existing file in place and the rest still run. */
export async function main(): Promise<void> {
  const steps: [string, () => Promise<unknown>][] = [
    ["syllabus-uom-bsc-cs", () => extractProgramme({ url: UOM_URL, programmeId: "uom-bsc-cs" })],
    ...getRoles().map(({ id }): [string, () => Promise<unknown>] => [
      `market-${id}-uk`,
      () => getRoleDemand(id, { refresh: true }),
    ]),
    ["trends", () => getTrends()],
  ];
  for (const [key, run] of steps) {
    try {
      const value = (await run()) as { source?: string };
      if (value.source === "cache") console.log(`Skipped ${key}: no live keys, only stored data available`);
      else await save(key, value);
    } catch (err) {
      console.error(`Skipped ${key}: ${err instanceof Error ? err.message : err}`);
    }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
