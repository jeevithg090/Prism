import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { WORKFLOWS } from "@/lib/voice/schemas";

type Node = { name: string; type: string; parameters: Record<string, unknown>; credentials?: Record<string, { id: string }> };
const dir = path.join(process.cwd(), "n8n");
const files = fs.readdirSync(dir).filter((f) => f.endsWith(".json")).sort();

describe("n8n workflow exports", () => {
  it("has W1…W6, one per Keystone workflow name", () => {
    expect(files.map((f) => f.slice(0, 2))).toEqual(["W1", "W2", "W3", "W4", "W5", "W6"]);
    for (const wf of WORKFLOWS) expect(files.some((f) => f.endsWith(`${wf}.json`))).toBe(true);
  });

  for (const f of files) {
    it(`${f} is importable: unique nodes, valid connections, webhook path, placeholder credentials only`, () => {
      const wf = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")) as { name: string; nodes: Node[]; connections: Record<string, { main: { node: string }[][] }> };
      expect(wf.name).toMatch(/^Keystone W\d/);
      const names = wf.nodes.map((n) => n.name);
      expect(new Set(names).size).toBe(names.length);
      for (const [from, c] of Object.entries(wf.connections)) {
        expect(names).toContain(from);
        c.main.flat().forEach((t) => expect(names).toContain(t.node));
      }
      const hook = wf.nodes.find((n) => n.type === "n8n-nodes-base.webhook");
      expect(hook?.parameters.path).toBe(f.replace(/^W\d-/, "").replace(/\.json$/, ""));
      expect(hook?.parameters.authentication).toBe("headerAuth");
      for (const n of wf.nodes) for (const c of Object.values(n.credentials ?? {})) expect(c.id).toMatch(/^REPLACE_ME/);
      expect(JSON.stringify(wf)).not.toMatch(/sk_[a-z0-9]{20,}|xi-api-key"\s*:\s*"[a-z0-9]{20,}/i);
    });
  }

  it("W2 calls ElevenLabs TTS and posts to Discord; W3 posts to Discord and responds", () => {
    const read = (n: string) => JSON.parse(fs.readFileSync(path.join(dir, n), "utf8")) as { nodes: Node[] };
    const w2 = read("W2-monday-briefing.json").nodes;
    expect(w2.some((n) => String(n.parameters.url ?? "").includes("api.elevenlabs.io/v1/text-to-speech"))).toBe(true);
    expect(w2.some((n) => n.type === "n8n-nodes-base.discord")).toBe(true);
    expect(w2.some((n) => n.type === "n8n-nodes-base.scheduleTrigger")).toBe(true);
    const w3 = read("W3-pod-kickoff.json").nodes;
    expect(w3.some((n) => n.type === "n8n-nodes-base.discord")).toBe(true);
    expect(w3.some((n) => n.type === "n8n-nodes-base.respondToWebhook")).toBe(true);
  });
});
