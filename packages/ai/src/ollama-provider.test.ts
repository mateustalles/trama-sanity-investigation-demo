import { describe, expect, it } from "vitest";
import { z } from "zod";
import { OllamaAiProvider } from "./ollama-provider";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" }
  });
}

describe("OllamaAiProvider", () => {
  it("reports whether the configured model is installed", async () => {
    const provider = new OllamaAiProvider({
      model: "llama3.2:3b",
      fetch: async () => jsonResponse({ models: [{ name: "llama3.2:3b" }] })
    });

    await expect(provider.status()).resolves.toMatchObject({
      available: true,
      modelInstalled: true,
      model: "llama3.2:3b"
    });
  });

  it("validates structured model output", async () => {
    const provider = new OllamaAiProvider({
      fetch: async () => jsonResponse({ message: { content: '{"summary":"Tudo sob controle"}' } })
    });

    const result = await provider.generateStructured({
      system: "Answer as JSON.",
      prompt: "Summarize.",
      schema: z.object({ summary: z.string().min(1) })
    });

    expect(result).toEqual({ summary: "Tudo sob controle" });
  });

  it("fails closed when the model output violates the schema", async () => {
    const provider = new OllamaAiProvider({
      fetch: async () => jsonResponse({ message: { content: '{"summary":12}' } })
    });

    await expect(provider.generateStructured({
      system: "Answer as JSON.",
      prompt: "Summarize.",
      schema: z.object({ summary: z.string() })
    })).rejects.toThrow();
  });
});
