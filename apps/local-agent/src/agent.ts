import path from "node:path";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import { resolveRelativeDeadline, resolveSupportedLocale, type SupportedLocale } from "@trama/core";
import { selectTools, type McpToolDescriptor } from "./tool-policy";
import { createAgentModelProvider, type AgentModelProvider, type AgentProviderName } from "./model-provider";
import { agentCopy, formatAgentDate } from "./locales";
import { actionInterviewPolicy } from "./action-language-policy";
import {
  actionWorkflowInstruction, buildActionWorkflow, buildGuidedActionProposal, validateActionWorkflowProposal, validateGuidedActionRequest,
  workflowDecisionSchema, workflowRoutingExamples, parseWorkflowRoute, toolsForWorkflowDecision, validateWorkflowDecisionProposal, type ActionWorkflow, type GuidedActionInput, type WorkflowRoute
} from "./action-workflow";
export { buildActionWorkflow } from "./action-workflow";
export type { ActionWorkflow, GuidedActionInput } from "./action-workflow";

export interface OllamaMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  tool_name?: string;
  tool_call_id?: string;
  tool_calls?: OllamaToolCall[];
}

interface OllamaToolCall {
  id?: string;
  type?: string;
  function: { name: string; arguments: Record<string, unknown> | string };
}

export interface PendingWrite {
  toolName: string;
  description: string;
  summary: string;
  arguments: Record<string, unknown>;
}

export type AgentTurnResult =
  | { type: "message"; content: string }
  | { type: "approval"; approval: PendingWrite };

export interface LocalAgentOptions {
  /** Server-owned MCP connection; omitted only for the local CLI/SQLite adapter. */
  mcpTransport?: Transport;
  provider?: AgentProviderName;
  apiKey?: string;
  model?: string;
  baseUrl?: string;
  databasePath?: string;
  allowWrites?: boolean;
  timeoutMs?: number;
  maxTurns?: number;
  /** Read-only, server-resolved context from external systems such as Sanity Context. */
  externalReadContext?: string;
  /** Read-only tools hosted outside Trama. They are never eligible for approval or mutation. */
  externalReadTools?: ExternalReadTool[];
}

/** A server-owned adapter for a remote read-only MCP tool. */
export interface ExternalReadTool extends McpToolDescriptor {
  /** Prefix must make the external source visible to both the model and audit logs. */
  name: `${string}__${string}`;
  invoke(arguments_: Record<string, unknown>, question: string): Promise<unknown>;
  eligibleForQuestion?: (question: string) => boolean;
  maxCallsPerTurn?: number;
}

export interface AgentScreenContext {
  view: "desk" | "root-map" | "hidden" | "plot" | "cases" | "calendar";
  plotId?: string;
  actionId?: string;
  actionTitle?: string;
  locale?: string;
  timeZone?: string;
}

export function screenContextInstruction(context: AgentScreenContext): string {
  const description = context.plotId
    ? context.view === "cases"
      ? `The user is viewing the Cases belonging to Plot ${context.plotId}.`
      : `The user is viewing the detail screen for Plot ${context.plotId}.`
    : context.view === "hidden"
      ? "The user is viewing the hidden Tramas screen."
      : context.view === "calendar"
        ? "The user is viewing the calendar of Action completion deadlines across visible Tramas."
      : context.view === "root-map"
        ? "The user is viewing the root investigator map with multiple Tramas and their Cases."
        : "The user is viewing the investigator's desk with the overall priorities.";
  return `${description} Treat ambiguous references such as “esta Trama”, “este Caso”, “isso” or “aqui” as references to this visible screen. The host resolves a visible Plot through MCP and supplies its authoritative context separately. An explicit reference to another Trama or Caso overrides the visible-screen context.`;
}

export function compactPlotContext(value: unknown): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const dashboard = (value as { dashboard?: unknown }).dashboard;
  if (!dashboard || typeof dashboard !== "object" || Array.isArray(dashboard)) return value;
  const source = dashboard as Record<string, unknown>;
  const recentProgress = Array.isArray(source.actionProgress) ? source.actionProgress.slice(-20) : source.actionProgress;
  return {
    dashboard: {
      plot: source.plot,
      openLoops: source.openLoops,
      actions: source.actions,
      actionProgress: recentProgress,
      attentionItems: source.attentionItems,
      requiredInputs: source.requiredInputs
    }
  };
}

function actionsFromContext(value: unknown): Array<{ id: string; title: string; deadlineAt: string | null; resolution: string }> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  const dashboard = (value as { dashboard?: unknown }).dashboard;
  if (!dashboard || typeof dashboard !== "object" || Array.isArray(dashboard)) return [];
  const actions = (dashboard as { actions?: unknown }).actions;
  if (!Array.isArray(actions)) return [];
  return actions.flatMap((action) => {
    if (!action || typeof action !== "object") return [];
    const { id, title, deadlineAt, resolution } = action as { id?: unknown; title?: unknown; deadlineAt?: unknown; resolution?: unknown };
    return typeof id === "string" && typeof title === "string"
      ? [{ id, title, deadlineAt: typeof deadlineAt === "string" ? deadlineAt : null, resolution: typeof resolution === "string" ? resolution : "pending" }]
      : [];
  });
}

function actionsFromPriorityReport(value: unknown): Array<{ id: string; plotId: string; title: string; deadlineAt: string | null; resolution: string }> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  const report = (value as { report?: unknown }).report;
  if (!report || typeof report !== "object" || Array.isArray(report)) return [];
  const entries = (report as { entries?: unknown }).entries;
  if (!Array.isArray(entries)) return [];
  return entries.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const candidate = entry as { kind?: unknown; entityId?: unknown; plotId?: unknown; title?: unknown; deadlineAt?: unknown };
    return candidate.kind === "action" && typeof candidate.entityId === "string" && typeof candidate.plotId === "string" && typeof candidate.title === "string"
      ? [{ id: candidate.entityId, plotId: candidate.plotId, title: candidate.title, deadlineAt: typeof candidate.deadlineAt === "string" ? candidate.deadlineAt : null, resolution: "pending" }]
      : [];
  });
}

function dashboardFromContext(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as { dashboard?: Record<string, unknown> }).dashboard : undefined;
}

function openLoopsFromContext(value: unknown): OpenLoopReference[] {
  return (Array.isArray(dashboardFromContext(value)?.openLoops) ? dashboardFromContext(value)!.openLoops as unknown[] : []).flatMap((item) => {
    const candidate = item as { id?: unknown; plotId?: unknown; title?: unknown };
    return typeof candidate.id === "string" && typeof candidate.plotId === "string" ? [{ id: candidate.id, plotId: candidate.plotId, title: typeof candidate.title === "string" ? candidate.title : candidate.id }] : [];
  });
}

function requiredInputsFromContext(value: unknown): RequiredInputReference[] {
  return (Array.isArray(dashboardFromContext(value)?.requiredInputs) ? dashboardFromContext(value)!.requiredInputs as unknown[] : []).flatMap((item) => {
    const candidate = item as { id?: unknown; plotId?: unknown };
    return typeof candidate.id === "string" && typeof candidate.plotId === "string" ? [{ id: candidate.id, plotId: candidate.plotId }] : [];
  });
}

interface PlotReference { id: string; title: string; parentPlotId?: string | null }
interface OpenLoopReference { id: string; plotId: string; title: string }
interface RequiredInputReference { id: string; plotId: string }

export interface AuthoritativeEntityIndex {
  plots: Map<string, { parentPlotId: string | null | undefined }>;
  actions: Map<string, { plotId?: string }>;
  openLoops: Map<string, { plotId: string }>;
  requiredInputs: Map<string, { plotId: string }>;
}

