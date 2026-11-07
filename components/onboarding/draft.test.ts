import { describe, expect, it } from "vitest";
import { ProfileZ } from "@/lib/schemas/community";
import { DEFAULT_DRAFT, programmeIdFromUrl, theorySentence, toProfileInput, UOM_CS_URL, validateStep, type OnboardDraft } from "./draft";

const filled: OnboardDraft = { ...DEFAULT_DRAFT, name: "Aisha Rahman", roleId: "ml-engineer", timeline: "placement-2027", hoursPerWeek: 8, theoryPractice: 70, badges: ["new-to-uni"], githubLogin: "aisha-r" };

describe("onboarding draft", () => {
  it("validates each step", () => {
    expect(validateStep(0, DEFAULT_DRAFT)).toEqual({ name: expect.stringMatching(/Add your name/) });
    expect(validateStep(0, { ...DEFAULT_DRAFT, name: "Aisha", programmeUrl: "manchester" })).toEqual({ programmeUrl: expect.stringMatching(/https:\/\//) });
    expect(validateStep(0, filled)).toEqual({});
    expect(Object.keys(validateStep(1, DEFAULT_DRAFT)).sort()).toEqual(["roleId", "timeline"]);
    expect(validateStep(1, filled)).toEqual({});
    expect(validateStep(2, { ...filled, formats: [] })).toEqual({ formats: "Pick at least one way you like to learn." });
    expect(validateStep(3, { ...filled, githubLogin: "bad name!" })).toHaveProperty("githubLogin");
    expect(validateStep(3, { ...filled, githubLogin: "" })).toEqual({});
  });

  it("describes the theory ↔ practice slider in words", () => {
    expect(theorySentence(70)).toBe("Mostly building (70%), some reading (30%)");
    expect(theorySentence(20)).toBe("Mostly reading (80%), some building (20%)");
    expect(theorySentence(50)).toBe("Half building, half reading (50/50)");
  });

  it("maps the UoM page to the cached programme and other pages to their own id", () => {
    expect(programmeIdFromUrl(UOM_CS_URL)).toBe("uom-bsc-cs");
    expect(programmeIdFromUrl("https://www.leeds.ac.uk/courses/bsc-computer-science")).toBe("leeds-bsc-computer-science");
    expect(programmeIdFromUrl("not a url")).toBe("custom-programme");
  });

  it("builds a contract-valid Profile (without id) from the draft", () => {
    const p = toProfileInput(filled);
    expect(ProfileZ.omit({ id: true }).parse(p)).toEqual(p);
    expect(p).toMatchObject({
      name: "Aisha Rahman", programmeId: "uom-bsc-cs", year: 1, startedAt: "2026-09-21", githubLogin: "aisha-r", badges: ["new-to-uni"],
      dna: { targetRoles: ["ml-engineer"], timelineLabel: "Placement applications Sept 2027", targetDate: "2027-09-01", hoursPerWeek: 8, theoryPractice: 70, budget: "free", language: "en" },
    });
    expect(toProfileInput({ ...filled, githubLogin: "" })).not.toHaveProperty("githubLogin");
    expect(toProfileInput({ ...filled, year: 3 }).startedAt).toBe("2024-09-21");
  });
});
