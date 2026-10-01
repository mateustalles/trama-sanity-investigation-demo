import { randomUUID } from "node:crypto";
import type { OllamaMessage } from "./agent";
import { toOllamaTools, type McpToolDescriptor } from "./tool-policy";

export type AgentProviderName = "ollama" | "openai";

export interface AgentModelProvider {
  readonly name: AgentProviderName;
  complete(messages: OllamaMessage[], tools: McpToolDescriptor[]): Promise<OllamaMessage>;
  completeStructured?(messages: OllamaMessage[], schema: Record<string, unknown>): Promise<string>;
}

interface ProviderOptions {
  model: string;
  baseUrl: string;
  timeoutMs: number;
  apiKey?: string;
  contextWindow?: number;
}

export class OllamaAgentProvider implements AgentModelProvider {
  readonly name = "ollama" as const;
  constructor(private readonly options: ProviderOptions) {}

  async complete(messages: OllamaMessage[], tools: McpToolDescriptor[]): Promise<OllamaMessage> {
    const response = await fetch(`${this.options.baseUrl}/api/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ model: this.options.model, messages, tools: toOllamaTools(tools), stream: false, think: false, options: { temperature: 0.1, num_ctx: this.options.contextWindow ?? 4096 } }),
      signal: AbortSignal.timeout(this.options.timeoutMs)
    });
    if (!response.ok) throw new Error(`Ollama returned HTTP ${response.status}: ${(await response.text()).slice(0, 500)}`);
    const payload = await response.json() as { message?: OllamaMessage };
    if (!payload.message) throw new Error("Ollama returned an invalid chat response.");
    return payload.message;
  }

  async completeStructured(messages: OllamaMessage[], schema: Record<string, unknown>): Promise<string> {
    const response = await fetch(`${this.options.baseUrl}/api/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ model: this.options.model, messages, stream: false, think: false, format: schema, options: { temperature: 0, num_ctx: this.options.contextWindow ?? 4096 } }),
      signal: AbortSignal.timeout(this.options.timeoutMs)
    });
    if (!response.ok) throw new Error(`Ollama returned HTTP ${response.status}: ${(await response.text()).slice(0, 500)}`);
    const payload = await response.json() as { message?: { content?: unknown } };
    if (typeof payload.message?.content !== "string") throw new Error("Ollama returned an invalid structured response.");
    return payload.message.content;
  }
}

type OpenAiOutput =
  | { type: "message"; content?: Array<{ type?: string; text?: string }> }
  | { type: "function_call"; call_id?: string; name?: string; arguments?: string };

export class OpenAiAgentProvider implements AgentModelProvider {
  readonly name = "openai" as const;
  constructor(private readonly options: ProviderOptions) {
    if (!options.apiKey?.trim()) throw new Error("Configure uma OpenAI API key para usar este provedor.");
  }

  async complete(messages: OllamaMessage[], tools: McpToolDescriptor[]): Promise<OllamaMessage> {
    const input = messages.flatMap((message): Array<Record<string, unknown>> => {
      if (message.role === "tool") return [{
        type: "function_call_output",
        call_id: message.tool_call_id ?? message.tool_name ?? randomUUID(),
        output: message.content
      }];
      const role = message.role === "system" ? "developer" : message.role;
      const items: Array<Record<string, unknown>> = message.content ? [{ role, content: message.content }] : [];
      for (const call of message.tool_calls ?? []) items.push({
        type: "function_call",
        call_id: call.id ?? randomUUID(),
        name: call.function.name,
        arguments: typeof call.function.arguments === "string" ? call.function.arguments : JSON.stringify(call.function.arguments)
      });
      return items;
    });
    const response = await fetch(`${this.options.baseUrl}/responses`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${this.options.apiKey}` },
      body: JSON.stringify({
        model: this.options.model,
        input,
        tools: tools.map((tool) => ({ type: "function", name: tool.name, description: tool.description ?? tool.name, parameters: tool.inputSchema })),
        tool_choice: "auto",
        parallel_tool_calls: false
      }),
      signal: AbortSignal.timeout(this.options.timeoutMs)
    });
    if (!response.ok) {
      const details = (await response.text()).slice(0, 700);
      if (response.status === 401) throw new Error("A OpenAI API key foi recusada. Revise a chave nas configurações de IA.");
      if (response.status === 429) throw new Error("A OpenAI limitou esta solicitação. Verifique créditos e limites da conta de API.");
      throw new Error(`OpenAI returned HTTP ${response.status}: ${details}`);
    }
    const payload = await response.json() as { output?: OpenAiOutput[]; output_text?: string };
    const calls = (payload.output ?? []).flatMap((item) => item.type === "function_call" && item.name
      ? [{ id: item.call_id ?? randomUUID(), type: "function", function: { name: item.name, arguments: item.arguments ?? "{}" } }]
      : []);
    const text = payload.output_text ?? (payload.output ?? []).flatMap((item) => item.type === "message"
      ? (item.content ?? []).flatMap((part) => part.type === "output_text" && part.text ? [part.text] : [])
      : []).join("\n");
    return { role: "assistant", content: text, ...(calls.length ? { tool_calls: calls } : {}) };
  }
}

export function createAgentModelProvider(provider: AgentProviderName, options: ProviderOptions): AgentModelProvider {
  return provider === "openai" ? new OpenAiAgentProvider(options) : new OllamaAgentProvider(options);
}