function normalizeReference(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR");
}

export function findExplicitPlotReference(message: string, plots: PlotReference[]): PlotReference | null {
  const normalizedMessage = normalizeReference(message);
  return plots
    .filter((plot) => normalizeReference(plot.title).length >= 3 && normalizedMessage.includes(normalizeReference(plot.title)))
    .sort((left, right) => right.title.length - left.title.length)[0] ?? null;
}

const defaultMaxTurns = 4;
const maxPromptMessageChars = 9_000;
const maxSingleMessageChars = 4_000;

function clip(value: string, limit = maxSingleMessageChars): string {
  if (value.length <= limit) return value;
  const marker = "\n[context truncated by Trama host]";
  return `${value.slice(0, Math.max(0, limit - marker.length))}${marker}`;
}

export function compactToolResult(toolName: string, value: unknown): string {
  const projected = toolName === "get_plot_context" ? compactPlotContext(value) : value;
  return clip(JSON.stringify(projected));
}

export function boundedPromptMessages(messages: OllamaMessage[], maxChars = maxPromptMessageChars): OllamaMessage[] {
  if (messages.length === 0) return [];
  const base = messages[0]?.role === "system"
    ? [{ ...messages[0], content: clip(messages[0].content, 2_500) }]
    : [];
  const indexedSystemMessages = messages.flatMap((message, index) => index >= base.length && message.role === "system" ? [{ message, index }] : []);
  const latestByKind = new Map<string, { message: OllamaMessage; index: number }>();
  for (const { message, index } of indexedSystemMessages) {
    const kind = message.content.startsWith("Current operational time:") ? "time"
      : message.content.startsWith("Authoritative visible Plot context") ? "visible-context"
      : message.content.startsWith("The user explicitly referenced") ? "explicit-context"
      : message.content.startsWith("The user is viewing") ? "screen"
      : "other";
    latestByKind.set(kind, { message: { ...message, content: clip(message.content) }, index });
  }
  const allUserIndexes = messages.flatMap((message, index) => message.role === "user" ? [index] : []);
  const previousUserIndex = allUserIndexes.at(-2) ?? -1;
  const explicit = latestByKind.get("explicit-context");
  const explicitAppliesToCurrentTurn = Boolean(explicit && explicit.index > previousUserIndex);
  const pinnedKinds = explicitAppliesToCurrentTurn
    ? ["explicit-context", "time"]
    : ["screen", "visible-context", "time"];
  const pinned = pinnedKinds.flatMap((kind) => latestByKind.get(kind)?.message ?? []);
  const conversation = messages.filter((message, index) => index >= base.length && message.role !== "system")
    .map((message) => ({ ...message, content: clip(message.content) }));
  const userStarts = conversation.flatMap((message, index) => message.role === "user" ? [index] : []);
  const selected: OllamaMessage[] = [];
  let used = [...base, ...pinned].reduce((sum, message) => sum + message.content.length, 0);
  for (let turn = userStarts.length - 1; turn >= 0; turn -= 1) {
    const start = userStarts[turn]!;
    const end = userStarts[turn + 1] ?? conversation.length;
    const group = conversation.slice(start, end);
    const groupSize = group.reduce((sum, message) => sum + message.content.length, 0);
    if (selected.length > 0 && used + groupSize > maxChars) break;
    selected.unshift(...group);
    used += groupSize;
    if (used >= maxChars) break;
  }
  const result = [...base, ...pinned, ...selected];
  let overflow = result.reduce((sum, message) => sum + message.content.length, 0) - maxChars;
  for (let index = 1; index < result.length && overflow > 0; index += 1) {
    const message = result[index]!;
    const removable = Math.max(0, message.content.length - 200);
    const removed = Math.min(removable, overflow);
    if (removed > 0) {
      result[index] = { ...message, content: clip(message.content, message.content.length - removed) };
      overflow -= removed;
    }
  }
  return result;
}

function findRepositoryRoot(): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [process.env.TRAMA_ROOT, process.cwd(), path.resolve(process.cwd(), "../.."), path.resolve(here, "../../..")];
  const root = candidates.find((candidate): candidate is string => Boolean(candidate) && existsSync(path.join(candidate!, "apps/mcp/scripts/start.cjs")));
  if (!root) throw new Error("Could not locate the Trama repository root.");
  return root;
}

function decodeArguments(value: Record<string, unknown> | string): Record<string, unknown> {
  if (typeof value !== "string") return value;
  const decoded = JSON.parse(value) as unknown;
  if (!decoded || typeof decoded !== "object" || Array.isArray(decoded)) {
    throw new Error("Tool arguments must be a JSON object.");
  }
  return decoded as Record<string, unknown>;
}

export function embeddedToolCalls(content: string): OllamaToolCall[] {
  const calls: OllamaToolCall[] = [];
  const pattern = /<(?:function_call|tool_call)>\s*([\s\S]*?)\s*<\/(?:function_call|tool_call)>/gi;
  for (const match of content.matchAll(pattern)) {
    if (!match[1]) continue;
    try {
      const decoded = JSON.parse(match[1]) as { name?: unknown; arguments?: unknown };
      if (typeof decoded.name === "string") {
        calls.push({ function: { name: decoded.name, arguments: typeof decoded.arguments === "object" && decoded.arguments !== null ? decoded.arguments as Record<string, unknown> : String(decoded.arguments ?? "{}") } });
      }
    } catch {
      // The model output remains ordinary text if the embedded payload is malformed.
    }
  }
  return calls;
}

export function visibleAnswer(content: string): string {
  return content
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .replace(/^[\s\S]*?<\/think>/i, "")
    .replace(/<(?:function_call|tool_call)>[\s\S]*?<\/(?:function_call|tool_call)>/gi, "")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .trim();
}

export function likelyWriteRequest(content: string): boolean {
  const normalized = normalizeReference(content);
  return /\b(mude|mudar|altere|alterar|atualize|atualizar|renomeie|renomear|remarque|remarcar|reagende|reagendar|registre|registrar|adicione|adicionar|crie|criar|feche|fechar|conclua|concluir|cancele|cancelar|remova|remover)\b/.test(normalized);
}

/** External evidence must be retrieved, rather than inferred from its outline. */
export function requiresExternalInvestigationEvidence(message: string, hasExternalTools: boolean): boolean {
  if (!hasExternalTools || likelyWriteRequest(message)) return false;
  return /\b(evidenc\w*|fontes?|sources?|records?|registros?|hypothes\w*|hip[oó]tes\w*|causas?|causes?|explain\w*|explic\w*|compare\w*|compar\w*|chronolog\w*|cronolog\w*|sequence|sequ[eê]ncia|timeline|investigat\w*|investiga\w*|rank|classifi\w*|separate|separ\w*)\b/i.test(message);
}

export function isRescheduleRequest(content: string, locale = "pt-BR"): boolean {
  const normalized = normalizeReference(content);
  return resolveSupportedLocale(locale) === "en-US"
    ? /\b(reschedul|postpon|delay|move|change|update|push)\w*\b/.test(normalized) && /\b(deadline|date|day|time|week|month|year|minute|hour|today|tomorrow|yesterday)\b/.test(normalized)
    : /\b(remarc|reagend|adi|mude|mud|alter|atualiz|pass|jog|empurr)\w*\b/.test(normalized) && /\b(prazo|data|dia|horario|hora|revisao|semana|mes|ano|minuto|hoje|amanha|ontem)\b/.test(normalized);
}

