// @vitest-environment jsdom
import * as React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ProjectProgress } from "@/lib/schemas/studio";

const { apiGet } = vi.hoisted(() => ({ apiGet: vi.fn() }));
vi.mock("@/lib/fetcher", () => ({
  apiGet,
  apiPost: vi.fn(),
  apiPatch: vi.fn(),
}));

import {
  isMerged,
  useProjectProgress,
  withMerged,
} from "@/components/pods/useProjectProgress";

const progress: ProjectProgress = {
  podId: "pod_demo01",
  merged: [
    {
      issueIndex: 0,
      userId: "aisha",
      skillId: "docker",
      mergedAt: "2026-11-07T16:00:00.000Z",
    },
  ],
};

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

afterEach(cleanup);

describe("isMerged", () => {
  it("is true only for merged issue indexes", () => {
    expect(isMerged(progress, 0)).toBe(true);
    expect(isMerged(progress, 1)).toBe(false);
    expect(isMerged({ podId: "p", merged: [] }, 0)).toBe(false);
    expect(isMerged(undefined, 0)).toBe(false);
    expect(isMerged(null, 0)).toBe(false);
  });
});

describe("withMerged", () => {
  it("adds an entry once and creates progress when the cache is empty", () => {
    const entry = {
      podId: "pod_demo01",
      issueIndex: 2,
      userId: "mei",
      skillId: "python",
      mergedAt: "2026-11-07T17:00:00.000Z",
    };
    const next = withMerged(progress, entry);
    expect(isMerged(next, 2)).toBe(true);
    expect(next.merged).toHaveLength(2);
    expect(withMerged(next, entry)).toBe(next);
    expect(withMerged(undefined, entry)).toEqual({
      podId: "pod_demo01",
      merged: [
        {
          issueIndex: 2,
          userId: "mei",
          skillId: "python",
          mergedAt: entry.mergedAt,
        },
      ],
    });
  });
});

describe("useProjectProgress", () => {
  beforeEach(() => apiGet.mockReset());

  it("fetches GET /api/projects/progress?podId=", async () => {
    apiGet.mockResolvedValue(progress);
    const { result } = renderHook(() => useProjectProgress("pod_demo01"), {
      wrapper,
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(apiGet).toHaveBeenCalledWith(
      "/api/projects/progress?podId=pod_demo01",
    );
    expect(isMerged(result.current.data, 0)).toBe(true);
  });

  it("does not fetch without a podId", () => {
    renderHook(() => useProjectProgress(undefined), { wrapper });
    expect(apiGet).not.toHaveBeenCalled();
  });
});
