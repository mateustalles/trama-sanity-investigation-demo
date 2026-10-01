import { afterEach, describe, expect, it, vi } from "vitest";
import { OllamaAgentProvider, OpenAiAgentProvider } from "./model-provider";

afterEach(() => vi.unstubAllGlobals());

describe("OpenAiAgentProvider", () => {
  it("translates Trama tools into Responses API function calls", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      output: [{ type: "function_call", call_id: "call-1", name: "list_plots", arguments: "{}" }]
    }), { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    const provider = new OpenAiAgentProvider({ model: "gpt-test", baseUrl: "https://api.openai.com/v1", timeoutMs: 1000, apiKey: "sk-test" });
    const message = await provider.complete([{ role: "user", content: "Liste as Tramas" }], [{ name: "list_plots", description: "List", inputSchema: { type: "object", properties: {}, additionalProperties: false }, annotations: { readOnlyHint: true } }]);
    expect(message.tool_calls?.[0]).toMatchObject({ id: "call-1", function: { name: "list_plots", arguments: "{}" } });
    const request = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(request.tools[0]).toMatchObject({ type: "function", name: "list_plots" });
    expect(request.parallel_tool_calls).toBe(false);
  });

  it("returns visible text from a Responses API message", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ output_text: "Tudo em ordem.", output: [] }), { status: 200 })));
    const provider = new OpenAiAgentProvider({ model: "gpt-test", baseUrl: "https://api.openai.com/v1", timeoutMs: 1000, apiKey: "sk-test" });
    await expect(provider.complete([{ role: "user", content: "Status" }], [])).resolves.toEqual({ role: "assistant", content: "Tudo em ordem." });
  });
});

describe("OllamaAgentProvider", () => {
  it("uses the supplied JSON schema for constrained workflow routing", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ message: { content: '{"decision":"record_step","confidence":0.9}' } }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const provider = new OllamaAgentProvider({ model: "qwen3:4b-instruct", baseUrl: "http://127.0.0.1:11434", timeoutMs: 1000 });
    await expect(provider.completeStructured!([{ role: "user", content: "Liguei." }], { type: "object" })).resolves.toContain("record_step");
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toMatchObject({ format: { type: "object" }, options: { temperature: 0, num_ctx: 4096 } });
  });
});
