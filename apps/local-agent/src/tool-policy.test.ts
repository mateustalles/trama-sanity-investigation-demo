import { describe, expect, it } from "vitest";
import { selectTools, toOllamaTools } from "./tool-policy";

const tools = [
  { name: "read", inputSchema: { type: "object" }, annotations: { readOnlyHint: true } },
  { name: "write", inputSchema: { type: "object" }, annotations: { readOnlyHint: false } },
  { name: "draft_local_operational_briefing", inputSchema: { type: "object" }, annotations: { readOnlyHint: true } }
];

describe("local agent tool policy", () => {
  it("exposes only read-only MCP tools by default", () => {
    expect(selectTools(tools, false).map((tool) => tool.name)).toEqual(["read"]);
  });

  it("exposes writes only after an explicit opt-in", () => {
    expect(selectTools(tools, true).map((tool) => tool.name)).toEqual(["read", "write"]);
  });

  it("converts MCP schemas into Ollama function tools", () => {
    expect(toOllamaTools(tools)[0]).toMatchObject({
      type: "function",
      function: { name: "read", parameters: { type: "object" } }
    });
  });
});
