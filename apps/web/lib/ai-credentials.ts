import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

export const providerCookie = "trama_ai_provider";
export const openAiKeyCookie = "trama_openai_key";
export const openAiModelCookie = "trama_openai_model";
export const supportedOpenAiModels = ["gpt-5.6-terra", "gpt-5.6-luna", "gpt-5.4-mini"] as const;
export type WebAiProvider = "openai" | "ollama";

function encryptionKey() {
  let secret = process.env.TRAMA_CREDENTIAL_SECRET;
  if (!secret && process.env.NODE_ENV !== "production") {
    let root = process.cwd();
    while (!existsSync(path.join(root, "pnpm-workspace.yaml")) && path.dirname(root) !== root) root = path.dirname(root);
    const keyPath = process.env.TRAMA_CREDENTIAL_KEY_PATH ?? path.join(root, ".trama", "credentials.key");
    mkdirSync(path.dirname(keyPath), { recursive: true });
    if (!existsSync(keyPath)) {
      try { writeFileSync(keyPath, randomBytes(32).toString("base64url"), { encoding: "utf8", flag: "wx", mode: 0o600 }); } catch { /* another server worker created it */ }
    }
    secret = readFileSync(keyPath, "utf8").trim();
  }
  if (!secret) throw new Error("Defina TRAMA_CREDENTIAL_SECRET no servidor antes de salvar credenciais de IA.");
  return createHash("sha256").update(secret).digest();
}

export function encryptCredential(value: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), encrypted].map((part) => part.toString("base64url")).join(".");
}

export function decryptCredential(value: string | undefined): string | null {
  if (!value) return null;
  try {
    const [ivValue, tagValue, encryptedValue] = value.split(".");
    if (!ivValue || !tagValue || !encryptedValue) return null;
    const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(ivValue, "base64url"));
    decipher.setAuthTag(Buffer.from(tagValue, "base64url"));
    return Buffer.concat([decipher.update(Buffer.from(encryptedValue, "base64url")), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}

export function readAiSettings(cookies: { get(name: string): { value: string } | undefined }) {
  const cookieKey = decryptCredential(cookies.get(openAiKeyCookie)?.value);
  const environmentKey = process.env.OPENAI_API_KEY?.trim() || null;
  const apiKey = cookieKey ?? environmentKey;
  const requestedProvider = cookies.get(providerCookie)?.value;
  const provider: WebAiProvider = requestedProvider === "openai" && apiKey ? "openai" : "ollama";
  const requestedModel = cookies.get(openAiModelCookie)?.value;
  const openAiModel = supportedOpenAiModels.includes(requestedModel as typeof supportedOpenAiModels[number])
    ? requestedModel!
    : process.env.TRAMA_OPENAI_MODEL ?? "gpt-5.6-terra";
  return { provider, apiKey, openAiConfigured: Boolean(apiKey), openAiModel };
}

export function credentialCookieOptions() {
  return { httpOnly: true, sameSite: "strict" as const, secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 24 * 365 };
}
