import { describe, expect, it } from "vitest";
import { actionInterviewPolicy, validatesHumanReviewedInteraction } from "./action-language-policy";

describe("human-reviewed Action interaction policy", () => {
  it("requires confirmation for apparent completion and no operations for clarification", () => {
    expect(validatesHumanReviewedInteraction({ decision: "complete_action", target: "a1", operations: ["Registrar envio"], question: "Ainda há algo a fazer?", reply: "" })).toBe(true);
    expect(validatesHumanReviewedInteraction({ decision: "complete_action", target: "a1", operations: ["Concluir"], question: null, reply: "" })).toBe(false);
    expect(validatesHumanReviewedInteraction({ decision: "clarify", target: null, operations: [], question: "Qual ação?", reply: "" })).toBe(true);
  });

  it("captures reviewed deadline and batch boundaries", () => {
    expect(actionInterviewPolicy).toContain('For "next week", ask which day');
    expect(actionInterviewPolicy).toContain("clarify all missing facts first");
    expect(actionInterviewPolicy).toContain("explain in natural language exactly what will change");
  });
});
