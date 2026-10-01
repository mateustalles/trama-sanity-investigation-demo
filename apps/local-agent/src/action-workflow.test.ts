import { describe, expect, it } from "vitest";
import { buildActionWorkflow, buildGuidedActionProposal, parseWorkflowRoute, toolsForWorkflowDecision, validateActionWorkflowProposal, validateGuidedActionRequest, validateWorkflowDecisionProposal, workflowDecisionSchema } from "./action-workflow";

describe("deterministic Action workflow", () => {
  it("offers bounded progress, state, completion, and scheduling paths for active Actions", () => {
    const workflow = buildActionWorkflow({ id: "action-1", title: "Marcar consulta", resolution: "inProgress" });
    expect(workflow.allowedToolNames).toEqual(["record_action_step", "record_action_update", "reschedule_action", "rename_action", "apply_action_batch"]);
    expect(workflow.suggestions.map((item) => item.operation)).toEqual(["recordStep", "wait", "complete", "reschedule", "rename"]);
    expect(validateActionWorkflowProposal(workflow, "record_action_step", { actionId: "action-1", progress: "Mensagem enviada." })).toBeNull();
    expect(validateActionWorkflowProposal(workflow, "set_plot_status", { plotId: "plot-1" })).toContain("not allowed");
    expect(validateActionWorkflowProposal(workflow, "record_action_update", { actionId: "another", resolution: "completed" })).toContain("does not match");
    expect(validateActionWorkflowProposal(workflow, "apply_action_batch", { operations: [{ actionId: "action-1" }, { actionId: "action-2" }] })).toBeNull();
  });

  it("allows only reopening a terminal Action", () => {
    const workflow = buildActionWorkflow({ id: "action-1", title: "Marcar consulta", resolution: "completed" });
    expect(workflow.suggestions.map((item) => item.operation)).toEqual(["reopen"]);
    expect(workflow.allowedToolNames).toContain("rename_action");
    expect(validateActionWorkflowProposal(workflow, "record_action_update", { actionId: "action-1", resolution: "pending" })).toBeNull();
    expect(validateActionWorkflowProposal(workflow, "record_action_update", { actionId: "action-1", resolution: "completed" })).toContain("not allowed");
    expect(validateActionWorkflowProposal(workflow, "record_action_step", { actionId: "action-1" })).toContain("not allowed");
  });

  it("localizes the deterministic Action rails without changing their operation IDs", () => {
    const workflow = buildActionWorkflow({ id: "action-1", title: "Book appointment", resolution: "pending" }, "en-US");
    expect(workflow.suggestions[0]).toMatchObject({ operation: "recordStep", label: "Record step" });
    expect(workflow.suggestions[0]?.confirmation).toBe("Record this step in the Action?");
  });

  it("builds deterministic guided proposals without model interpretation", () => {
    expect(buildGuidedActionProposal({ actionId: "action-1", operation: "wait", detail: "Pedi outro horário.", deadlineAt: "2026-08-24T23:59:00-03:00" }))
      .toEqual({ toolName: "record_action_update", arguments: { actionId: "action-1", resolution: "waiting", progress: "Pedi outro horário.", deadlineAt: "2026-08-24T23:59:00-03:00" } });
    expect(buildGuidedActionProposal({ actionId: "action-1", operation: "complete", detail: "Data confirmada." }).toolName).toBe("record_action_update");
  });

  it("rejects incomplete guided proposals before MCP", () => {
    expect(() => buildGuidedActionProposal({ actionId: "action-1", operation: "wait", detail: "Pedi outro horário." })).toThrow("Informe o prazo");
    expect(() => buildGuidedActionProposal({ actionId: "action-1", operation: "recordStep", detail: " " })).toThrow("Descreva");
  });

  it("rejects guided operations that are not offered for the current state", () => {
    const active = buildActionWorkflow({ id: "action-1", title: "Marcar consulta", resolution: "inProgress" });
    const completed = buildActionWorkflow({ id: "action-1", title: "Marcar consulta", resolution: "completed" });
    expect(validateGuidedActionRequest(active, { actionId: "action-1", operation: "reopen", deadlineAt: "2026-08-24T18:00:00-03:00" })).toContain("not offered");
    expect(validateGuidedActionRequest(completed, { actionId: "action-1", operation: "complete", detail: "Feito." })).toContain("not offered");
  });

  it("constrains structured routing to the operations offered by the authoritative workflow", () => {
    const workflow = buildActionWorkflow({ id: "action-1", title: "Marcar consulta", resolution: "completed" });
    expect(workflowDecisionSchema(workflow)).toMatchObject({ properties: { decision: { enum: ["clarify", "reopen"] } } });
    expect(parseWorkflowRoute('{"decision":"complete_action","confidence":0.9}', workflow)).toBeNull();
    expect(parseWorkflowRoute('{"decision":"reopen","confidence":0.9}', workflow)).toEqual({ decision: "reopen", confidence: 0.9 });
    expect(toolsForWorkflowDecision("reopen")).toEqual(["record_action_update"]);
    expect(validateWorkflowDecisionProposal({ decision: "complete_action", confidence: 0.9 }, "record_action_update", { resolution: "waiting" })).toContain("does not match");
  });
});
