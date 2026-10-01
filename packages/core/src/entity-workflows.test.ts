import { describe, expect, it } from "vitest";
import { buildGuidedEntityWorkflowProposal, resolveOpenLoopWorkflow, resolvePlotWorkflow } from "./entity-workflows";

const dates = { createdAt: "2026-09-08T12:00:00.000Z", updatedAt: "2026-09-08T12:00:00.000Z" };

describe("entity workflows", () => {
  it("offers only root-Plot paths allowed by its persisted state and localizes their presentation", () => {
    const workflow = resolvePlotWorkflow({ id: "plot-1", parentPlotId: null, title: "Casa", goal: "Organizar", centralQuestion: "O que falta?", status: "active", visibility: "public", lifecycleType: "ongoing", ...dates });
    expect(workflow.operations.map((item) => item.id)).toEqual(["plot.createCase", "plot.rename", "plot.setVisibility", "plot.archive"]);
    expect(workflow.operations[0]).toMatchObject({ label: "Criar Caso", command: "create_plot" });
  });

  it("does not offer completion for an ongoing Trama and exposes English localized text", () => {
    const plot = { id: "plot-1", parentPlotId: null, title: "Health", goal: "Follow up", centralQuestion: "What matters?", status: "active" as const, visibility: "public" as const, lifecycleType: "ongoing" as const, ...dates };
    const workflow = resolvePlotWorkflow(plot, "en-US");
    expect(workflow.operations.map((item) => item.id)).not.toContain("plot.complete");
    expect(workflow.operations[0]?.label).toBe("Create case");
  });

  it("offers closure only while an OpenLoop remains open", () => {
    const base = { id: "loop-1", plotId: "plot-1", title: "Confirmar orçamento", description: "", requiresAction: true, resolution: null, resolvedAt: null, ...dates };
    expect(resolveOpenLoopWorkflow({ ...base, status: "open" }).operations.map((item) => item.id)).toEqual(["openLoop.close"]);
    expect(resolveOpenLoopWorkflow({ ...base, status: "resolved", resolution: "Confirmado.", resolvedAt: dates.updatedAt }).operations).toEqual([]);
  });

  it("converts only an offered Plot rail into its exact MCP command", () => {
    const plot = { id: "plot-1", parentPlotId: null, title: "Casa", goal: "Organizar", centralQuestion: "O que falta?", status: "active" as const, visibility: "public" as const, lifecycleType: "resolvable" as const, ...dates };
    const workflow = resolvePlotWorkflow(plot);
    expect(buildGuidedEntityWorkflowProposal(workflow, { entityType: "plot", entityId: "plot-1", operationId: "plot.complete" }))
      .toEqual({ toolName: "set_plot_status", arguments: { plotId: "plot-1", status: "completed" } });
    expect(() => buildGuidedEntityWorkflowProposal(workflow, { entityType: "plot", entityId: "plot-1", operationId: "plot.reopen" })).toThrow("not offered");
  });
});
