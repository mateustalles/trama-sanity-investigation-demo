import { describe, expect, it } from "vitest";
import { buildEvalContextMock, formatEvalContext } from "../../../../apps/local-agent/src/eval-context";

describe("Action evaluation context mock", () => {
  it("builds an authoritative focused Action and its workflow from legacy samples", () => {
    const mock = buildEvalContextMock({ id: "sample-1", context: "Ação expandida: Marcar consulta." });
    expect(mock.focusedActionId).toBe("sample-1-action-1");
    expect(mock.actions[0]?.title).toBe("Marcar consulta");
    expect(mock.workflow?.allowedToolNames).toContain("record_action_step");
    expect(mock.visibleDom.expandedAction?.agentActionId).toBe("sample-1-action-1");
    expect(mock.mcpDashboard.actions[0]?.id).toBe("sample-1-action-1");
    expect(formatEvalContext(mock)).toContain("Host workflow");
    expect(formatEvalContext(mock)).toContain("get_plot_context MCP mock");
  });

  it("builds English focused Action context without losing locale", () => {
    const mock = buildEvalContextMock({ id: "sample-en", locale: "en-US", context: "Expanded Action: Submit the rental application." });
    expect(mock.locale).toBe("en-US");
    expect(mock.actions[0]?.title).toBe("Submit the rental application");
    expect(mock.focusedActionId).toBe("sample-en-action-1");
  });

  it("keeps multiple candidates authoritative without inventing focus", () => {
    const mock = buildEvalContextMock({ id: "sample-2", context: "Candidatas: Marcar consulta; Procurar médica." });
    expect(mock.actions).toHaveLength(2);
    expect(mock.focusedActionId).toBeNull();
    expect(mock.workflow).toBeNull();
    expect(mock.visibleDom.expandedAction).toBeNull();
  });
});
