import { beforeEach, describe, expect, it, vi } from "vitest";
import type { InterviewPrepSlice } from "@/lib/agents/interview-prep";
import * as IP from "@/lib/agents/interview-prep";
import { POST } from "./route";

// Spy on the live binding so the route's imported `buildInterviewPrep` is controlled in tests.
const prepMock = vi.spyOn(IP, "buildInterviewPrep");

const request = (body: unknown) =>
  new Request("http://localhost/api/interview/prep", { method: "POST", body: JSON.stringify(body) });

const prep: InterviewPrepSlice[] = [
  {
    skillId: "docker",
    questions: [
      { id: "prep-docker-q1", skillId: "docker", question: "What's the difference between a Docker image and a container?", type: "technical", difficulty: 1, tip: "An image is the read-only template; a container is a running instance." },
    ],
    focus: "Focus on Docker: it's your biggest gap for ML engineer roles.",
  },
];

describe("POST /api/interview/prep", () => {
  beforeEach(() => {
    prepMock.mockReset();
  });

  it("valid body returns an ok envelope with the prep", async () => {
    prepMock.mockResolvedValue(prep);
    const res = await POST(request({ userId: "aisha", roleId: "ml-engineer" }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.data).toEqual(prep);
    expect(prepMock.mock.calls[0][0]).toEqual({ userId: "aisha", roleId: "ml-engineer" });
  });

  it("omits optional fields when not provided", async () => {
    prepMock.mockResolvedValue(prep);
    await POST(request({ userId: "aisha" }));
    expect(prepMock.mock.calls[0][0]).toEqual({ userId: "aisha" });
  });

  it("invalid body returns badRequest", async () => {
    const res = await POST(request({}));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.ok).toBe(false);
    expect(json.error.code).toBe("bad_request");
  });

  it("non-JSON body returns badRequest", async () => {
    const res = await POST(new Request("http://localhost/api/interview/prep", { method: "POST", body: "not json" }));
    expect(res.status).toBe(400);
  });

  it("buildInterviewPrep throwing returns internal", async () => {
    prepMock.mockRejectedValue(new Error("boom"));
    const res = await POST(request({ userId: "aisha" }));
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.ok).toBe(false);
    expect(json.error.code).toBe("internal");
  });
});
