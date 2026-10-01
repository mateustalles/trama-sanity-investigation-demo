import { randomUUID } from "node:crypto";
import { buildActionWorkflow, LocalTramaAgent, type AgentScreenContext, type GuidedActionInput } from "@trama/local-agent";
import { createServiceMcpTransport } from "@trama/mcp";
import { buildGuidedEntityWorkflowProposal, resolveOpenLoopWorkflow, resolvePlotWorkflow, type GuidedEntityWorkflowProposal } from "@trama/core";
import { getRequestTramaService } from "../../../lib/service";
import type { ConversationEntityType, ConversationMemoryScope } from "@trama/schemas";
import { cookies } from "next/headers";
import { readAiSettings, supportedOpenAiModels } from "../../../lib/ai-credentials";
import { currentHostedUser } from "../../../lib/supabase/session";
import { hostedAuthConfigured } from "../../../lib/supabase/config";
import { currentHostedWorkspace } from "../../../lib/supabase/workspace";
import { callSanityContext, createSanityContextReadTools } from "../../../lib/sanity/context-mcp";
import type { AsyncTramaService, TramaService } from "@trama/application";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Session {
  agent: LocalTramaAgent;
  touchedAt: number;
  conversationId: string;
  pendingOperationId: string | null;
  pendingGuidedProposal: GuidedEntityWorkflowProposal | null;
  /** Bound at creation so an opaque session ID cannot cross an authenticated tenant boundary. */
  identity: { userId: string; workspaceId: string } | null;
}

const globalSessions = globalThis as typeof globalThis & { __tramaChatSessions?: Map<string, Session> };
const sessions = globalSessions.__tramaChatSessions ??= new Map<string, Session>();
const sessionTtlMs = 30 * 60 * 1000;

async function removeExpiredSessions() {
  const expired = [...sessions.entries()].filter(([, session]) => Date.now() - session.touchedAt > sessionTtlMs);
  await Promise.all(expired.map(async ([id, session]) => {
    sessions.delete(id);
    await session.agent.close();
  }));
}

async function resolveGuidedProposal(service: TramaService | AsyncTramaService, proposal: GuidedEntityWorkflowProposal, approved: boolean) {
  if (!approved) return { type: "message" as const, content: "Alteração não executada." };
  if (proposal.toolName === "create_plot") await service.createPlot(proposal.arguments as never);
  else if (proposal.toolName === "rename_plot") await service.renamePlot(proposal.arguments as never);
  else if (proposal.toolName === "set_plot_visibility") await service.setPlotVisibility(proposal.arguments as never);
  else if (proposal.toolName === "set_plot_status") await service.setPlotStatus(proposal.arguments as never);
  else if (proposal.toolName === "close_open_loop") await service.closeOpenLoop(proposal.arguments as never);
  else throw new Error(`Unsupported guided command: ${proposal.toolName}`);
  return { type: "message" as const, content: "Alteração registrada." };
}

export async function GET() {
  if (hostedAuthConfigured() && !await currentHostedUser()) return Response.json({ error: "Autenticação necessária." }, { status: 401 });
  const settings = readAiSettings(await cookies());
  const defaultModel = process.env.TRAMA_OLLAMA_MODEL ?? "trama-agent";
  if (settings.provider === "openai") return Response.json({ available: true, provider: "openai", openAiConfigured: true, models: [...supportedOpenAiModels], defaultModel: settings.openAiModel });
  const baseUrl = (process.env.TRAMA_OLLAMA_BASE_URL ?? "http://127.0.0.1:11434").replace(/\/$/, "");
  try {
    const response = await fetch(`${baseUrl}/api/tags`, { signal: AbortSignal.timeout(5_000) });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = await response.json() as { models?: Array<{ name?: string }> };
    const isDefault = (name: string) => name === defaultModel || name === `${defaultModel}:latest` || name.replace(/:latest$/, "") === defaultModel.replace(/:latest$/, "");
    const models = (payload.models ?? []).flatMap((item) => item.name ? [item.name] : [])
      .sort((left, right) => isDefault(left) ? -1 : isDefault(right) ? 1 : left.localeCompare(right));
    return Response.json({ available: true, provider: "ollama", openAiConfigured: settings.openAiConfigured, models, defaultModel });
  } catch (error) {
    return Response.json({ available: false, provider: "ollama", openAiConfigured: settings.openAiConfigured, models: [], defaultModel, error: error instanceof Error ? error.message : String(error) });
  }
}

