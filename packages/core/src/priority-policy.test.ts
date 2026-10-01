import { describe, expect, it } from "vitest";
import { calculatePriority } from "./priority-policy";

describe("calculatePriority", () => {
  const now = new Date("2026-08-05T12:00:00.000Z");

  it("raises an overdue, high-impact action and explains why", () => {
    const priority = calculatePriority({
      now,
      deadlineAt: "2026-08-04T12:00:00.000Z",
      nextReviewAt: "2026-08-05T10:00:00.000Z",
      resolution: "pending",
      risk: { likelihood: 4, impact: 5, urgency: 5, description: "Care may be delayed." },
      manualPriorityAdjustment: 0
    });

    expect(priority.effectivePriority).toBeGreaterThanOrEqual(90);
    expect(priority.reasons.map((reason) => reason.code)).toEqual(
      expect.arrayContaining(["deadlineOverdue", "highImpact", "highUrgency", "stale"])
    );
  });

  it("keeps manual adjustment separate from calculated priority", () => {
    const baseline = calculatePriority({
      now,
      deadlineAt: null,
      nextReviewAt: "2026-08-10T12:00:00.000Z",
      resolution: "pending",
      risk: { likelihood: 1, impact: 1, urgency: 1, description: "Low risk." },
      manualPriorityAdjustment: 0
    });
    const adjusted = calculatePriority({
      now,
      deadlineAt: null,
      nextReviewAt: "2026-08-10T12:00:00.000Z",
      resolution: "pending",
      risk: { likelihood: 1, impact: 1, urgency: 1, description: "Low risk." },
      manualPriorityAdjustment: 20
    });

    expect(adjusted.calculatedPriority).toBe(baseline.calculatedPriority);
    expect(adjusted.effectivePriority).toBe(baseline.effectivePriority + 20);
  });

  it("makes a nearer deadline more important than the same Action farther away", () => {
    const shared = {
      now, nextReviewAt: "2026-08-10T12:00:00.000Z", resolution: "pending" as const,
      risk: { likelihood: 2, impact: 2, urgency: 2, description: "" }, manualPriorityAdjustment: 0
    };
    const today = calculatePriority({ ...shared, deadlineAt: "2026-08-05T18:00:00.000Z" });
    const tomorrow = calculatePriority({ ...shared, deadlineAt: "2026-08-06T18:00:00.000Z" });
    const nextWeek = calculatePriority({ ...shared, deadlineAt: "2026-08-12T18:00:00.000Z" });

    expect(today.effectivePriority).toBeGreaterThan(tomorrow.effectivePriority);
    expect(tomorrow.effectivePriority).toBeGreaterThan(nextWeek.effectivePriority);
    expect(today.effectivePriority).toBeGreaterThanOrEqual(70);
  });

  it("lets an imminent low-risk deadline outrank a distant high-risk Action", () => {
    const imminent = calculatePriority({ now, deadlineAt: "2026-08-05T18:00:00.000Z", nextReviewAt: "2026-08-10T12:00:00.000Z", resolution: "pending", risk: { likelihood: 1, impact: 1, urgency: 1, description: "" }, manualPriorityAdjustment: 0 });
    const distant = calculatePriority({ now, deadlineAt: "2026-09-20T12:00:00.000Z", nextReviewAt: "2026-08-10T12:00:00.000Z", resolution: "pending", risk: { likelihood: 5, impact: 5, urgency: 5, description: "" }, manualPriorityAdjustment: 0 });

    expect(imminent.effectivePriority).toBeGreaterThan(distant.effectivePriority);
  });
});
