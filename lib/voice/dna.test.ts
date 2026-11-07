import { describe, expect, it } from "vitest";
import { mapToDNA, normaliseRoleId, summariseDNA } from "./dna";

describe("mapToDNA", () => {
  it("clamps hoursPerWeek to 1–40 and rounds it", () => {
    expect(mapToDNA({ hoursPerWeek: 0 }).hoursPerWeek).toBe(1);
    expect(mapToDNA({ hoursPerWeek: -5 }).hoursPerWeek).toBe(1);
    expect(mapToDNA({ hoursPerWeek: 99 }).hoursPerWeek).toBe(40);
    expect(mapToDNA({ hoursPerWeek: 7.6 }).hoursPerWeek).toBe(8);
    expect(mapToDNA({ hoursPerWeek: "about 10 hours" }).hoursPerWeek).toBe(10);
  });

  it("clamps theoryPractice to 0–100 and rounds it", () => {
    expect(mapToDNA({ theoryPractice: -20 }).theoryPractice).toBe(0);
    expect(mapToDNA({ theoryPractice: 150 }).theoryPractice).toBe(100);
    expect(mapToDNA({ theoryPractice: 66.6 }).theoryPractice).toBe(67);
    expect(mapToDNA({ theoryPractice: 0 }).theoryPractice).toBe(0);
    expect(mapToDNA({ theoryPractice: 0.7 }).theoryPractice).toBe(70); // fraction from the agent
    expect(mapToDNA({ theoryPractice: "0.99" }).theoryPractice).toBe(99);
    // Whole numbers are the 0–100 percent the tool schema declares, so 1 stays 1%.
    expect(mapToDNA({ theoryPractice: 1 }).theoryPractice).toBe(1);
  });

  it("keeps only known role ids, maps spoken names, dedupes and caps at 2", () => {
    expect(mapToDNA({ targetRoles: ["ML engineer"] }).targetRoles).toEqual(["ml-engineer"]);
    expect(mapToDNA({ targetRoles: ["machine learning engineer", "ml-engineer"] }).targetRoles).toEqual(["ml-engineer"]);
    expect(mapToDNA({ targetRoles: ["astronaut", "Data Analyst", "software developer", "ml engineer"] }).targetRoles).toEqual([
      "data-analyst",
      "software-engineer",
    ]);
    expect(mapToDNA({ targetRoles: "ML engineer and data analyst" }).targetRoles).toEqual(["ml-engineer", "data-analyst"]);
    expect(mapToDNA({ targetRoles: ["astronaut"] })).not.toHaveProperty("targetRoles");
  });

  it("maps budget phrases to free | paid-ok", () => {
    expect(mapToDNA({ budget: "free" }).budget).toBe("free");
    expect(mapToDNA({ budget: "free only" }).budget).toBe("free");
    expect(mapToDNA({ budget: "paid-ok" }).budget).toBe("paid-ok");
    expect(mapToDNA({ budget: "Paid OK" }).budget).toBe("paid-ok");
    expect(mapToDNA({ budget: "I can't pay for courses" }).budget).toBe("free");
    expect(mapToDNA({ budget: "I can\u2019t pay for courses" }).budget).toBe("free"); // curly apostrophe from speech
    expect(mapToDNA({ budget: "I don't want to pay" }).budget).toBe("free");
    expect(mapToDNA({ budget: "no paid courses please" }).budget).toBe("free");
    expect(mapToDNA({ budget: "I'm happy to pay" }).budget).toBe("paid-ok");
    expect(mapToDNA({ budget: "whatever" })).not.toHaveProperty("budget");
  });

  it("does not turn tolerant negations into free, and drops mixed signals", () => {
    expect(mapToDNA({ budget: "I don't mind if it's paid" }).budget).toBe("paid-ok");
    expect(mapToDNA({ budget: "Paying is no problem" }).budget).toBe("paid-ok");
    expect(mapToDNA({ budget: "I don't mind, but I can't pay much" })).not.toHaveProperty("budget");
  });

  it("keeps 'and' inside a constraint but still splits commas and semicolons", () => {
    expect(mapToDNA({ constraints: "caring for my brother and sister, commuting; part-time job" }).constraints).toEqual([
      "caring for my brother and sister",
      "commuting",
      "part-time job",
    ]);
  });

  it("drops undefined or unusable fields and tidies lists", () => {
    const dna = mapToDNA({ timelineLabel: "  Placement applications Sept 2027 ", constraints: ["part-time job", " ", "Part-time job", "commuting"] });
    expect(dna).toEqual({ timelineLabel: "Placement applications Sept 2027", constraints: ["part-time job", "commuting"] });
    expect(mapToDNA({ constraints: ["none"], timelineLabel: "" })).toEqual({});
    expect(mapToDNA(null)).toEqual({});
    expect(mapToDNA(undefined)).toEqual({});
  });

  it("maps a full save_dna payload", () => {
    expect(
      mapToDNA({
        targetRoles: ["ML engineer"],
        timelineLabel: "Summer internship 2027",
        hoursPerWeek: 8,
        theoryPractice: 70,
        budget: "free",
        constraints: ["part-time job"],
      }),
    ).toEqual({
      targetRoles: ["ml-engineer"],
      timelineLabel: "Summer internship 2027",
      hoursPerWeek: 8,
      theoryPractice: 70,
      budget: "free",
      constraints: ["part-time job"],
    });
  });
});

describe("normaliseRoleId", () => {
  it("recognises ids and common spoken names", () => {
    expect(normaliseRoleId("software-engineer")).toBe("software-engineer");
    expect(normaliseRoleId("AI engineer")).toBe("ml-engineer");
    expect(normaliseRoleId("backend developer")).toBe("software-engineer");
    expect(normaliseRoleId("data analytics")).toBe("data-analyst");
    expect(normaliseRoleId("machine-learning engineer")).toBe("ml-engineer");
    expect(normaliseRoleId("Machine_Learning engineer")).toBe("ml-engineer");
    expect(normaliseRoleId("back-end developer")).toBe("software-engineer");
    expect(normaliseRoleId("ML-Engineer")).toBe("ml-engineer");
    expect(normaliseRoleId("chef")).toBeUndefined();
  });
});

describe("summariseDNA", () => {
  it("produces readable rows in form order", () => {
    const rows = summariseDNA({ targetRoles: ["ml-engineer"], hoursPerWeek: 8, theoryPractice: 70, budget: "free" });
    expect(rows.map((r) => r.label)).toEqual(["Target role", "Time each week", "Theory or practice", "Budget"]);
    expect(rows[0].value).toBe("ML engineer");
    expect(rows[2].value).toBe("30% theory · 70% practice");
    expect(rows[3].value).toBe("Free resources only");
  });
});
