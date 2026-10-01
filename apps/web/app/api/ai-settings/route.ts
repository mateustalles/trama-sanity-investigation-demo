import { cookies } from "next/headers";
import {
  credentialCookieOptions, encryptCredential, openAiKeyCookie, openAiModelCookie,
  providerCookie, readAiSettings, supportedOpenAiModels, type WebAiProvider
} from "../../../lib/ai-credentials";
import { currentHostedUser } from "../../../lib/supabase/session";
import { hostedAuthConfigured } from "../../../lib/supabase/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  if (hostedAuthConfigured() && !await currentHostedUser()) return Response.json({ error: "Autenticação necessária." }, { status: 401 });
  const store = await cookies();
  const settings = readAiSettings(store);
  return Response.json({ provider: settings.provider, openAiConfigured: settings.openAiConfigured, openAiModel: settings.openAiModel, openAiModels: supportedOpenAiModels });
}

export async function POST(request: Request) {
  if (hostedAuthConfigured() && !await currentHostedUser()) return Response.json({ error: "Autenticação necessária." }, { status: 401 });
  try {
    const body = await request.json() as { action?: "saveOpenAi" | "removeOpenAi" | "selectProvider"; apiKey?: string; provider?: WebAiProvider; model?: string };
    const store = await cookies();
    const options = credentialCookieOptions();
    if (body.action === "saveOpenAi") {
      const apiKey = body.apiKey?.trim();
      if (!apiKey || !apiKey.startsWith("sk-")) return Response.json({ error: "Informe uma OpenAI API key válida." }, { status: 400 });
      const response = await fetch("https://api.openai.com/v1/models", { headers: { authorization: `Bearer ${apiKey}` }, signal: AbortSignal.timeout(15_000) });
      if (!response.ok) return Response.json({ error: response.status === 401 ? "A OpenAI recusou esta API key." : "Não foi possível validar a API key agora." }, { status: 400 });
      const model = supportedOpenAiModels.includes(body.model as typeof supportedOpenAiModels[number]) ? body.model! : "gpt-5.6-terra";
      store.set(openAiKeyCookie, encryptCredential(apiKey), options);
      store.set(openAiModelCookie, model, options);
      store.set(providerCookie, "openai", options);
    } else if (body.action === "removeOpenAi") {
      store.delete(openAiKeyCookie);
      store.set(providerCookie, "ollama", options);
    } else if (body.action === "selectProvider") {
      const current = readAiSettings(store);
      if (body.provider === "openai" && !current.openAiConfigured) return Response.json({ error: "Configure uma OpenAI API key primeiro." }, { status: 400 });
      store.set(providerCookie, body.provider === "openai" ? "openai" : "ollama", options);
      if (body.model && supportedOpenAiModels.includes(body.model as typeof supportedOpenAiModels[number])) store.set(openAiModelCookie, body.model, options);
    } else {
      return Response.json({ error: "Pedido inválido." }, { status: 400 });
    }
    const settings = readAiSettings(store);
    return Response.json({ provider: settings.provider, openAiConfigured: settings.openAiConfigured, openAiModel: settings.openAiModel, openAiModels: supportedOpenAiModels });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