export function isReopenActionRequest(content: string, locale = "pt-BR"): boolean {
  const normalized = normalizeReference(content);
  return resolveSupportedLocale(locale) === "en-US"
    ? /\b(reopen|reactivate|resume)\w*\b/.test(normalized) && /\b(action|step|commitment)\b/.test(normalized)
    : /\b(reabr|reativ|retom)\w*\b/.test(normalized) && /\b(acao|passo|compromisso)\b/.test(normalized);
}

export function validateWriteProposal(toolName: string, args: Record<string, unknown>, userMessage: string, index: AuthoritativeEntityIndex, locale = "pt-BR"): string | null {
  const normalized = normalizeReference(userMessage);
  const actionIntent = resolveSupportedLocale(locale) === "en-US" ? /\b(action|step|commitment)\b/.test(normalized) : /\b(acao|passo|compromisso)\b/.test(normalized);
  const openLoopIntent = resolveSupportedLocale(locale) === "en-US" ? /\b(open loop|unresolved question)\b/.test(normalized) : /\b(ponta solta|questao em aberto)\b/.test(normalized);
  const actionTargetTool = ["record_action_step", "record_action_update", "reschedule_action", "rename_action"].includes(toolName);
  const actionEntityTool = actionTargetTool || toolName === "create_action";
  if (actionIntent && !actionEntityTool) return "The user referred to an Action, but the proposed tool targets another entity.";
  if (openLoopIntent && !["create_open_loop", "close_open_loop", "create_action"].includes(toolName)) return "The user referred to an OpenLoop, but the proposed tool targets another entity.";

  const requireKnown = (key: string, collection: Map<string, unknown>, entity: string, nullable = false): string | null => {
    const value = args[key];
    if (nullable && (value === null || value === undefined)) return null;
    return typeof value !== "string" || !collection.has(value) ? `The proposed ${entity} target ${key} is missing or does not exist in authoritative MCP context.` : null;
  };
  if (["move_plot", "rename_plot", "set_plot_visibility", "set_plot_status", "set_plot_lifecycle_type", "create_open_loop", "create_action"].includes(toolName)) {
    const error = requireKnown("plotId", index.plots, "Plot"); if (error) return error;
  }
  if (toolName === "create_plot" || toolName === "move_plot") {
    const error = requireKnown("parentPlotId", index.plots, "parent Plot", true); if (error) return error;
    const parentId = args.parentPlotId;
    if (typeof parentId === "string" && index.plots.get(parentId)?.parentPlotId) return "A Case cannot be used as a parent; only a root Plot can contain a Case.";
    if (toolName === "move_plot" && args.plotId === parentId) return "A Plot cannot be its own parent.";
  }
  if (actionTargetTool) { const error = requireKnown("actionId", index.actions, "Action"); if (error) return error; }
  if (toolName === "apply_action_batch") {
    if (!Array.isArray(args.operations) || args.operations.length < 2) return "An Action batch requires at least two explicit operations.";
    for (const operation of args.operations) {
      if (!operation || typeof operation !== "object" || Array.isArray(operation)) return "Every Action batch item must be an object.";
      const actionId = (operation as { actionId?: unknown }).actionId;
      if (typeof actionId !== "string" || !index.actions.has(actionId)) return "Every Action batch item must target an Action that exists in authoritative MCP context.";
    }
  }
  if (toolName === "close_open_loop") { const error = requireKnown("openLoopId", index.openLoops, "OpenLoop"); if (error) return error; }
  if (toolName === "answer_required_input") { const error = requireKnown("requiredInputId", index.requiredInputs, "RequiredInput"); if (error) return error; }
  if (toolName === "create_action" && typeof args.openLoopId === "string") {
    const openLoop = index.openLoops.get(args.openLoopId);
    if (!openLoop) return "The proposed OpenLoop does not exist in authoritative MCP context.";
    if (openLoop.plotId !== args.plotId) return "The proposed OpenLoop belongs to a different Plot.";
  }
  return null;
}

export function writeResolutionMessage(description: string, approved: boolean, locale = "pt-BR"): string {
  if (!approved) return resolveSupportedLocale(locale) === "pt-BR" ? "Alteração não executada." : "Change not executed.";
  return resolveSupportedLocale(locale) === "pt-BR" ? `Concluído: ${description}.` : `Completed: ${description}.`;
}

export function claimsPersistedMutation(content: string): boolean {
  const normalized = normalizeReference(content);
  return /\b(foi|foram|esta|estao)\s+(atualizad[oa]s?|alterad[oa]s?|registrad[oa]s?|criad[oa]s?|concluid[oa]s?|remarcad[oa]s?|salv[oa]s?)\b/.test(normalized)
    || /\b(alteracao|atualizacao|mudanca)\s+(foi\s+)?(aplicada|salva|registrada)\b/.test(normalized);
}

type StepDeadlineDraft = { tool: McpToolDescriptor; arguments: Record<string, unknown> };

export function keepsCurrentDeadline(input: string, locale = "pt-BR"): boolean {
  const normalized = normalizeReference(input);
  return resolveSupportedLocale(locale) === "en-US"
    ? /\b(keep|same|unchanged|do not change)\b.*\b(deadline|date)?\b/.test(normalized)
    : /\b(mantem|manter|continua|mesmo|mesma|nao muda|sem alterar)\b.*\b(prazo|data)?\b/.test(normalized);
}

export function needsStepDeadlineDecision(toolName: string, toolArguments: Record<string, unknown>): boolean {
  if (toolName === "record_action_step") return true;
  return toolName === "record_action_update"
    && typeof toolArguments.progress === "string"
    && ["pending", "inProgress", "waiting", "blocked", "delegated"].includes(String(toolArguments.resolution))
    && !("deadlineAt" in toolArguments);
}

export class LocalTramaAgent {
  readonly model: string;
  readonly provider: AgentProviderName;
  private writeMode: boolean;
  private readonly baseUrl: string;
  private readonly databasePath: string;
  private readonly timeoutMs: number;
  private readonly maxTurns: number;
  private readonly modelProvider: AgentModelProvider;
  private readonly root: string;
  private readonly client = new Client({ name: "trama-agent-host", version: "0.1.0" });
  private transport: Transport | null = null;
  private readonly providedTransport: Transport | undefined;
  private readonly externalReadContext: string | undefined;
  private readonly externalReadTools: ExternalReadTool[];
  private messages: OllamaMessage[] = [];
  private tools: McpToolDescriptor[] = [];
  private allTools: McpToolDescriptor[] = [];
  private pending: { tool: McpToolDescriptor; arguments: Record<string, unknown>; callId?: string } | null = null;
  private screenContextSignature = "";
  private plotIndex: PlotReference[] = [];
  private actionIndex = new Map<string, { title: string; deadlineAt: string | null; resolution: string }>();
  private actionPlotIndex = new Map<string, string>();
  private openLoopIndex = new Map<string, OpenLoopReference>();
  private requiredInputIndex = new Map<string, RequiredInputReference>();
  private visibleActionId: string | null = null;
  private activeWorkflow: ActionWorkflow | null = null;
  private reopenAwaitingDeadlineActionId: string | null = null;
  private stepAwaitingDeadline: StepDeadlineDraft | null = null;
  private locale: SupportedLocale = "pt-BR";
  private timeZone = "America/Sao_Paulo";

