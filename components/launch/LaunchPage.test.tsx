// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@/components/launch/actions", () => ({ joinWaitlist: vi.fn(async () => ({ status: "idle", message: "" })) }));

import LaunchPage from "@/app/launch/page";
import { qrMatrix } from "./qr";
import { CAMPUSES } from "./data";

afterEach(cleanup);

describe("/launch", () => {
  it("renders the hero, the three posters as real headings, all 10 campuses and the pilot plan", () => {
    render(<LaunchPage />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Your degree is the foundation. Build the bridge.");
    for (const h of ["Don't pay for a course your degree already teaches.", "Proof, not claims.", "Find your pod."]) {
      expect(screen.getByRole("heading", { level: 3, name: h })).toBeInTheDocument();
    }
    const tour = screen.getByRole("region", { name: /10 campuses/ });
    expect(within(tour).getAllByRole("listitem")).toHaveLength(10);
    expect(CAMPUSES).toHaveLength(10);
    expect(screen.getByText("500")).toBeInTheDocument();
    expect(screen.getByText("100")).toBeInTheDocument();
    expect(screen.getAllByRole("img", { name: /QR code/ }).length).toBe(4);
    expect(screen.getByRole("button", { name: /Join the waitlist/ })).toBeInTheDocument();
    expect(document.querySelector('[data-level="launch-campaign"]')).not.toBeNull();
  });

  it("copies the LinkedIn post", async () => {
    const user = userEvent.setup();
    const write = vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue();
    render(<LaunchPage />);
    await user.click(screen.getByRole("button", { name: /Copy post/ }));
    expect(write).toHaveBeenCalledWith(expect.stringContaining("#BridgeWeek"));
    expect(await screen.findByText(/Copied\. Edit it before you post/)).toBeInTheDocument();
  });
});

describe("qrMatrix", () => {
  it("builds a version-sized symbol with the three finder patterns", () => {
    const m = qrMatrix("http://localhost:3000/");
    expect(m.length).toBe(25); // version 2
    for (const [x, y] of [[0, 0], [18, 0], [0, 18]]) {
      expect(m[y][x] && m[y][x + 6] && m[y + 6][x] && m[y + 3][x + 3]).toBe(true);
      expect(m[y + 1][x + 1]).toBe(false);
    }
    expect(qrMatrix("x".repeat(150)).length).toBe(4 * 8 + 17); // 150 bytes fits version 8-M (152)
    expect(() => qrMatrix("x".repeat(400))).toThrow();
  });
});
