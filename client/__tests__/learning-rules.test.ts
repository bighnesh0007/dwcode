import { describe, expect, it } from "vitest";
import {
  REVIEW_GRADUATE,
  dueForReview,
  nextReview,
  placementLevel,
  readiness,
  sampleMock,
  stepComplete,
  weeklyPlan,
} from "@dwcode/shared";

describe("placement", () => {
  const r = (tier: 1 | 2 | 3, correct: boolean) => ({ tier, correct });
  it("is the highest tier mostly passed, counting only consecutive tiers", () => {
    expect(placementLevel([r(1, false), r(1, true), r(1, false)])).toBe("new");
    expect(placementLevel([r(1, true), r(1, true), r(1, false), r(2, false), r(2, false)])).toBe("basics");
    expect(placementLevel([r(1, true), r(1, true), r(2, true), r(2, true), r(3, false)])).toBe("production");
    expect(placementLevel([r(1, true), r(2, true), r(3, true)])).toBe("expert");
    // Tier 3 right but tier 2 failed: still basics.
    expect(placementLevel([r(1, true), r(2, false), r(3, true)])).toBe("basics");
  });
});

describe("roadmap steps and weekly plans", () => {
  it("completes a step when its solve target and quiz are both met", () => {
    const req = { categories: ["Arrays", "Objects"], solveCount: 3, hasQuiz: true };
    expect(stepComplete(req, { arrays: 2, objects: 1 }, false)).toBe(false);
    expect(stepComplete(req, { arrays: 2, objects: 1 }, true)).toBe(true);
    expect(stepComplete({ ...req, hasQuiz: false }, { arrays: 1 }, false)).toBe(false);
  });

  it("plans the next incomplete steps, sized by hours", () => {
    const steps = ["a", "b", "c", "d"].map((id) => ({ id }));
    expect(weeklyPlan(steps, new Set(["a"]), "3-5").map((s) => s.id)).toEqual(["b", "c"]);
    expect(weeklyPlan(steps, new Set(), "1-2").map((s) => s.id)).toEqual(["a"]);
  });
});

describe("spaced review", () => {
  const now = new Date("2026-11-22T00:00:00Z");
  it("starts a missed question at box 0, moves it up when right, graduates it", () => {
    let s = nextReview(undefined, false, now);
    expect(s).toEqual({ box: 0, due: now.toISOString() });
    for (let i = 1; i < REVIEW_GRADUATE; i++) {
      s = nextReview(s ?? undefined, true, now);
      expect(s?.box).toBe(i);
    }
    expect(nextReview(s ?? undefined, true, now)).toBeNull();
    expect(nextReview(undefined, true, now)).toBeNull();
  });

  it("lists due questions, oldest first", () => {
    const due = dueForReview({
      a: { box: 1, due: "2026-11-21T00:00:00Z" },
      b: { box: 0, due: "2026-11-20T00:00:00Z" },
      c: { box: 2, due: "2026-11-30T00:00:00Z" },
    }, now);
    expect(due).toEqual(["b", "a"]);
  });
});

describe("mock exams", () => {
  const sections = [{ id: "s1", title: "S1", weight: 60 }, { id: "s2", title: "S2", weight: 40 }];
  const questions = [
    ...Array.from({ length: 10 }, (_, i) => ({ id: `a${i}`, section: "s1" })),
    ...Array.from({ length: 2 }, (_, i) => ({ id: `b${i}`, section: "s2" })),
  ];

  it("weights by section, never repeats, and fills a short section from the others", () => {
    const mock = sampleMock(questions, sections, 10, 42);
    expect(mock).toHaveLength(10);
    expect(new Set(mock.map((q) => q.id)).size).toBe(10);
    expect(mock.filter((q) => q.section === "s2")).toHaveLength(2);
  });

  it("is reproducible from its seed", () => {
    expect(sampleMock(questions, sections, 5, 7)).toEqual(sampleMock(questions, sections, 5, 7));
  });

  it("scores readiness from recent mocks, weighted to the latest, less open review items", () => {
    expect(readiness([], 0)).toBe(0);
    expect(readiness([50, 90], 0)).toBe(77);
    expect(readiness([90], 3)).toBe(84);
  });
});
