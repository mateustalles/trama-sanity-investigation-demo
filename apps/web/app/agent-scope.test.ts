import { describe, expect, it } from "vitest";
import { resolveAgentScope, suggestionsForScope } from "./agent-scope";

describe("agent screen scope", () => {
  it("gives an expanded Action precedence over its Plot", () => {
    expect(resolveAgentScope({ view: "plot", plotId: "plot-1", plotTitle: "Saúde", actionId: "action-1", actionTitle: "Marcar consulta" }))
      .toMatchObject({ kind: "action", entityId: "action-1", plotId: "plot-1" });
  });

  it.each([
    [{ view: "calendar" }, "calendar"],
    [{ view: "desk" }, "workspace"],
    [{ view: "plot", plotId: "plot-1", plotTitle: "Mudança", plotKind: "plot" }, "plot"],
    [{ view: "plot", plotId: "case-1", plotTitle: "Escola", plotKind: "case" }, "case"]
  ] as const)("resolves %o as %s", (projection, expected) => {
    expect(resolveAgentScope(projection).kind).toBe(expected);
  });

  it("offers bounded options for every non-Action scope", () => {
    for (const kind of ["workspace", "calendar", "plot", "case", "openLoop"] as const) {
      const suggestions = suggestionsForScope({ kind, entityId: kind, title: kind });
      expect(suggestions.length).toBeGreaterThanOrEqual(3);
      expect(new Set(suggestions.map((item) => item.id)).size).toBe(suggestions.length);
    }
  });
});