export async function POST(request: Request) {
  if (hostedAuthConfigured() && !await currentHostedUser()) return Response.json({ error: "Autenticação necessária." }, { status: 401 });
  await removeExpiredSessions();
  try {
    const body = await request.json() as {
      action?: "start" | "send" | "guided" | "guidedEntity" | "resolve" | "close" | "list" | "get" | "workflow" | "setMemory";
      sessionId?: string;
      model?: string;
      message?: string;
      approved?: boolean;
      screenContext?: AgentScreenContext;
      allowWrites?: boolean;
      conversationId?: string;
      memoryScope?: ConversationMemoryScope;
      conversationTarget?: { entityType: ConversationEntityType; entityId: string; title: string; plotId?: string };
      guidedAction?: GuidedActionInput;
      guidedEntity?: { entityType: "plot" | "openLoop"; entityId: string; operationId: string; fields?: Record<string, unknown>; plotId?: string };
    };
    const hostedIdentity = hostedAuthConfigured() ? await currentHostedWorkspace() : null;
    if (hostedAuthConfigured() && !hostedIdentity) return Response.json({ error: "Autenticação necessária." }, { status: 401 });
    const service = await getRequestTramaService();
    if (body.action === "list") {
      const target = body.conversationTarget ?? { entityType: "workspace" as const, entityId: "trama", title: "Trama" };
      const listedConversations = await service.listConversations(target.entityType, target.entityId);
      const conversations = await Promise.all(listedConversations.map(async (conversation) => ({
        ...conversation,
        messageCount: (await service.getConversation(conversation.id)).messages.length
      })));
      return Response.json({ conversations });
    }
    if (body.action === "get" && body.conversationId) {
      return Response.json(await service.getConversation(body.conversationId));
    }
    if (body.action === "workflow" && body.conversationTarget) {
      const target = body.conversationTarget;
      if (target.entityType === "plot") {
        const dashboard = await service.getPlotDashboard(target.entityId);
        return Response.json({ workflow: resolvePlotWorkflow(dashboard.plot) });
      }
      if (target.entityType === "openLoop" && target.plotId) {
        const openLoop = (await service.getPlotDashboard(target.plotId)).openLoops
          .find((candidate) => candidate.id === target.entityId);
        if (!openLoop) return Response.json({ error: "A Ponta Solta não pertence ao contexto informado." }, { status: 404 });
        return Response.json({ workflow: resolveOpenLoopWorkflow(openLoop) });
      }
      if (target.entityType === "action" && target.plotId) {
        const action = (await service.getPlotDashboard(target.plotId)).actions
          .find((candidate) => candidate.id === target.entityId);
        if (!action) return Response.json({ error: "A ação não pertence ao contexto informado." }, { status: 404 });
        return Response.json({ workflow: buildActionWorkflow(action) });
      }
    }
    if (body.action === "setMemory" && body.conversationId && body.memoryScope) {
      return Response.json({ conversation: await service.setConversationMemoryScope({ id: body.conversationId, memoryScope: body.memoryScope }) });
    }
    if (body.action === "start") {
      const aiSettings = readAiSettings(await cookies());
      const sessionId = randomUUID();
      const target = body.conversationTarget ?? { entityType: "workspace" as const, entityId: "trama", title: "Conversa no Trama" };
      const existing = body.conversationId ? await service.getConversation(body.conversationId) : null;
      const conversation = existing?.conversation ?? await service.createConversation({
        title: target.title, primaryEntityType: target.entityType, primaryEntityId: target.entityId,
        memoryScope: body.memoryScope ?? "sameEntity", sourceClient: "web"
      });
      const selectedModel = aiSettings.provider === "openai" && supportedOpenAiModels.includes(body.model as typeof supportedOpenAiModels[number]) ? body.model : aiSettings.provider === "openai" ? aiSettings.openAiModel : body.model;
      let externalReadTools: Awaited<ReturnType<typeof createSanityContextReadTools>> = [];
      let externalReadContext = "Sanity Context has no connected evidence available for this session. Use Trama MCP for operational State. Do not claim to have retrieved external records.";
      try {
        const evidenceOrientation = await callSanityContext("evidence", "initial_context");
        externalReadTools = await createSanityContextReadTools(evidenceOrientation);
        externalReadContext = [
          "Sanity Context supplied the following Knowledge Base outline. It is an index, not the evidence itself. Read it before selecting entries for the user's question:",
          evidenceOrientation,
          "Use sanity_evidence__read_index_entries once to read up to five relevant advertised entries. Each entry key is the Knowledge Base id, a colon, and the path. Do not invent entries or assume a Knowledge Base exists for every subject.",
          "After tool results arrive, answer the user's exact question directly. A valid final response states the conclusion, cites the evidence or source paths, and preserves material uncertainty. Use Trama MCP for authoritative operational State.",
          "Never answer only that retrieval is complete, that the answer remains unchanged, or that no more tool calls are needed."
        ].join("\n");
      } catch (error) {
        console.warn("Sanity Context evidence unavailable for this chat session:", error instanceof Error ? error.message : String(error));
      }
      // In hosted mode this is an in-process MCP server over the request-scoped
      // AsyncTramaService, never the SQLite stdio MCP process.
      const mcpTransport = hostedIdentity ? await createServiceMcpTransport(service) : undefined;
      const agent = new LocalTramaAgent({ provider: aiSettings.provider, ...(aiSettings.apiKey ? { apiKey: aiSettings.apiKey } : {}), ...(selectedModel ? { model: selectedModel } : {}), ...(mcpTransport ? { mcpTransport } : {}), externalReadContext, externalReadTools, allowWrites: true });
      await agent.connect();
      const currentMessages = existing?.messages.filter((message) => message.role === "user" || message.role === "assistant") ?? [];
      const entityMemory = conversation.memoryScope === "sameEntity" ? await service.getSameEntityConversationMemory(conversation.id) : [];
      agent.addConversationMemory([...entityMemory, ...currentMessages].map((message) => ({ role: message.role as "user" | "assistant", content: message.content })));
      sessions.set(sessionId, {
        agent, touchedAt: Date.now(), conversationId: conversation.id, pendingOperationId: null, pendingGuidedProposal: null,
        identity: hostedIdentity ? { userId: hostedIdentity.userId, workspaceId: hostedIdentity.workspaceId } : null
      });
      return Response.json({ sessionId, model: agent.model, conversation, messages: currentMessages, workflow: agent.getActiveWorkflow(), contextAvailable: externalReadTools.length > 0 });
    }

    const session = body.sessionId ? sessions.get(body.sessionId) : undefined;
    if (!session) return Response.json({ error: "A sessão expirou. Inicie uma nova conversa." }, { status: 404 });
    if (hostedIdentity && (!session.identity || session.identity.userId !== hostedIdentity.userId || session.identity.workspaceId !== hostedIdentity.workspaceId)) {
      sessions.delete(body.sessionId!);
      await session.agent.close();
      return Response.json({ error: "Esta sessão de conversa pertence a outro usuário ou Workspace." }, { status: 403 });
    }
    session.touchedAt = Date.now();

    if (body.action === "close") {
      sessions.delete(body.sessionId!);
      await session.agent.close();
      return Response.json({ closed: true });
    }
    if (body.action === "resolve") {
      const operationId = session.pendingOperationId;
      try {
        if (operationId) await service.resolveConversationOperation(operationId, body.approved === true ? "approved" : "declined");
        const result = session.pendingGuidedProposal
          ? await resolveGuidedProposal(service, session.pendingGuidedProposal, body.approved === true)
          : await session.agent.resolveWrite(body.approved === true);
        if (operationId && body.approved === true) await service.resolveConversationOperation(operationId, "executed", result);
        session.pendingOperationId = null;
        session.pendingGuidedProposal = null;
        if (result.type === "message" && result.content.trim()) await service.appendConversationMessage({ conversationId: session.conversationId, role: "assistant", content: result.content.trim(), provider: session.agent.provider, model: session.agent.model });
        return Response.json({ ...result, workflow: session.agent.getActiveWorkflow() });
      } catch (error) {
        if (operationId) await service.resolveConversationOperation(operationId, "failed", null, error instanceof Error ? error.message : String(error));
        session.pendingOperationId = null;
        throw error;
      }
    }
    if (body.action === "guidedEntity" && body.guidedEntity) {
      const input = body.guidedEntity;
      let resolvedWorkflow;
      if (input.entityType === "plot") resolvedWorkflow = resolvePlotWorkflow((await service.getPlotDashboard(input.entityId)).plot);
      else {
        if (!input.plotId) throw new Error("A Ponta Solta precisa do Plot de origem.");
        const item = (await service.getPlotDashboard(input.plotId)).openLoops.find((candidate) => candidate.id === input.entityId);
        if (!item) throw new Error("A Ponta Solta não pertence ao contexto informado.");
        resolvedWorkflow = resolveOpenLoopWorkflow(item);
      }
      const proposal = buildGuidedEntityWorkflowProposal(resolvedWorkflow, input);
      const userMessage = await service.appendConversationMessage({ conversationId: session.conversationId, role: "user", content: `Fluxo guiado: ${input.operationId}`, provider: null, model: null });
      const operation = await service.recordConversationOperation({ conversationId: session.conversationId, messageId: userMessage.id, toolName: proposal.toolName, arguments: proposal.arguments });
      session.pendingOperationId = operation.id;
      session.pendingGuidedProposal = proposal;
      return Response.json({ type: "approval", approval: { toolName: proposal.toolName, description: resolvedWorkflow.operations.find((item) => item.id === input.operationId)?.label ?? input.operationId, summary: resolvedWorkflow.operations.find((item) => item.id === input.operationId)?.confirmation ?? "Confirmar alteração?", arguments: proposal.arguments } });
    }
    if (body.action === "guided" && body.guidedAction) {
      if (body.screenContext) await session.agent.setScreenContext(body.screenContext);
      session.agent.setWriteMode(body.allowWrites === true);
      const userMessage = await service.appendConversationMessage({
        conversationId: session.conversationId, role: "user",
        content: `Fluxo guiado: ${body.guidedAction.operation}${body.guidedAction.detail ? ` — ${body.guidedAction.detail}` : ""}`,
        provider: null, model: null
      });
      const result = session.agent.prepareGuidedAction(body.guidedAction);
      if (result.type === "message") {
        if (result.content.trim()) await service.appendConversationMessage({ conversationId: session.conversationId, role: "assistant", content: result.content.trim(), provider: session.agent.provider, model: session.agent.model });
      } else {
        const operation = await service.recordConversationOperation({ conversationId: session.conversationId, messageId: userMessage.id, toolName: result.approval.toolName, arguments: result.approval.arguments });
        session.pendingOperationId = operation.id;
      }
      return Response.json({ ...result, conversationId: session.conversationId, workflow: session.agent.getActiveWorkflow() });
    }
    if (body.action === "send" && body.message?.trim()) {
      if (body.screenContext) await session.agent.setScreenContext(body.screenContext);
      session.agent.setWriteMode(body.allowWrites === true);
      const userMessage = await service.appendConversationMessage({ conversationId: session.conversationId, role: "user", content: body.message.trim(), provider: null, model: null });
      const result = await session.agent.send(body.message.trim());
      if (result.type === "message") {
        if (result.content.trim()) await service.appendConversationMessage({ conversationId: session.conversationId, role: "assistant", content: result.content.trim(), provider: session.agent.provider, model: session.agent.model });
      } else {
        const operation = await service.recordConversationOperation({ conversationId: session.conversationId, messageId: userMessage.id, toolName: result.approval.toolName, arguments: result.approval.arguments });
        session.pendingOperationId = operation.id;
      }
      return Response.json({ ...result, conversationId: session.conversationId, workflow: session.agent.getActiveWorkflow() });
    }
    return Response.json({ error: "Pedido inválido." }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
