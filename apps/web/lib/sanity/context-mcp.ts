import "server-only"
import type { ExternalReadTool } from "@trama/local-agent"
import {knowledgeBaseEntryKey, parseKnowledgeBaseOutline, resolveKnowledgeBaseEntryKeys} from "./context-mcp-policy"

type JsonRpcResponse = {
  result?: {content?: Array<{type?: string; text?: string}>}
  error?: {message?: string}
}

type McpListedTool = {
  name?: unknown
  description?: unknown
  inputSchema?: unknown
  annotations?: { readOnlyHint?: unknown }
}

export type SanityContextSource = "evidence" | "state"

function endpoint(source: SanityContextSource) {
  const configured = source === "evidence"
    ? process.env.SANITY_CONTEXT_EVIDENCE_MCP_URL
    : process.env.SANITY_CONTEXT_STATE_MCP_URL
  if (!configured) throw new Error(`SANITY_CONTEXT_${source.toUpperCase()}_MCP_URL is not configured.`)
  return configured
}

/** Read-only server-side bridge to Sanity Context. No mutation method is exposed. */
export async function callSanityContext(source: SanityContextSource, name: string, arguments_: Record<string, unknown> = {}) {
  const token = process.env.SANITY_ORGANIZATION_TOKEN
  if (!token) throw new Error("SANITY_ORGANIZATION_TOKEN is not configured.")
  const response = await fetch(endpoint(source), {
    method: "POST",
    headers: {Authorization: `Bearer ${token}`, Accept: "application/json, text/event-stream", "Content-Type": "application/json"},
    body: JSON.stringify({jsonrpc: "2.0", id: crypto.randomUUID(), method: "tools/call", params: {name, arguments: arguments_}}),
    cache: "no-store",
  })
  const payload = await response.json() as JsonRpcResponse
  if (!response.ok || payload.error) throw new Error(payload.error?.message ?? `Sanity Context returned HTTP ${response.status}.`)
  return (payload.result?.content ?? []).filter((item) => item.type === "text" && item.text).map((item) => item.text!).join("\n")
}

/**
 * Loads each Context server's advertised read-only tools and gives them a stable,
 * source-prefixed name. The bearer token stays in this server-only closure and is
 * never sent to the model or exposed as a tool argument.
 */
export async function createSanityContextReadTools(initialContext: string): Promise<ExternalReadTool[]> {
  const token = process.env.SANITY_ORGANIZATION_TOKEN
  if (!token) throw new Error("SANITY_ORGANIZATION_TOKEN is not configured.")
  const response = await fetch(endpoint("evidence"), {
    method: "POST",
    headers: {Authorization: `Bearer ${token}`, Accept: "application/json, text/event-stream", "Content-Type": "application/json"},
    body: JSON.stringify({jsonrpc: "2.0", id: crypto.randomUUID(), method: "tools/list", params: {}}),
    cache: "no-store",
  })
  const payload = await response.json() as JsonRpcResponse & {result?: {tools?: McpListedTool[]}}
  if (!response.ok || payload.error) throw new Error(payload.error?.message ?? `Sanity Context returned HTTP ${response.status}.`)
  const evidenceRead = (payload.result?.tools ?? []).find((tool) => tool.name === "knowledge_base_read")
  if (!evidenceRead?.inputSchema || typeof evidenceRead.inputSchema !== "object" || Array.isArray(evidenceRead.inputSchema)) {
    throw new Error("Sanity Context evidence MCP did not advertise knowledge_base_read.")
  }
  const entries = parseKnowledgeBaseOutline(initialContext)
  if (!entries.length) throw new Error("Sanity Context did not advertise any Knowledge Base entries.")
  const evidenceTool: ExternalReadTool = {
    name: "sanity_evidence__read_index_entries",
    description: "[Sanity Context evidence, read-only] Read up to five entries you select from the Knowledge Base outline shown in the session context. Use only advertised entry keys. One bounded read per turn.",
    inputSchema: {
      type: "object",
      required: ["entryKeys"],
      properties: {
        entryKeys: {
          type: "array",
          minItems: 1,
          maxItems: 5,
          uniqueItems: true,
          items: {type: "string", enum: entries.map(knowledgeBaseEntryKey)},
          description: "Select the most relevant indexed entries using their descriptions; include contrasting or limiting evidence when the question calls for it.",
        }
      },
      additionalProperties: false,
    },
    annotations: {readOnlyHint: true},
    maxCallsPerTurn: 1,
    invoke: async (arguments_) => {
      const selected = resolveKnowledgeBaseEntryKeys(entries, arguments_.entryKeys)
      if (!selected.length) return "No valid indexed entry was selected. Do not infer a factual answer from unrelated sources; explain the evidence gap."
      const groups = new Map<string, string[]>()
      for (const entry of selected) groups.set(entry.knowledgeBase, [...(groups.get(entry.knowledgeBase) ?? []), entry.path])
      const results = await Promise.all([...groups].map(async ([knowledgeBase, paths]) =>
        `Knowledge Base ${knowledgeBase}; selected paths: ${paths.join(", ")}\n${await callSanityContext("evidence", "knowledge_base_read", {knowledgeBase, paths})}`
      ))
      return results.join("\n\n")
    }
  }
  return [evidenceTool]
}
