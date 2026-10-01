import { z } from "zod";
import type { AiProvider, AiProviderStatus, StructuredGenerationRequest } from "./types";

type Fetch = typeof globalThis.fetch;

export interface OllamaProviderOptions {
  baseUrl?: string;
  model?: string;
  timeoutMs?: number;
  fetch?: Fetch;
}

const tagsResponseSchema = z.object({
  models: z.array(z.object({ name: z.string() })).default([])
});

const chatResponseSchema = z.object({
  message: z.object({ content: z.string() })
});

export class OllamaAiProvider implements AiProvider {
  readonly baseUrl: string;
  readonly model: string;
  private readonly timeoutMs: number;
  private readonly fetcher: Fetch;

  constructor(options: OllamaProviderOptions = {}) {
    this.baseUrl = (options.baseUrl ?? "http://127.0.0.1:11434").replace(/\/$/, "");
    this.model = options.model ?? "llama3.2:3b";
    this.timeoutMs = options.timeoutMs ?? 120_000;
    this.fetcher = options.fetch ?? globalThis.fetch;
  }

  async status(): Promise<AiProviderStatus> {
    try {
      const response = await this.fetcher(`${this.baseUrl}/api/tags`, {
        signal: AbortSignal.timeout(Math.min(this.timeoutMs, 10_000))
      });
      if (!response.ok) throw new Error(`Ollama returned HTTP ${response.status}.`);
      const payload = tagsResponseSchema.parse(await response.json());
      const modelInstalled = payload.models.some(({ name }) =>
        name === this.model || name.startsWith(`${this.model}:`)
      );
      return {
        provider: "ollama", available: true, baseUrl: this.baseUrl,
        model: this.model, modelInstalled, error: null
      };
    } catch (error) {
      return {
        provider: "ollama", available: false, baseUrl: this.baseUrl,
        model: this.model, modelInstalled: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  async generateStructured<T>(request: StructuredGenerationRequest<T>): Promise<T> {
    const jsonSchema = z.toJSONSchema(request.schema);
    const response = await this.fetcher(`${this.baseUrl}/api/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model: this.model,
        stream: false,
        format: jsonSchema,
        messages: [
          { role: "system", content: request.system },
          { role: "user", content: `${request.prompt}\n\nJSON Schema:\n${JSON.stringify(jsonSchema)}` }
        ],
        options: { temperature: request.temperature ?? 0.1 }
      }),
      signal: AbortSignal.timeout(this.timeoutMs)
    });
    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Ollama generation failed with HTTP ${response.status}: ${body.slice(0, 500)}`);
    }
    const payload = chatResponseSchema.parse(await response.json());
    let decoded: unknown;
    try {
      decoded = JSON.parse(payload.message.content);
    } catch {
      throw new Error("Ollama returned invalid JSON.");
    }
    return request.schema.parse(decoded);
  }
}

export function createOllamaProviderFromEnv(env: NodeJS.ProcessEnv = process.env): OllamaAiProvider {
  const timeout = Number(env.TRAMA_OLLAMA_TIMEOUT_MS ?? "120000");
  return new OllamaAiProvider({
    baseUrl: env.TRAMA_OLLAMA_BASE_URL ?? "http://127.0.0.1:11434",
    model: env.TRAMA_OLLAMA_MODEL ?? "llama3.2:3b",
    timeoutMs: Number.isFinite(timeout) && timeout > 0 ? timeout : 120_000
  });
}
