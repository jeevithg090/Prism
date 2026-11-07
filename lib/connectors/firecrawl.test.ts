import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fcCrawl, fcScrapeJSON, fcScrapeMarkdown, fcSearch, FirecrawlError } from "./firecrawl";

const sdk = vi.hoisted(() => ({ search: vi.fn(), scrape: vi.fn(), crawl: vi.fn() }));
vi.mock("@mendable/firecrawl-js", () => ({
  Firecrawl: class {
    search = sdk.search;
    scrape = sdk.scrape;
    crawl = sdk.crawl;
  },
}));

beforeEach(() => {
  Object.values(sdk).forEach((m) => m.mockReset());
  vi.stubEnv("FIRECRAWL_API_KEY", "test");
  vi.stubEnv("DEMO_MODE", "false");
});
afterEach(() => vi.unstubAllEnvs());

describe("firecrawl connector", () => {
  it("normalises search hits and skips those with no url", async () => {
    sdk.search.mockResolvedValue({
      web: [{ url: "https://a", title: "A" }, { metadata: { sourceURL: "https://b", title: "B" } }, { title: "none" }],
    });
    await expect(fcSearch("q")).resolves.toEqual([
      { url: "https://a", title: "A", description: undefined },
      { url: "https://b", title: "B", description: undefined },
    ]);
  });

  it("accepts the options form and returns nothing when search fails", async () => {
    sdk.search.mockRejectedValue(new Error("down"));
    await expect(fcSearch("q", { limit: 5 })).resolves.toEqual([]);
    expect(sdk.search.mock.calls[0][1]).toEqual({ limit: 5 });
  });

  it("returns nothing without a key", async () => {
    vi.stubEnv("FIRECRAWL_API_KEY", "");
    await expect(fcSearch("q")).resolves.toEqual([]);
    expect(sdk.search).not.toHaveBeenCalled();
  });

  it("returns markdown, or an empty string when the page has none", async () => {
    sdk.scrape.mockResolvedValueOnce({ markdown: "# hi" }).mockResolvedValueOnce({});
    await expect(fcScrapeMarkdown("https://a")).resolves.toBe("# hi");
    await expect(fcScrapeMarkdown("https://a")).resolves.toBe("");
  });

  it("requests JSON extraction with the schema and prompt", async () => {
    sdk.scrape.mockResolvedValue({ json: { units: [] } });
    await expect(fcScrapeJSON("https://a", { type: "object" }, "p")).resolves.toEqual({ units: [] });
    expect(sdk.scrape.mock.calls[0][1].formats[0]).toEqual({ type: "json", schema: { type: "object" }, prompt: "p" });
  });

  it("maps crawl pages to url and markdown", async () => {
    sdk.crawl.mockResolvedValue({ data: [{ markdown: "m", metadata: { sourceURL: "https://a" } }] });
    await expect(fcCrawl("https://a", { limit: 5 })).resolves.toEqual([{ url: "https://a", markdown: "m" }]);
  });

  it("wraps SDK failures in FirecrawlError", async () => {
    sdk.scrape.mockRejectedValue(new Error("blocked"));
    await expect(fcScrapeMarkdown("https://a")).rejects.toBeInstanceOf(FirecrawlError);
  });
});
