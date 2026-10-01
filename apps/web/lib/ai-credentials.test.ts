import { afterEach, describe, expect, it } from "vitest";
import { decryptCredential, encryptCredential, readAiSettings } from "./ai-credentials";

const previousSecret = process.env.TRAMA_CREDENTIAL_SECRET;
afterEach(() => { process.env.TRAMA_CREDENTIAL_SECRET = previousSecret; });

describe("AI credentials", () => {
  it("encrypts the API key without exposing its plaintext", () => {
    process.env.TRAMA_CREDENTIAL_SECRET = "test-only-secret";
    const encrypted = encryptCredential("sk-private-value");
    expect(encrypted).not.toContain("sk-private-value");
    expect(decryptCredential(encrypted)).toBe("sk-private-value");
  });

  it("selects OpenAI only when a credential is available", () => {
    process.env.TRAMA_CREDENTIAL_SECRET = "test-only-secret";
    const values = new Map([["trama_ai_provider", "openai"], ["trama_openai_key", encryptCredential("sk-private-value")]]);
    expect(readAiSettings({ get: (name) => values.has(name) ? { value: values.get(name)! } : undefined })).toMatchObject({ provider: "openai", openAiConfigured: true });
    expect(readAiSettings({ get: (name) => name === "trama_ai_provider" ? { value: "openai" } : undefined }).provider).toBe("ollama");
  });
});
