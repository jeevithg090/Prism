import { describe, expect, it } from "vitest";
import { cn, fmtGBP, pct } from "./utils";

describe("cn", () => {
  it("joins conditional classes and lets later Tailwind utilities win", () => {
    expect(cn("px-2 py-1", false && "hidden", { "font-semibold": true }, "px-4")).toBe("py-1 font-semibold px-4");
    expect(cn("bg-card", undefined, null, "bg-primary")).toBe("bg-primary");
  });
});

describe("pct", () => {
  it("rounds a 0–1 share to a whole percentage", () => {
    expect(pct(0.384)).toBe("38%");
    expect(pct(0.995)).toBe("100%");
    expect(pct(0)).toBe("0%");
  });
});

describe("fmtGBP", () => {
  it("shows thousands as £Nk and smaller amounts in pounds", () => {
    expect(fmtGBP(32500)).toBe("£33k");
    expect(fmtGBP(1000)).toBe("£1k");
    expect(fmtGBP(999.6)).toBe("£1k");
    expect(fmtGBP(999.4)).toBe("£999");
    expect(fmtGBP(450)).toBe("£450");
  });
});
