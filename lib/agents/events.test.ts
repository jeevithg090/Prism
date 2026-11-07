import { describe, it, expect, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { emit, subscribe, newRunId, emitIf } from "./events";

const ev = (runId: string, message: string) => ({ runId, agent: "syllabus" as const, status: "progress" as const, message });

describe("events", () => {
  it("replays past events to late subscribers, then delivers new ones; unsubscribe stops delivery", () => {
    const id = newRunId();
    emit(ev(id, "a")); emit(ev(id, "b"));
    const got: string[] = [];
    const off = subscribe(id, (e) => got.push(e.message));
    expect(got).toEqual(["a", "b"]);
    emit(ev(id, "c"));
    expect(got).toEqual(["a", "b", "c"]);
    off(); emit(ev(id, "d"));
    expect(got).toEqual(["a", "b", "c"]);
  });
  it("caps the run log at 200", () => {
    const id = newRunId();
    for (let i = 0; i < 250; i++) emit(ev(id, String(i)));
    const got: string[] = [];
    subscribe(id, (e) => got.push(e.message))();
    expect(got).toHaveLength(200);
    expect(got[0]).toBe("50");
  });
  it("emitIf is a no-op without a runId", () => {
    expect(() => emitIf(undefined, "syllabus", "started", "x")).not.toThrow();
  });
});
