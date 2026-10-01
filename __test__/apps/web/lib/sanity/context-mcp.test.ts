import {afterEach, beforeEach, describe, expect, it, vi} from "vitest"
import {createSanityContextReadTools} from "../../../../../apps/web/lib/sanity/context-mcp"

vi.mock("server-only", () => ({}))

const outline = `Knowledge base id: \`kb-car\`
## Car records
vehicle/electrical [core]
  Car battery replacement and starter symptoms

Knowledge base id: \`kb-legal\`
## Legal records
legal/evidence [core]
  Legal evidence and filing documents`

describe("Sanity Context outline adapter", () => {
  const calls: Array<{name: string; arguments: Record<string, unknown>}> = []

  beforeEach(() => {
    calls.length = 0
    vi.stubEnv("SANITY_ORGANIZATION_TOKEN", "test-token")
    vi.stubEnv("SANITY_CONTEXT_EVIDENCE_MCP_URL", "https://example.test/mcp")
    vi.stubGlobal("fetch", vi.fn(async (_url: unknown, options: RequestInit) => {
      const request = JSON.parse(String(options.body)) as {method: string; params?: {name: string; arguments: Record<string, unknown>}}
      if (request.method === "tools/list") return {ok: true, json: async () => ({result: {tools: [{name: "knowledge_base_read", inputSchema: {type: "object"}}]}})}
      calls.push(request.params!)
      return {ok: true, json: async () => ({result: {content: [{type: "text", text: `read ${request.params!.arguments.knowledgeBase}`} ]}})}
    }))
  })

  afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals() })

  it("reads the relevant live base and reports an evidence gap for an absent subject", async () => {
    const [tool] = await createSanityContextReadTools(outline)
    expect(tool?.name).toBe("sanity_evidence__read_index_entries")
    expect(await tool!.invoke({entryKeys: ["kb-car:vehicle/electrical"]}, "Why does my car have starter symptoms after battery replacement?")).toContain("kb-car")
    expect(calls).toEqual([{name: "knowledge_base_read", arguments: {knowledgeBase: "kb-car", paths: ["vehicle/electrical"]}}])
    expect(await tool!.invoke({entryKeys: ["kb-garden:tomato/seedlings"]}, "How should I water tomato seedlings?")).toContain("No valid indexed entry")
    expect(calls).toHaveLength(1)
  })

  it("groups a question spanning two subjects into reads against the correct bases", async () => {
    const [tool] = await createSanityContextReadTools(outline)
    const result = await tool!.invoke({entryKeys: ["kb-car:vehicle/electrical", "kb-legal:legal/evidence"]}, "Compare car battery symptoms with legal evidence")
    expect(result).toContain("kb-car")
    expect(result).toContain("kb-legal")
    expect(calls.map((call) => call.arguments.knowledgeBase).sort()).toEqual(["kb-car", "kb-legal"])
  })

  it("advertises only live entry keys and rejects invented paths", async () => {
    const [tool] = await createSanityContextReadTools(outline)
    expect((tool!.inputSchema as {properties: {entryKeys: {items: {enum: string[]}}}}).properties.entryKeys.items.enum).toEqual(["kb-car:vehicle/electrical", "kb-legal:legal/evidence"])
    await tool!.invoke({entryKeys: ["kb-car:vehicle/electrical", "kb-car:invented"]}, "test")
    expect(calls[0]?.arguments.paths).toEqual(["vehicle/electrical"])
  })
})
