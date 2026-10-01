export interface McpToolDescriptor {
  name: string;
  description?: string;
  inputSchema: Record<string, unknown>;
  annotations?: { readOnlyHint?: boolean };
}

const HOST_ONLY_TOOLS = new Set(["get_local_ai_status", "draft_local_operational_briefing"]);

export function selectTools(tools: McpToolDescriptor[], allowWrites: boolean): McpToolDescriptor[] {
  const agentSafeTools = tools.filter((tool) => !HOST_ONLY_TOOLS.has(tool.name));
  return allowWrites
    ? agentSafeTools
    : agentSafeTools.filter((tool) => tool.annotations?.readOnlyHint === true);
}

export function toOllamaTools(tools: McpToolDescriptor[]) {
  return tools.map((tool) => ({
    type: "function" as const,
    function: {
      name: tool.name,
      description: tool.description ?? tool.name,
      parameters: tool.inputSchema
    }
  }));
}