  constructor(options: LocalAgentOptions = {}) {
    this.providedTransport = options.mcpTransport;
    this.externalReadContext = options.externalReadContext;
    this.externalReadTools = options.externalReadTools ?? [];
    this.root = findRepositoryRoot();
    this.provider = options.provider ?? "ollama";
    this.model = options.model ?? (this.provider === "openai" ? process.env.TRAMA_OPENAI_MODEL ?? "gpt-5.6-terra" : process.env.TRAMA_OLLAMA_MODEL ?? "trama-agent");
    this.writeMode = options.allowWrites ?? false;
    this.baseUrl = (options.baseUrl ?? (this.provider === "openai" ? process.env.TRAMA_OPENAI_BASE_URL ?? "https://api.openai.com/v1" : process.env.TRAMA_OLLAMA_BASE_URL ?? "http://127.0.0.1:11434")).replace(/\/$/, "");
    this.databasePath = options.databasePath ?? process.env.TRAMA_DATABASE_PATH ?? path.join(this.root, ".trama/trama.db");
    const configuredTimeout = options.timeoutMs ?? Number(process.env.TRAMA_AGENT_TIMEOUT_MS ?? process.env.TRAMA_OLLAMA_TIMEOUT_MS ?? "180000");
    const configuredTurns = options.maxTurns ?? Number(process.env.TRAMA_AGENT_MAX_TURNS ?? process.env.TRAMA_OLLAMA_MAX_TURNS ?? String(defaultMaxTurns));
    this.timeoutMs = Number.isFinite(configuredTimeout) && configuredTimeout > 0 ? configuredTimeout : 180_000;
    this.maxTurns = Number.isInteger(configuredTurns) && configuredTurns > 0 ? Math.min(configuredTurns, 8) : defaultMaxTurns;
    const configuredContextWindow = Number(process.env.TRAMA_OLLAMA_CONTEXT_SIZE ?? "4096");
    this.modelProvider = createAgentModelProvider(this.provider, { model: this.model, baseUrl: this.baseUrl, timeoutMs: this.timeoutMs, ...(this.provider === "ollama" && Number.isInteger(configuredContextWindow) && configuredContextWindow >= 4096 ? { contextWindow: configuredContextWindow } : {}), ...(options.apiKey ? { apiKey: options.apiKey } : {}) });
  }

