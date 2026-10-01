import { describe, expect, it } from "vitest";
import { nextGlobalReviewAt, resolveRelativeDeadline } from "../../../../packages/core/src/review-cadence";

describe("global review cadence", () => {
  it("schedules the next global review from one shared interval", () => {
    expect(nextGlobalReviewAt(new Date("2026-08-11T15:00:00.000Z"), 24))
      .toBe("2026-08-12T15:00:00.000Z");
  });

  it("interprets next week as seven calendar days at the end of the local day", () => {
    const result = new Date(resolveRelativeDeadline("passa para semana que vem", new Date(2026, 7, 11, 15, 0))!.deadlineAt);
    expect(result.getFullYear()).toBe(2026);
    expect(result.getMonth()).toBe(7);
    expect(result.getDate()).toBe(18);
    expect(result.getHours()).toBe(23);
    expect(result.getMinutes()).toBe(59);
  });

  it.each([
    ["amanhã às 11:15", 2026, 7, 12, 11, 15],
    ["ontem", 2026, 7, 10, 23, 59],
    ["daqui a 2 horas", 2026, 7, 11, 17, 0],
    ["daqui a uma hora", 2026, 7, 11, 16, 0],
    ["daqui a duas horas", 2026, 7, 11, 17, 0],
    ["em 5 dias", 2026, 7, 16, 23, 59],
    ["mês que vem", 2026, 8, 11, 23, 59],
    ["ano que vem", 2027, 7, 11, 23, 59]
  ])("resolves %s deterministically", (expression, year, month, day, hour, minute) => {
    const result = new Date(resolveRelativeDeadline(expression, new Date(2026, 7, 11, 15, 0))!.deadlineAt);
    expect([result.getFullYear(), result.getMonth(), result.getDate(), result.getHours(), result.getMinutes()])
      .toEqual([year, month, day, hour, minute]);
  });

  it("resolves a named weekday to its next future occurrence", () => {
    const result = new Date(resolveRelativeDeadline("preciso esperar até próxima segunda-feira", new Date(2026, 7, 20, 15, 0))!.deadlineAt);
    expect([result.getFullYear(), result.getMonth(), result.getDate(), result.getHours(), result.getMinutes()])
      .toEqual([2026, 7, 24, 23, 59]);
  });

  it("returns null for language outside the supported temporal lexicon", () => {
    expect(resolveRelativeDeadline("quando der", new Date(2026, 7, 11, 15, 0))).toBeNull();
  });

  it.each([
    ["tomorrow at 11:15", 12, 11, 15],
    ["in two hours", 11, 17, 0],
    ["next week", 18, 23, 59]
  ] as const)("resolves English expression %s", (expression, day, hour, minute) => {
    const result = new Date(resolveRelativeDeadline(expression, new Date(2026, 7, 11, 15, 0), "en-US")!.deadlineAt);
    expect([result.getDate(), result.getHours(), result.getMinutes()]).toEqual([day, hour, minute]);
  });

  it("resolves a named English weekday", () => {
    const result = new Date(resolveRelativeDeadline("wait until next Monday", new Date(2026, 7, 20, 15, 0), "en-US")!.deadlineAt);
    expect([result.getDate(), result.getHours(), result.getMinutes()]).toEqual([24, 23, 59]);
  });

  it("marks yesterday as a past English deadline", () => {
    expect(resolveRelativeDeadline("move it to yesterday", new Date(2026, 7, 11, 15, 0), "en-US")?.isPast).toBe(true);
  });
});
