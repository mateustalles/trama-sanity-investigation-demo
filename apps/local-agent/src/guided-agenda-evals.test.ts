import { describe, expect, it } from "vitest";
import { evaluateGuidedAgendaCase, guidedAgendaEvalCases } from "./guided-agenda-evals";

describe("guided Action workflow based on Agenda scenarios", () => {
  it.each(guidedAgendaEvalCases)("$id", (testCase) => {
    expect(evaluateGuidedAgendaCase(testCase)).toMatchObject({ passed: true });
  });
});