  async connect(): Promise<void> {
    if (this.transport) return;
    this.transport = this.providedTransport ?? new StdioClientTransport({
      command: process.execPath,
      args: [path.join(this.root, "apps/mcp/scripts/start.cjs"), path.join(this.root, "apps/mcp/src/server.ts")],
      cwd: this.root,
      env: {
        ...Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined)),
        TRAMA_DATABASE_PATH: this.databasePath
      },
      stderr: "inherit"
    });
    await this.client.connect(this.transport);
    const listed = await this.client.listTools();
    this.allTools = listed.tools as McpToolDescriptor[];
    this.refreshTools();
    const plotResult = await this.client.callTool({ name: "list_plots", arguments: {} });
    const plotData = "structuredContent" in plotResult ? plotResult.structuredContent as { plots?: unknown[] } | undefined : undefined;
    this.plotIndex = (plotData?.plots ?? []).flatMap((plot) => {
      if (!plot || typeof plot !== "object") return [];
      const candidate = plot as { id?: unknown; title?: unknown; parentPlotId?: unknown };
      return typeof candidate.id === "string" && typeof candidate.title === "string" ? [{ id: candidate.id, title: candidate.title, parentPlotId: typeof candidate.parentPlotId === "string" ? candidate.parentPlotId : null }] : [];
    });
    const instructions = this.client.getInstructions() ?? "Use Trama as the operational source of truth.";
    this.messages = [{
      role: "system",
      content: [
        instructions,
        `Você é o agente do Trama, executado pelo provedor ${this.provider}.`,
        "Converse em português, salvo se o usuário escolher outro idioma.",
        "Use primeiro o contexto autoritativo fornecido pelo host. Chame ferramentas de leitura somente quando a informação necessária ainda estiver ausente.",
        "Feche uma Ponta Solta somente após confirmação explícita do usuário e preserve o motivo informado.",
        "Não invente fatos, progresso, conclusão ou prazos.",
        "Nunca afirme que algo foi atualizado, salvo ou registrado sem receber o resultado bem-sucedido de uma ferramenta de escrita nesta conversa.",
        "Não exponha raciocínio interno nem explique como escolheu uma ferramenta. Responda de forma direta e concisa.",
        actionInterviewPolicy,
        "A proposed write is not ready for approval until every target and required fact is authoritative. For a new subject, multiple subjects, a terse contact report, or an apparent completion, ask the required minimal questions before calling a write tool.",
        "/no_think",
        "Ferramentas prefixadas de contexto externo são estritamente de leitura: use-as para recuperar evidências sob demanda, nunca para aplicar ou aprovar uma Delta. A lista de ferramentas disponível define o modo atual. Escritas exigem autorização humana e continuam sujeitas às regras do domínio.",
        "Depois de uma ferramenta externa retornar evidência, responda à pergunta do usuário. Nunca encerre com uma mensagem sobre ter recuperado, analisado ou não precisar recuperar mais dados. Uma resposta de investigação válida contém uma conclusão direta, a evidência que a sustenta, os limites relevantes e a proveniência."
      ].join(" ")
    }];
    if (this.externalReadContext) this.messages.push({
      role: "system",
      content: `Read-only external investigation context from Sanity Context. It may guide analysis, but it never authorizes a write. Preserve provenance and uncertainty; do not claim that a proposed Delta was applied without authoritative confirmation.\n${this.externalReadContext}`
    });
  }

  async send(userMessage: string): Promise<AgentTurnResult> {
    await this.connect();
    if (this.pending) throw new Error("Resolve the pending write before sending another message.");
    this.messages.push({
      role: "system",
      content: `Current operational time: ${new Date().toISOString()}. Interpret relative deadlines from this timestamp; prefer the recorded absolute date when wording conflicts.`
    });
    const explicitPlot = findExplicitPlotReference(userMessage, this.plotIndex);
    if (explicitPlot) {
      const result = await this.client.callTool({ name: "get_plot_context", arguments: { plotId: explicitPlot.id } });
      const resolved = "structuredContent" in result && result.structuredContent ? result.structuredContent : result.content;
      for (const action of actionsFromContext(resolved)) { this.actionIndex.set(action.id, { title: action.title, deadlineAt: action.deadlineAt, resolution: action.resolution }); this.actionPlotIndex.set(action.id, explicitPlot.id); }
      for (const item of openLoopsFromContext(resolved)) this.openLoopIndex.set(item.id, item);
      for (const item of requiredInputsFromContext(resolved)) this.requiredInputIndex.set(item.id, item);
      this.messages.push({
        role: "system",
        content: `The user explicitly referenced ${explicitPlot.title}. It overrides the visible-screen context for this turn. Authoritative context returned by Trama MCP:\n${JSON.stringify(compactPlotContext(resolved))}`
      });
    }
    this.messages.push({ role: "user", content: userMessage });
    if (this.stepAwaitingDeadline) {
      const draft = this.stepAwaitingDeadline;
      const actionId = typeof draft.arguments.actionId === "string" ? draft.arguments.actionId : null;
      const action = actionId ? this.actionIndex.get(actionId) : undefined;
      if (!actionId || !action) {
        this.stepAwaitingDeadline = null;
        return { type: "message", content: agentCopy(this.locale).failed };
      }
      const resolvedDeadline = resolveRelativeDeadline(userMessage, new Date(), this.locale);
      if (!keepsCurrentDeadline(userMessage, this.locale) && !resolvedDeadline) {
        return { type: "message", content: this.locale === "pt-BR"
          ? `O prazo de conclusÃ£o de â€œ${action.title}â€ continua em ${formatAgentDate(action.deadlineAt, this.locale, this.timeZone)} ou deve mudar? Se mudar, para quando?`
          : `Does the completion deadline for â€œ${action.title}â€ remain ${formatAgentDate(action.deadlineAt, this.locale, this.timeZone)}, or should it change?` };
      }
      let pending = draft;
      if (resolvedDeadline) {
        const updateTool = this.tools.find((candidate) => candidate.name === "record_action_update");
        if (!updateTool) return { type: "message", content: agentCopy(this.locale).failed };
        pending = {
          tool: updateTool,
          arguments: {
            ...draft.arguments,
            resolution: typeof draft.arguments.resolution === "string" ? draft.arguments.resolution : action.resolution,
            deadlineAt: resolvedDeadline.deadlineAt
          }
        };
      }
      this.stepAwaitingDeadline = null;
      this.pending = pending;
      return { type: "approval", approval: this.approvalFor(pending.tool, pending.arguments) };
    }
    const awaitedReopenDeadline = this.reopenAwaitingDeadlineActionId ? resolveRelativeDeadline(userMessage, new Date(), this.locale) : null;
    if (this.reopenAwaitingDeadlineActionId && awaitedReopenDeadline) {
      if (!this.writeMode) return { type: "message", content: agentCopy(this.locale).writeDisabled };
      const actionId = this.reopenAwaitingDeadlineActionId;
      const action = this.actionIndex.get(actionId);
      const tool = this.tools.find((candidate) => candidate.name === "record_action_update");
      if (!action || !tool) { this.reopenAwaitingDeadlineActionId = null; return { type: "message", content: agentCopy(this.locale).failed }; }
      const toolArguments = { actionId, resolution: "pending", deadlineAt: awaitedReopenDeadline.deadlineAt, progress: this.locale === "pt-BR" ? "Ação reaberta conforme solicitação do usuário." : "Action reopened at the user's request." };
      this.reopenAwaitingDeadlineActionId = null;
      this.pending = { tool, arguments: toolArguments };
      return { type: "approval", approval: this.approvalFor(tool, toolArguments) };
    }
    const rescheduleRequested = isRescheduleRequest(userMessage, this.locale);
    const reopenRequested = isReopenActionRequest(userMessage, this.locale);
    const writeRequested = likelyWriteRequest(userMessage) || rescheduleRequested || reopenRequested;
    if (writeRequested && !this.writeMode) {
      return { type: "message", content: agentCopy(this.locale).writeDisabled };
    }
    const relativeDeadline = rescheduleRequested ? resolveRelativeDeadline(userMessage, new Date(), this.locale) : null;
    if (rescheduleRequested && relativeDeadline) {
      if (!this.visibleActionId || !this.actionIndex.has(this.visibleActionId)) {
        return { type: "message", content: agentCopy(this.locale).askAction };
      }
      const tool = this.tools.find((candidate) => candidate.name === "reschedule_action");
      if (!tool) return { type: "message", content: agentCopy(this.locale).failed };
      const toolArguments = { actionId: this.visibleActionId, deadlineAt: relativeDeadline.deadlineAt };
      this.pending = { tool, arguments: toolArguments };
      return { type: "approval", approval: this.approvalFor(tool, toolArguments) };
    }
    if (reopenRequested) {
      const explicitAction = [...this.actionIndex.entries()]
        .filter(([, action]) => normalizeReference(userMessage).includes(normalizeReference(action.title)))
        .sort((left, right) => right[1].title.length - left[1].title.length)[0];
      const actionId = explicitAction?.[0] ?? this.visibleActionId;
      const action = actionId ? this.actionIndex.get(actionId) : undefined;
      if (!actionId || !action) return { type: "message", content: agentCopy(this.locale).askAction };
      if (["pending", "inProgress", "waiting", "blocked", "delegated"].includes(action.resolution)) {
        return { type: "message", content: this.locale === "pt-BR" ? `A ação “${action.title}” já está ativa.` : `The action “${action.title}” is already active.` };
      }
      if (!action.deadlineAt || new Date(action.deadlineAt).getTime() < Date.now()) {
        this.reopenAwaitingDeadlineActionId = actionId;
        return { type: "message", content: this.locale === "pt-BR" ? `Para reabrir a ação “${action.title}”, qual deve ser o novo prazo de conclusão?` : `What should the new completion deadline be for “${action.title}”?` };
      }
      const tool = this.tools.find((candidate) => candidate.name === "record_action_update");
      if (!tool) return { type: "message", content: agentCopy(this.locale).failed };
      const toolArguments = { actionId, resolution: "pending", progress: this.locale === "pt-BR" ? "Ação reaberta conforme solicitação do usuário." : "Action reopened at the user's request." };
      this.pending = { tool, arguments: toolArguments };
      return { type: "approval", approval: this.approvalFor(tool, toolArguments) };
    }
    const explicitlyNamedAction = [...this.actionIndex.entries()]
      .filter(([, action]) => normalizeReference(userMessage).includes(normalizeReference(action.title)))
      .sort((left, right) => right[1].title.length - left[1].title.length)[0];
    const workflowActionId = explicitlyNamedAction?.[0] ?? this.visibleActionId;
    const workflowAction = workflowActionId ? this.actionIndex.get(workflowActionId) : undefined;
    const turnWorkflow = workflowActionId && workflowAction
      ? buildActionWorkflow({ id: workflowActionId, ...workflowAction }, this.locale)
      : null;
    const workflowTools = turnWorkflow
      ? this.tools.filter((tool) => tool.annotations?.readOnlyHint === true || turnWorkflow.allowedToolNames.includes(tool.name))
      : this.tools;
    const turnTools = rescheduleRequested
      ? this.tools.filter((tool) => tool.annotations?.readOnlyHint === true || tool.name === "reschedule_action")
      : workflowTools;
    return this.continueTurn(writeRequested, turnTools, turnWorkflow);
  }

  async setScreenContext(context: AgentScreenContext): Promise<void> {
    this.locale = resolveSupportedLocale(context.locale);
    this.timeZone = context.timeZone || "America/Sao_Paulo";
    const signature = JSON.stringify(context);
    if (signature === this.screenContextSignature) return;
    this.screenContextSignature = signature;
    this.visibleActionId = null;
    this.activeWorkflow = null;
    this.reopenAwaitingDeadlineActionId = null;
    this.stepAwaitingDeadline = null;
    this.messages.push({
      role: "system",
      content: screenContextInstruction(context)
    });
    if (context.plotId) {
      const result = await this.client.callTool({ name: "get_plot_context", arguments: { plotId: context.plotId } });
      const resolved = "structuredContent" in result && result.structuredContent ? result.structuredContent : result.content;
      for (const action of actionsFromContext(resolved)) { this.actionIndex.set(action.id, { title: action.title, deadlineAt: action.deadlineAt, resolution: action.resolution }); this.actionPlotIndex.set(action.id, context.plotId); }
      for (const item of openLoopsFromContext(resolved)) this.openLoopIndex.set(item.id, item);
      for (const item of requiredInputsFromContext(resolved)) this.requiredInputIndex.set(item.id, item);
      this.messages.push({
        role: "system",
        content: `Authoritative visible Plot context returned by Trama MCP:\n${JSON.stringify(compactPlotContext(resolved))}`
      });
      const visibleAction = context.actionId ? this.actionIndex.get(context.actionId) : undefined;
      this.visibleActionId = context.actionId && visibleAction ? context.actionId : null;
      if (context.actionId && visibleAction) {
        this.activeWorkflow = buildActionWorkflow({ id: context.actionId, ...visibleAction }, this.locale);
        this.messages.push({
          role: "system",
          content: `The user has expanded the Action "${visibleAction.title}" (${context.actionId}) on the current screen. Treat ambiguous references to "esta ação" or "ela" as this Action. In Trama, "prazo" means the completion deadline; review timing follows a global policy and is never requested from the user. Before proposing a write, make the Action title and the exact intended change visible in Portuguese. ${actionWorkflowInstruction(this.activeWorkflow)}`
        });
      }
    }
  }

  setWriteMode(enabled: boolean): void {
    this.writeMode = enabled;
    this.refreshTools();
  }

  addConversationMemory(messages: Array<{ role: "user" | "assistant"; content: string }>): void {
    if (messages.length === 0) return;
    this.messages.push({
      role: "system",
      content: `Previous conversations about this same focused entity, supplied as optional memory. Use them only as historical context; current authoritative MCP records and the user's new message take precedence:\n${messages.map((message) => `${message.role}: ${message.content}`).join("\n")}`
    });
  }

  getActiveWorkflow(): ActionWorkflow | null {
    return this.activeWorkflow;
  }

  prepareGuidedAction(input: GuidedActionInput): AgentTurnResult {
    if (!this.writeMode) return { type: "message", content: agentCopy(this.locale).writeDisabled };
    const action = this.actionIndex.get(input.actionId);
    const workflow = this.activeWorkflow;
    if (!action || !workflow || workflow.entityId !== input.actionId) {
      throw new Error("A ação guiada não pertence ao contexto atualmente aberto.");
    }
    const requestError = validateGuidedActionRequest(workflow, input);
    if (requestError) throw new Error(`O fluxo guiado bloqueou esta alteração: ${requestError}`);
    const proposal = buildGuidedActionProposal(input);
    const tool = this.tools.find((candidate) => candidate.name === proposal.toolName);
    if (!tool) throw new Error("A operação escolhida não está disponível neste modo.");
    const workflowError = validateActionWorkflowProposal(workflow, tool.name, proposal.arguments);
    if (workflowError) throw new Error(`O fluxo guiado bloqueou esta alteração: ${workflowError}`);
    this.pending = { tool, arguments: proposal.arguments };
    return { type: "approval", approval: this.approvalFor(tool, proposal.arguments) };
  }

  private approvalFor(tool: McpToolDescriptor, toolArguments: Record<string, unknown>): PendingWrite {
    const action = typeof toolArguments.actionId === "string" ? this.actionIndex.get(toolArguments.actionId) : undefined;
    const plot = typeof toolArguments.plotId === "string" ? this.plotIndex.find((item) => item.id === toolArguments.plotId) : undefined;
    const localized = agentCopy(this.locale);
    if (["record_action_step", "record_action_update", "reschedule_action", "rename_action"].includes(tool.name) && !action) {
      throw new Error("Trama blocked a write confirmation because the Action target is not authoritative.");
    }
    const isReopening = tool.name === "record_action_update" && toolArguments.resolution === "pending" && Boolean(action && !["pending", "inProgress", "waiting", "blocked", "delegated"].includes(action.resolution));
    const resolutionCopy: Record<string, string> = { pending: "pendente", inProgress: "em andamento", waiting: "aguardando", blocked: "bloqueada", completed: "concluída", failed: "sem sucesso", cancelled: "cancelada", delegated: "delegada", noLongerNeeded: "não é mais necessária" };
    const batchSummary = () => {
      const operations = Array.isArray(toolArguments.operations) ? toolArguments.operations : [];
      const lines = operations.flatMap((raw, index) => {
        if (!raw || typeof raw !== "object" || Array.isArray(raw)) return [];
        const operation = raw as Record<string, unknown>;
        const target = typeof operation.actionId === "string" ? this.actionIndex.get(operation.actionId) : undefined;
        const title = target?.title ?? "ação não identificada";
        const detail = operation.operation === "rename"
          ? `renomear “${title}” para “${String(operation.title)}”, preservando seu histórico`
          : operation.operation === "recordStep"
            ? `registrar em “${title}” o passo: “${String(operation.progress)}”, sem mudar estado ou prazo`
            : operation.operation === "reschedule"
              ? `mudar o prazo de “${title}” para ${formatAgentDate(operation.deadlineAt, this.locale, this.timeZone)}, mantendo seu estado`
              : operation.operation === "update"
                ? `registrar em “${title}”: “${String(operation.progress)}” e deixá-la como ${resolutionCopy[String(operation.resolution)] ?? String(operation.resolution)}${typeof operation.deadlineAt === "string" ? `, com prazo em ${formatAgentDate(operation.deadlineAt, this.locale, this.timeZone)}` : ""}`
                : `aplicar uma alteração em “${title}”`;
        return [`${index + 1}. Vou ${detail}.`];
      });
      return `Antes de executar, confira o que vou fazer:\n${lines.join("\n")} Cada alteração será validada e auditada separadamente.`;
    };
    const description = tool.name === "reschedule_action"
      ? localized.description(action?.title ?? localized.unknownAction)
      : isReopening
        ? this.locale === "pt-BR" ? `Reabrir a ação “${action!.title}”` : `Reopen the action “${action!.title}”`
      : tool.name === "record_action_step"
        ? this.locale === "pt-BR" ? `Registrar passo na ação “${action!.title}”` : `Record a step in “${action!.title}”`
      : tool.name === "record_action_update"
        ? `Registrar atualização na ação “${action?.title ?? "ação não identificada"}”`
        : tool.name === "rename_action"
          ? `Renomear a ação “${action?.title ?? "ação não identificada"}”`
        : tool.name === "apply_action_batch"
          ? `Aplicar ${Array.isArray(toolArguments.operations) ? toolArguments.operations.length : 0} alterações em lote`
        : tool.name === "rename_plot"
          ? this.locale === "pt-BR" ? `Renomear “${plot?.title ?? "Trama ou Caso não identificado"}”` : `Rename “${plot?.title ?? "unknown Plot"}”`
        : "Confirmar alteração no Trama";
    const summary = tool.name === "reschedule_action"
      ? localized.summary(action?.title ?? localized.unknownAction, formatAgentDate(toolArguments.deadlineAt, this.locale, this.timeZone), typeof toolArguments.deadlineAt === "string" && new Date(toolArguments.deadlineAt).getTime() < Date.now())
      : isReopening
        ? this.locale === "pt-BR"
          ? `A ação “${action!.title}” voltará ao estado pendente${typeof toolArguments.deadlineAt === "string" ? `, com prazo de conclusão em ${formatAgentDate(toolArguments.deadlineAt, this.locale, this.timeZone)}` : ""}. A Trama ou Caso que contém essa ação não terá seu status alterado.`
          : `The action “${action!.title}” will return to pending${typeof toolArguments.deadlineAt === "string" ? ` with a completion deadline of ${formatAgentDate(toolArguments.deadlineAt, this.locale, this.timeZone)}` : ""}. Its containing Plot will not change status.`
      : tool.name === "record_action_step"
        ? this.locale === "pt-BR" ? `Adicionar ao histórico de “${action!.title}”: “${String(toolArguments.progress)}”. O estado, o prazo e o resultado da ação não serão alterados.` : `Add to the history of “${action!.title}”: “${String(toolArguments.progress)}”. Its state, deadline, and outcome will not change.`
      : tool.name === "rename_plot"
        ? this.locale === "pt-BR"
          ? `O título mudará para “${String(toolArguments.title)}”. O identificador, as relações e o histórico serão preservados.`
          : `The title will change to “${String(toolArguments.title)}”. The identifier, relationships, and history will be preserved.`
        : tool.name === "rename_action"
          ? `O título da ação mudará para “${String(toolArguments.title)}”. ID, histórico, prazo e estado serão preservados.`
        : tool.name === "record_action_update"
          ? `Vou registrar em “${action!.title}” o acontecimento “${String(toolArguments.progress)}” e mudar seu estado para ${resolutionCopy[String(toolArguments.resolution)] ?? String(toolArguments.resolution)}${typeof toolArguments.deadlineAt === "string" ? `, com prazo de conclusão em ${formatAgentDate(toolArguments.deadlineAt, this.locale, this.timeZone)}` : ""}. Nenhuma outra ação será alterada.`
        : tool.name === "apply_action_batch"
          ? batchSummary()
        : `Vou executar “${description}” usando somente os dados apresentados abaixo. Nenhuma outra entidade será alterada.`;
    return { toolName: tool.name, description, summary, arguments: toolArguments };
  }

  async resolveWrite(approved: boolean): Promise<AgentTurnResult> {
    if (!this.pending) throw new Error("There is no pending write to resolve.");
    const pending = this.pending;
    this.pending = null;
    if (approved) {
      const result = await this.client.callTool({ name: pending.tool.name, arguments: pending.arguments });
      if (pending.tool.name === "rename_plot" && typeof pending.arguments.plotId === "string" && typeof pending.arguments.title === "string") {
        this.plotIndex = this.plotIndex.map((plot) => plot.id === pending.arguments.plotId ? { ...plot, title: pending.arguments.title as string } : plot);
      }
      if (pending.tool.name === "rename_action" && typeof pending.arguments.actionId === "string" && typeof pending.arguments.title === "string") {
        const current = this.actionIndex.get(pending.arguments.actionId);
        if (current) this.actionIndex.set(pending.arguments.actionId, { ...current, title: pending.arguments.title });
      }
      if (typeof pending.arguments.actionId === "string") {
        const action = this.actionIndex.get(pending.arguments.actionId);
        if (action) {
          const updated = {
            ...action,
            ...(typeof pending.arguments.resolution === "string" ? { resolution: pending.arguments.resolution } : {}),
            ...(typeof pending.arguments.deadlineAt === "string" ? { deadlineAt: pending.arguments.deadlineAt } : {})
          };
          this.actionIndex.set(pending.arguments.actionId, updated);
          if (this.visibleActionId === pending.arguments.actionId) {
            this.activeWorkflow = buildActionWorkflow({ id: pending.arguments.actionId, ...updated }, this.locale);
          }
        }
      }
      this.messages.push({
        role: "tool",
        tool_name: pending.tool.name,
        ...(pending.callId ? { tool_call_id: pending.callId } : {}),
        content: compactToolResult(pending.tool.name,
          "structuredContent" in result && result.structuredContent ? result.structuredContent : result.content)
      });
      const content = writeResolutionMessage(this.approvalFor(pending.tool, pending.arguments).description, true, this.locale);
      this.messages.push({ role: "assistant", content });
      return { type: "message", content };
    } else {
      this.messages.push({ role: "tool", tool_name: pending.tool.name, ...(pending.callId ? { tool_call_id: pending.callId } : {}), content: "The user declined this write operation." });
      const content = writeResolutionMessage("", false, this.locale);
      this.messages.push({ role: "assistant", content });
      return { type: "message", content };
    }
  }

  async close(): Promise<void> {
    if (!this.transport) return;
    await this.transport.close();
    this.transport = null;
  }

  private async continueTurn(writeRequested = false, turnTools = this.tools, workflow: ActionWorkflow | null = null): Promise<AgentTurnResult> {
    let route: WorkflowRoute | null = null;
    if (workflow && this.provider === "ollama" && this.modelProvider.completeStructured) {
      const userMessage = this.messages.filter((message) => message.role === "user").at(-1)?.content ?? "";
      try {
        route = parseWorkflowRoute(await this.modelProvider.completeStructured([
          { role: "system", content: `Classify the user's message for the server-resolved Action workflow. Return only the supplied JSON schema. Do not execute anything. Complete only when the intended outcome is explicitly achieved. Use clarify when the target or requested operation is ambiguous.\n\n${actionWorkflowInstruction(workflow)}\n\nExamples:\n${workflowRoutingExamples(workflow)}` },
          { role: "user", content: userMessage }
        ], workflowDecisionSchema(workflow)), workflow);
      } catch { /* A structured-routing failure must preserve the normal guarded agent path. */ }
    }
    if (route) {
      const confident = route.confidence >= 0.72;
      const allowedWriteTools = confident ? toolsForWorkflowDecision(route.decision) : [];
      turnTools = turnTools.filter((tool) => tool.annotations?.readOnlyHint === true || allowedWriteTools.includes(tool.name));
      this.messages.push({ role: "system", content: confident
        ? `Structured workflow route: ${route.decision} (confidence ${route.confidence}). Only the matching write tool, if any, is available. Keep the user-facing reply concise and ask for a missing required field instead of guessing.`
        : `Structured workflow route is below the safety threshold (${route.confidence}). Do not propose a write. Ask one minimal clarification or direct the user to the guided workflow buttons.` });
    }
    const externalCallCounts = new Map<string, number>();
    let repairedFalseWriteClaim = false;
    let requestedExternalEvidence = false;
    let promptedForExternalEvidence = false;
    const latestUserMessage = this.messages.filter((message) => message.role === "user").at(-1)?.content ?? "";
    turnTools = turnTools.filter((tool) => {
      const external = this.externalReadTools.find((candidate) => candidate.name === tool.name);
      return !external?.eligibleForQuestion || external.eligibleForQuestion(latestUserMessage);
    });
    const mustRetrieveExternalEvidence = !writeRequested && (
      requiresExternalInvestigationEvidence(latestUserMessage, this.externalReadTools.length > 0)
      || this.externalReadTools.some((tool) => tool.eligibleForQuestion?.(latestUserMessage))
    );
    for (let turn = 0; turn < this.maxTurns; turn += 1) {
      const byName = new Map(turnTools.map((tool) => [tool.name, tool]));
      let providerMessage: OllamaMessage;
      try {
        providerMessage = await this.modelProvider.complete(boundedPromptMessages(this.messages), turnTools);
      } catch (error) {
        if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")) {
          throw new Error(`O provedor ${this.provider} não respondeu em ${Math.round(this.timeoutMs / 1000)} segundos. Nada foi alterado.`);
        }
        throw error;
      }
      this.messages.push(providerMessage);
      const calls = providerMessage.tool_calls?.length ? providerMessage.tool_calls : embeddedToolCalls(providerMessage.content);
      if (calls.length === 0) {
        const answer = visibleAnswer(providerMessage.content);
        if (mustRetrieveExternalEvidence && !requestedExternalEvidence) {
          if (promptedForExternalEvidence) return { type: "message", content: this.locale === "pt-BR"
            ? "Não consegui consultar a fonte necessária para responder com segurança. Tente novamente."
            : "I could not retrieve the required source safely. Please try again." };
          promptedForExternalEvidence = true;
          const requiredStateTool = this.externalReadTools.find((tool) => tool.eligibleForQuestion?.(latestUserMessage));
          this.messages.push({ role: "system", content: requiredStateTool
            ? `Retrieval required: call ${requiredStateTool.name} for the authoritative current State, then answer from the returned fields with provenance.`
            : "Retrieval required: call a relevant source-prefixed read-only Context tool, then answer the exact question from its result with provenance." });
          continue;
        }
        if (writeRequested && claimsPersistedMutation(answer)) {
          if (repairedFalseWriteClaim) {
            return { type: "message", content: "Não consegui preparar uma alteração confiável. Nada foi salvo. Informe a data exata desejada para eu tentar novamente." };
          }
          repairedFalseWriteClaim = true;
          this.messages.push({
            role: "system",
            content: "Correction: the previous assistant answer falsely claimed a persisted change without a write-tool result. Do not repeat that claim. Call the appropriate allowed write tool so the host can request human approval, or ask one minimal question if an authoritative field is missing."
          });
          continue;
        }
        return { type: "message", content: answer || (this.locale === "pt-BR"
          ? "Não consegui interpretar essa resposta com segurança. Nada foi alterado. Tente reformular em uma frase."
          : "I could not interpret that response safely. Nothing was changed. Please rephrase it in one sentence.") };
      }

      for (const call of calls) {
        const tool = byName.get(call.function.name);
        const toolArguments = decodeArguments(call.function.arguments);
        if (!tool) {
          this.messages.push({ role: "tool", tool_name: call.function.name, ...(call.id ? { tool_call_id: call.id } : {}), content: "Tool is not allowed in this mode." });
          continue;
        }
        if (tool.annotations?.readOnlyHint !== true) {
          const routeError = route ? validateWorkflowDecisionProposal(route, tool.name, toolArguments) : null;
          if (routeError) {
            this.messages.push({ role: "tool", tool_name: tool.name, ...(call.id ? { tool_call_id: call.id } : {}), content: `Rejected by structured workflow route: ${routeError} Ask one minimal clarification instead.` });
            continue;
          }
          const workflowError = workflow ? validateActionWorkflowProposal(workflow, tool.name, toolArguments) : null;
          if (workflowError) {
            this.messages.push({ role: "tool", tool_name: tool.name, ...(call.id ? { tool_call_id: call.id } : {}), content: `Rejected by deterministic Action workflow: ${workflowError} Choose one allowed path or ask one minimal clarification.` });
            continue;
          }
          const validationError = validateWriteProposal(tool.name, toolArguments, this.messages.filter((message) => message.role === "user").at(-1)?.content ?? "", {
            plots: new Map(this.plotIndex.map((plot) => [plot.id, { parentPlotId: plot.parentPlotId }])),
            actions: new Map([...this.actionPlotIndex].map(([id, plotId]) => [id, { plotId }])),
            openLoops: new Map([...this.openLoopIndex].map(([id, item]) => [id, { plotId: item.plotId }])),
            requiredInputs: new Map([...this.requiredInputIndex].map(([id, item]) => [id, { plotId: item.plotId }]))
          }, this.locale);
          if (validationError) {
            this.messages.push({ role: "tool", tool_name: tool.name, ...(call.id ? { tool_call_id: call.id } : {}), content: `Rejected by Trama host validation: ${validationError} Select a tool matching the user's entity and authoritative ID; do not claim any change occurred.` });
            continue;
          }
          if (needsStepDeadlineDecision(tool.name, toolArguments)) {
            const latestUserMessage = this.messages.filter((message) => message.role === "user").at(-1)?.content ?? "";
            const actionId = typeof toolArguments.actionId === "string" ? toolArguments.actionId : null;
            const action = actionId ? this.actionIndex.get(actionId) : undefined;
            const suppliedDeadline = resolveRelativeDeadline(latestUserMessage, new Date(), this.locale);
            if (!keepsCurrentDeadline(latestUserMessage, this.locale) && !suppliedDeadline) {
              this.stepAwaitingDeadline = { tool, arguments: toolArguments };
              return { type: "message", content: this.locale === "pt-BR"
                ? `Antes de registrar este passo em â€œ${action?.title ?? "esta aÃ§Ã£o"}â€: o prazo de conclusÃ£o continua em ${formatAgentDate(action?.deadlineAt, this.locale, this.timeZone)} ou deve mudar? Se mudar, para quando?`
                : `Before recording this step in â€œ${action?.title ?? "this action"}â€, should its completion deadline remain ${formatAgentDate(action?.deadlineAt, this.locale, this.timeZone)}, or change?` };
            }
            if (suppliedDeadline) {
              const updateTool = this.tools.find((candidate) => candidate.name === "record_action_update");
              if (!updateTool || !action) return { type: "message", content: agentCopy(this.locale).failed };
              const updateArguments = { ...toolArguments, resolution: typeof toolArguments.resolution === "string" ? toolArguments.resolution : action.resolution, deadlineAt: suppliedDeadline.deadlineAt };
              this.pending = { tool: updateTool, arguments: updateArguments, ...(call.id ? { callId: call.id } : {}) };
              return { type: "approval", approval: this.approvalFor(updateTool, updateArguments) };
            }
          }
          this.pending = { tool, arguments: toolArguments, ...(call.id ? { callId: call.id } : {}) };
          return { type: "approval", approval: this.approvalFor(tool, toolArguments) };
        }
        const externalTool = this.externalReadTools.find((candidate) => candidate.name === tool.name);
        if (externalTool) requestedExternalEvidence = true;
        let resolved: unknown;
        if (externalTool) {
          const previousCalls = externalCallCounts.get(tool.name) ?? 0;
          if (previousCalls >= (externalTool.maxCallsPerTurn ?? Number.POSITIVE_INFINITY)) {
            this.messages.push({ role: "tool", tool_name: tool.name, ...(call.id ? { tool_call_id: call.id } : {}), content: "This external read has already been completed for the current question. Answer using its result." });
            continue;
          }
          resolved = await externalTool.invoke(toolArguments, latestUserMessage);
          externalCallCounts.set(tool.name, previousCalls + 1);
        } else {
          const result = await this.client.callTool({ name: tool.name, arguments: toolArguments });
          resolved = "structuredContent" in result && result.structuredContent ? result.structuredContent : result.content;
        }
        for (const action of actionsFromPriorityReport(resolved)) {
          this.actionIndex.set(action.id, { title: action.title, deadlineAt: action.deadlineAt, resolution: action.resolution });
          this.actionPlotIndex.set(action.id, action.plotId);
        }
        this.messages.push({
          role: "tool",
          tool_name: tool.name,
          ...(call.id ? { tool_call_id: call.id } : {}),
          content: compactToolResult(tool.name,
            resolved)
        });
      }
      turnTools = turnTools.filter((tool) => {
        const external = this.externalReadTools.find((candidate) => candidate.name === tool.name);
        return !external || (externalCallCounts.get(tool.name) ?? 0) < (external.maxCallsPerTurn ?? Number.POSITIVE_INFINITY);
      });
      if (requestedExternalEvidence && !turnTools.some((tool) => this.externalReadTools.some((external) => external.name === tool.name)) && !writeRequested) {
        turnTools = [];
        this.messages.push({ role: "system", content: "Retrieval is complete. Now answer the user's exact question directly with a conclusion, supporting sources, and material uncertainty. Do not describe tool usage as the answer." });
      }
    }
    throw new Error(`O agente local excedeu ${this.maxTurns} rodadas de ferramentas. Nada foi alterado; reformule o pedido em partes menores.`);
  }

  private refreshTools(): void {
    // External adapters are constructed only from read-only MCP descriptors by the
    // server host. Keeping them separate means Trama remains the sole write path.
    this.tools = [...selectTools(this.allTools, this.writeMode), ...this.externalReadTools];
  }
}
