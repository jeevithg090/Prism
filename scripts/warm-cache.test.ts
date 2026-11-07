import { expect, it, vi } from "vitest";
import { main } from "./warm-cache";

const fsMock = vi.hoisted(() => ({ writeFile: vi.fn(async () => {}), mkdir: vi.fn(async () => undefined) }));
vi.mock("node:fs/promises", () => ({ default: fsMock }));
vi.mock("@/lib/agents/syllabus", () => ({ extractProgramme: vi.fn(async () => ({ source: "firecrawl" })) }));
vi.mock("@/lib/agents/trends", () => ({ getTrends: vi.fn(async () => []) }));
vi.mock("@/lib/agents/market", () => ({
  getRoles: () => [{ id: "ml-engineer" }, { id: "software-engineer" }, { id: "data-analyst" }],
  getRoleDemand: vi.fn(async () => ({ source: "adzuna" })),
}));

it("exports main and writes all 5 cache files", async () => {
  await main();
  expect(fsMock.writeFile).toHaveBeenCalledTimes(5);
});
